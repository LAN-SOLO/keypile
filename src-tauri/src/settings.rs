//! Non-secret app settings, stored as JSON in the OS config directory.
//! Nothing security-critical lives here — the vault file is self-contained.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// "de" | "en"
    pub language: String,
    /// Auto-lock after N minutes of inactivity (0 = never).
    pub auto_lock_minutes: u32,
    /// Clear copied secrets from the clipboard after N seconds (0 = never).
    pub clipboard_clear_seconds: u32,
    /// Lock the vault when the window loses focus.
    pub lock_on_blur: bool,
    /// Recently opened vault files, newest first.
    pub recent_vaults: Vec<String>,
    /// Random id identifying this installation in version vectors (not secret,
    /// never leaves the vault file).
    pub device_id: String,
    /// Darstellung: "dark" | "light" (Default dunkel — bestehende
    /// settings.json ohne das Feld laden weiterhin).
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_theme() -> String {
    "dark".into()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            language: if sys_locale_is_german() { "de" } else { "en" }.into(),
            auto_lock_minutes: 10,
            clipboard_clear_seconds: 30,
            lock_on_blur: false,
            recent_vaults: Vec::new(),
            device_id: format!("kp-{}", uuid::Uuid::new_v4().simple()),
            theme: default_theme(),
        }
    }
}

fn sys_locale_is_german() -> bool {
    std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .map(|l| l.to_lowercase().starts_with("de"))
        .unwrap_or(false)
}

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}

/// Commands run concurrently (async), so every read-modify-write of the
/// settings file goes through this lock — otherwise "remember vault" and
/// "save settings" could overwrite each other.
static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn parse(path: &std::path::Path) -> Option<Settings> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
}

fn read(path: &std::path::Path) -> Settings {
    parse(path).unwrap_or_default()
}

/// Temp file + rename: a crash mid-write must not leave a truncated
/// settings.json behind (that would reset the device id used for sync).
fn write(path: &std::path::Path, settings: &Settings) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    crate::state::rename_with_retry(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = settings_path(app);
    match parse(&path) {
        Some(s) => s,
        None => {
            // missing or unreadable: persist the defaults right away — the
            // random device id must stay the same across calls, or every edit
            // would count as another device
            let s = Settings::default();
            let _ = write(&path, &s);
            s
        }
    }
}

/// Atomically load, change and store the settings.
pub fn update<T>(app: &tauri::AppHandle, f: impl FnOnce(&mut Settings) -> T) -> T {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = settings_path(app);
    let mut s = read(&path);
    let out = f(&mut s);
    let _ = write(&path, &s);
    out
}

/// Same file on Windows (NTFS) regardless of letter case; elsewhere exact.
pub fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.replace('/', "\\").to_lowercase() == b.replace('/', "\\").to_lowercase()
    } else {
        a == b
    }
}

pub fn push_recent(list: &mut Vec<String>, path: &str) {
    list.retain(|p| !same_path(p, path));
    list.insert(0, path.to_string());
    list.truncate(8);
}

pub fn remember_vault(app: &tauri::AppHandle, path: &str) {
    update(app, |s| push_recent(&mut s.recent_vaults, path));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_list_dedupes_and_caps() {
        let mut l = Vec::new();
        for i in 0..10 {
            push_recent(&mut l, &format!("/v/{i}.keypile"));
        }
        push_recent(&mut l, "/v/5.keypile");
        assert_eq!(l.len(), 8);
        assert_eq!(l[0], "/v/5.keypile");
        assert_eq!(l.iter().filter(|p| *p == "/v/5.keypile").count(), 1);
    }

    #[test]
    fn same_path_rules() {
        assert!(same_path("C:\\Users\\a.keypile", "C:\\Users\\a.keypile"));
        if cfg!(windows) {
            assert!(same_path("C:\\Users\\A.keypile", "c:/users/a.keypile"));
        } else {
            assert!(!same_path("/Users/A.keypile", "/Users/a.keypile"));
        }
    }

    #[test]
    fn settings_file_roundtrip_with_bom_and_garbage() {
        let dir = std::env::temp_dir().join(format!("keypile-settings-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("settings.json");
        let s = Settings { language: "de".into(), ..Settings::default() };
        write(&p, &s).unwrap();
        assert!(!dir.join("settings.json.tmp").exists());
        assert_eq!(read(&p).language, "de");
        // Notepad on Windows may save with a BOM
        let raw = std::fs::read_to_string(&p).unwrap();
        std::fs::write(&p, format!("\u{feff}{raw}")).unwrap();
        assert_eq!(read(&p).device_id, s.device_id);
        // a broken file falls back to defaults instead of crashing
        std::fs::write(&p, "{ nope").unwrap();
        assert_eq!(read(&p).auto_lock_minutes, 10);
        std::fs::remove_dir_all(&dir).ok();
    }
}
