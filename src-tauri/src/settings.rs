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

pub fn load(app: &tauri::AppHandle) -> Settings {
    std::fs::read_to_string(settings_path(app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn store(app: &tauri::AppHandle, settings: &Settings) {
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(settings_path(app), json);
    }
}

pub fn remember_vault(app: &tauri::AppHandle, path: &str) {
    let mut s = load(app);
    s.recent_vaults.retain(|p| p != path);
    s.recent_vaults.insert(0, path.to_string());
    s.recent_vaults.truncate(8);
    store(app, &s);
}
