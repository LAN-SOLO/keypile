use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;
use zeroize::Zeroize;

use keypile_core::crypto::KdfParams;
use keypile_core::generator::{PassphraseOptions, PasswordOptions};
use keypile_core::model::{Attachment, CustomField, Entry, EntryHistory, Folder, Vault, CATEGORIES};
use keypile_core::{format, generator, import, strength, totp};

use crate::pwned;
use crate::settings::{self, Settings};
use crate::state::{self, AppState, Session};

const MAX_HISTORY: usize = 10;

// ---------- DTOs ----------

#[derive(Serialize)]
pub struct StatusDto {
    pub locked: bool,
    pub path: Option<String>,
    pub name: Option<String>,
    pub entry_count: usize,
    pub trash_count: usize,
    pub uses_keyfile: bool,
}

#[derive(Serialize)]
pub struct EntrySummary {
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub url: Option<String>,
    pub category: String,
    pub favorite: bool,
    pub folder: Option<Uuid>,
    pub tags: Vec<String>,
    pub has_totp: bool,
    pub attachment_count: usize,
    pub archived: bool,
    pub deleted: bool,
    pub modified: String,
}

#[derive(Deserialize)]
pub struct EntryInput {
    pub id: Option<Uuid>,
    pub folder: Option<Uuid>,
    #[serde(default)]
    pub category: Option<String>,
    pub title: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub totp: Option<String>,
    #[serde(default)]
    pub custom_fields: Vec<CustomField>,
    #[serde(default)]
    pub favorite: bool,
}

fn status_of(session: &Option<Session>) -> StatusDto {
    match session {
        None => StatusDto {
            locked: true,
            path: None,
            name: None,
            entry_count: 0,
            trash_count: 0,
            uses_keyfile: false,
        },
        Some(s) => StatusDto {
            locked: false,
            path: Some(s.path.display().to_string()),
            name: Some(s.unlocked.vault.meta.name.clone()),
            entry_count: s.unlocked.vault.entries.iter().filter(|e| !e.deleted).count(),
            trash_count: s
                .unlocked
                .vault
                .entries
                .iter()
                .filter(|e| e.deleted && !e.purged)
                .count(),
            uses_keyfile: s.unlocked.header.keyfile,
        },
    }
}

fn with_session<T>(
    st: &State<'_, AppState>,
    f: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = st.session.lock().map_err(|_| "state poisoned")?;
    let session = guard.as_mut().ok_or("Tresor ist gesperrt")?;
    f(session)
}

/// Entry lookup for commands: purge tombstones are invisible to the UI.
fn find(vault: &Vault, id: Uuid) -> Result<&Entry, String> {
    vault
        .entry(id)
        .filter(|e| !e.purged)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())
}

fn find_mut(vault: &mut Vault, id: Uuid) -> Result<&mut Entry, String> {
    vault
        .entry_mut(id)
        .filter(|e| !e.purged)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())
}

/// Run CPU-/IO-heavy work (Argon2, file IO) on the blocking pool so the
/// window never freezes — sync Tauri commands would run on the main thread.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Interner Fehler: {e}"))?
}

fn read_keyfile(path: &Option<String>) -> Result<Option<Vec<u8>>, String> {
    match path {
        None => Ok(None),
        Some(p) => std::fs::read(p)
            .map(Some)
            .map_err(|e| format!("Schlüsseldatei konnte nicht gelesen werden: {e}")),
    }
}

// ---------- settings ----------

#[tauri::command(async)]
pub fn get_settings(app: tauri::AppHandle) -> Settings {
    settings::load(&app)
}

/// Store the user-editable settings. `recent_vaults` and `device_id` are
/// owned by the backend: the UI holds a snapshot that goes stale as soon as a
/// vault is opened, so writing it back would drop recent entries (or, worse,
/// change the device id that version vectors rely on).
#[tauri::command(async)]
pub fn set_settings(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    new_settings: Settings,
) -> Settings {
    let stored = settings::update(&app, |current| {
        let mut next = new_settings;
        next.recent_vaults = std::mem::take(&mut current.recent_vaults);
        next.device_id = std::mem::take(&mut current.device_id);
        next.auto_lock_minutes = next.auto_lock_minutes.min(24 * 60);
        next.clipboard_clear_seconds = next.clipboard_clear_seconds.min(3600);
        if next.language != "de" && next.language != "en" {
            next.language = "en".into();
        }
        if next.theme != "dark" && next.theme != "light" {
            next.theme = "dark".into();
        }
        *current = next;
        current.clone()
    });
    if let Ok(mut guard) = st.session.lock() {
        if let Some(s) = guard.as_mut() {
            s.conflict_label = state::conflict_label(&stored.language);
        }
    }
    stored
}

#[tauri::command(async)]
pub fn forget_recent_vault(app: tauri::AppHandle, path: String) -> Settings {
    settings::update(&app, |s| {
        s.recent_vaults.retain(|p| !settings::same_path(p, &path));
        s.clone()
    })
}

// ---------- vault lifecycle ----------

#[tauri::command]
pub async fn create_vault(
    app: tauri::AppHandle,
    path: String,
    name: String,
    password: String,
    keyfile_path: Option<String>,
) -> Result<StatusDto, String> {
    blocking(move || create_vault_blocking(app, path, name, password, keyfile_path)).await
}

fn create_vault_blocking(
    app: tauri::AppHandle,
    path: String,
    name: String,
    mut password: String,
    keyfile_path: Option<String>,
) -> Result<StatusDto, String> {
    let st = app.state::<AppState>();
    if password.len() < 8 {
        password.zeroize();
        return Err("Das Master-Passwort muss mindestens 8 Zeichen haben".into());
    }
    let keyfile = match read_keyfile(&keyfile_path) {
        Ok(k) => k,
        Err(e) => {
            password.zeroize();
            return Err(e);
        }
    };
    let name = if name.trim().is_empty() { "keypile".to_string() } else { name.trim().to_string() };
    let vault = Vault::new(&name);
    let created = format::create(&vault, &password, keyfile.as_deref(), KdfParams::default());
    password.zeroize();
    let (bytes, unlocked) = created.map_err(|e| e.to_string())?;
    let pb = PathBuf::from(&path);
    state::atomic_write(&pb, &bytes).map_err(|e| format!("Konnte Tresor nicht anlegen: {e}"))?;
    let session = Session {
        path: pb,
        unlocked,
        disk_hash: state::file_hash(&bytes),
        conflict_label: state::conflict_label(&settings::load(&app).language),
    };
    settings::remember_vault(&app, &path);
    let mut guard = st.session.lock().map_err(|_| "state poisoned")?;
    *guard = Some(session);
    Ok(status_of(&guard))
}

#[tauri::command]
pub async fn open_vault(
    app: tauri::AppHandle,
    path: String,
    password: String,
    keyfile_path: Option<String>,
) -> Result<StatusDto, String> {
    blocking(move || open_vault_blocking(app, path, password, keyfile_path)).await
}

fn open_vault_blocking(
    app: tauri::AppHandle,
    path: String,
    mut password: String,
    keyfile_path: Option<String>,
) -> Result<StatusDto, String> {
    let st = app.state::<AppState>();
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            password.zeroize();
            return Err(format!("Datei konnte nicht gelesen werden: {e}"));
        }
    };
    let keyfile = match read_keyfile(&keyfile_path) {
        Ok(k) => k,
        Err(e) => {
            password.zeroize();
            return Err(e);
        }
    };
    let opened = format::open(&bytes, &password, keyfile.as_deref());
    password.zeroize();
    let unlocked = opened.map_err(|e| e.to_string())?;
    let session = Session {
        path: PathBuf::from(&path),
        unlocked,
        disk_hash: state::file_hash(&bytes),
        conflict_label: state::conflict_label(&settings::load(&app).language),
    };
    settings::remember_vault(&app, &path);
    let mut guard = st.session.lock().map_err(|_| "state poisoned")?;
    *guard = Some(session);
    Ok(status_of(&guard))
}

#[tauri::command(async)]
pub fn lock_vault(app: tauri::AppHandle, st: State<'_, AppState>) -> Result<(), String> {
    // UnlockedVault's key is Zeroizing and Session::drop wipes the decrypted
    // secrets — dropping the session is the lock.
    if let Ok(mut guard) = st.session.lock() {
        *guard = None;
    }
    // a secret copied from this vault must not outlive the lock
    clear_clipboard_if_ours(&app);
    Ok(())
}

#[tauri::command(async)]
pub fn vault_status(st: State<'_, AppState>) -> Result<StatusDto, String> {
    let guard = st.session.lock().map_err(|_| "state poisoned")?;
    Ok(status_of(&guard))
}

// ---------- entries ----------

#[tauri::command(async)]
pub fn list_entries(st: State<'_, AppState>) -> Result<Vec<EntrySummary>, String> {
    with_session(&st, |s| {
        let mut list: Vec<EntrySummary> = s
            .unlocked
            .vault
            .entries
            .iter()
            .filter(|e| !e.purged)
            .map(|e| EntrySummary {
                id: e.id,
                title: e.title.clone(),
                username: e.username.clone(),
                url: e.urls.first().cloned(),
                category: e.category.clone(),
                favorite: e.favorite,
                folder: e.folder,
                tags: e.tags.clone(),
                has_totp: e.totp.is_some(),
                attachment_count: e.attachments.len(),
                archived: e.archived,
                deleted: e.deleted,
                modified: e.modified.to_rfc3339(),
            })
            .collect();
        list.sort_by_cached_key(|e| e.title.to_lowercase());
        Ok(list)
    })
}

#[tauri::command(async)]
pub fn get_entry(st: State<'_, AppState>, id: Uuid) -> Result<Entry, String> {
    with_session(&st, |s| {
        let mut e = find(&s.unlocked.vault, id)?.clone();
        // strip attachment bytes — the UI gets metadata only and pulls file
        // contents via save_attachment when the user exports one
        for a in &mut e.attachments {
            a.data = String::new();
        }
        Ok(e)
    })
}

#[tauri::command(async)]
pub fn save_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    input: EntryInput,
) -> Result<Entry, String> {
    let device_id = settings::load(&app).device_id;
    // validate TOTP up front so broken secrets never enter the vault
    if let Some(t) = input.totp.as_deref().filter(|t| !t.trim().is_empty()) {
        totp::parse(t).map_err(|e| e.to_string())?;
    }
    with_session(&st, |s| {
        let vault = &mut s.unlocked.vault;
        let existing = match input.id {
            Some(id) => match vault.entry_mut(id) {
                // edited elsewhere and purged meanwhile — never resurrect
                Some(e) if e.purged => return Err("Eintrag nicht gefunden".into()),
                other => other,
            },
            None => None,
        };
        let entry = match existing {
            Some(existing) => {
                if existing.password != input.password {
                    if !existing.password.is_empty() {
                        existing.history.insert(
                            0,
                            EntryHistory {
                                password: existing.password.clone(),
                                replaced: chrono::Utc::now(),
                            },
                        );
                        existing.history.truncate(MAX_HISTORY);
                    }
                    // also when a password is set for the first time — the
                    // age audit would otherwise count from the creation date
                    existing.password_changed =
                        (!input.password.is_empty()).then(chrono::Utc::now);
                }
                if let Some(cat) = &input.category {
                    existing.category = normalize_category(cat);
                }
                existing.folder = input.folder;
                existing.title = input.title;
                existing.username = input.username;
                existing.password = input.password;
                existing.urls = input.urls;
                existing.notes = input.notes;
                existing.tags = input.tags;
                existing.totp = input.totp.filter(|t| !t.trim().is_empty());
                existing.custom_fields = input.custom_fields;
                existing.favorite = input.favorite;
                existing.touch(&device_id);
                existing.clone()
            }
            None => {
                let mut e = Entry::new(&input.title);
                if let Some(cat) = &input.category {
                    e.category = normalize_category(cat);
                }
                e.folder = input.folder;
                e.username = input.username;
                e.password = input.password;
                e.urls = input.urls;
                e.notes = input.notes;
                e.tags = input.tags;
                e.totp = input.totp.filter(|t| !t.trim().is_empty());
                e.custom_fields = input.custom_fields;
                e.favorite = input.favorite;
                if !e.password.is_empty() {
                    e.password_changed = Some(chrono::Utc::now());
                }
                e.touch(&device_id);
                vault.entries.push(e.clone());
                e
            }
        };
        state::persist(s)?;
        // like get_entry: attachment bytes never travel to the UI
        let mut entry = entry;
        for a in &mut entry.attachments {
            a.data = String::new();
        }
        Ok(entry)
    })
}

fn normalize_category(cat: &str) -> String {
    if CATEGORIES.contains(&cat) {
        cat.to_string()
    } else {
        "misc".to_string()
    }
}

fn set_deleted(
    app: &tauri::AppHandle,
    st: &State<'_, AppState>,
    id: Uuid,
    deleted: bool,
) -> Result<(), String> {
    let device_id = settings::load(app).device_id;
    with_session(st, |s| {
        let e = find_mut(&mut s.unlocked.vault, id)?;
        e.deleted = deleted;
        e.deleted_at = deleted.then(chrono::Utc::now);
        e.touch(&device_id);
        state::persist(s)?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn delete_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    set_deleted(&app, &st, id, true)
}

#[tauri::command(async)]
pub fn restore_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    set_deleted(&app, &st, id, false)
}

/// Permanent delete keeps a content-free tombstone (see `Entry::purge`) so the
/// deletion syncs to other devices instead of the entry coming back.
#[tauri::command(async)]
pub fn purge_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    let device_id = settings::load(&app).device_id;
    with_session(&st, |s| {
        find_mut(&mut s.unlocked.vault, id)?.purge(&device_id);
        state::persist(s)?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn empty_trash(app: tauri::AppHandle, st: State<'_, AppState>) -> Result<(), String> {
    let device_id = settings::load(&app).device_id;
    with_session(&st, |s| {
        for e in s.unlocked.vault.entries.iter_mut() {
            if e.deleted && !e.purged {
                e.purge(&device_id);
            }
        }
        state::persist(s)?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn set_archived(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
    archived: bool,
) -> Result<(), String> {
    let device_id = settings::load(&app).device_id;
    with_session(&st, |s| {
        let e = find_mut(&mut s.unlocked.vault, id)?;
        e.archived = archived;
        e.touch(&device_id);
        state::persist(s)?;
        Ok(())
    })
}

// ---------- attachments ----------

const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024;

#[tauri::command(async)]
pub fn add_attachment(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
    file_path: String,
) -> Result<Entry, String> {
    use base64::Engine;
    let device_id = settings::load(&app).device_id;
    let meta = std::fs::metadata(&file_path)
        .map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
    if meta.len() > MAX_ATTACHMENT_BYTES {
        return Err("Anhänge sind auf 10 MB begrenzt".into());
    }
    let bytes =
        std::fs::read(&file_path).map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
    let name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Anhang")
        .to_string();
    with_session(&st, |s| {
        let mut copy = {
            let e = find_mut(&mut s.unlocked.vault, id)?;
            e.attachments.push(Attachment {
                id: Uuid::new_v4(),
                name,
                data: base64::engine::general_purpose::STANDARD.encode(&bytes),
                size: meta.len(),
            });
            e.touch(&device_id);
            e.clone()
        };
        state::persist(s)?;
        for a in &mut copy.attachments {
            a.data = String::new();
        }
        Ok(copy)
    })
}

#[tauri::command(async)]
pub fn remove_attachment(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
    attachment_id: Uuid,
) -> Result<(), String> {
    let device_id = settings::load(&app).device_id;
    with_session(&st, |s| {
        let e = find_mut(&mut s.unlocked.vault, id)?;
        e.attachments.retain(|a| a.id != attachment_id);
        e.touch(&device_id);
        state::persist(s)?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn save_attachment(
    st: State<'_, AppState>,
    id: Uuid,
    attachment_id: Uuid,
    dest_path: String,
) -> Result<(), String> {
    use base64::Engine;
    with_session(&st, |s| {
        let e = find(&s.unlocked.vault, id)?;
        let a = e
            .attachments
            .iter()
            .find(|a| a.id == attachment_id)
            .ok_or("Anhang nicht gefunden")?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&a.data)
            .map_err(|_| "Anhang ist beschädigt")?;
        std::fs::write(&dest_path, bytes).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
        Ok(())
    })
}

// ---------- folders ----------

#[tauri::command(async)]
pub fn list_folders(st: State<'_, AppState>) -> Result<Vec<Folder>, String> {
    with_session(&st, |s| {
        Ok(s.unlocked
            .vault
            .folders
            .iter()
            .filter(|f| !f.deleted)
            .cloned()
            .collect())
    })
}

#[tauri::command(async)]
pub fn save_folder(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Option<Uuid>,
    name: String,
) -> Result<Folder, String> {
    let device_id = settings::load(&app).device_id;
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Ordnername darf nicht leer sein".into());
    }
    with_session(&st, |s| {
        let folder = match id.and_then(|id| s.unlocked.vault.folders.iter_mut().find(|f| f.id == id))
        {
            Some(f) => {
                f.name = name;
                *f.vv.entry(device_id.clone()).or_insert(0) += 1;
                f.clone()
            }
            None => {
                let f = Folder {
                    id: Uuid::new_v4(),
                    name,
                    parent: None,
                    deleted: false,
                    vv: [(device_id.clone(), 1u64)].into_iter().collect(),
                };
                s.unlocked.vault.folders.push(f.clone());
                f
            }
        };
        state::persist(s)?;
        Ok(folder)
    })
}

#[tauri::command(async)]
pub fn delete_folder(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    let device_id = settings::load(&app).device_id;
    with_session(&st, |s| {
        for e in s.unlocked.vault.entries.iter_mut() {
            if e.folder == Some(id) {
                e.folder = None;
                e.touch(&device_id);
            }
        }
        if let Some(f) = s.unlocked.vault.folders.iter_mut().find(|f| f.id == id) {
            f.deleted = true;
            *f.vv.entry(device_id.clone()).or_insert(0) += 1;
        }
        state::persist(s)?;
        Ok(())
    })
}

// ---------- generator / strength / totp ----------

#[tauri::command]
pub fn generate_password(options: PasswordOptions) -> String {
    generator::generate_password(&options)
}

#[tauri::command]
pub fn generate_passphrase(options: PassphraseOptions) -> String {
    generator::generate_passphrase(&options)
}

#[tauri::command(async)]
pub fn password_strength(password: String, context: Vec<String>) -> strength::Strength {
    let refs: Vec<&str> = context.iter().map(String::as_str).collect();
    strength::estimate(&password, &refs)
}

#[derive(Serialize)]
pub struct TotpDto {
    pub code: String,
    pub remaining: u64,
    pub period: u64,
}

#[tauri::command(async)]
pub fn totp_code(st: State<'_, AppState>, id: Uuid) -> Result<TotpDto, String> {
    with_session(&st, |s| {
        let e = find(&s.unlocked.vault, id)?;
        let secret = e.totp.as_deref().ok_or("Eintrag hat kein TOTP")?;
        let config = totp::parse(secret).map_err(|e| e.to_string())?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();
        let (code, remaining) = totp::code_at(&config, now);
        Ok(TotpDto {
            code,
            remaining,
            period: config.period,
        })
    })
}

// ---------- clipboard ----------

/// Put a secret on the clipboard, flagged so clipboard histories skip it:
/// Windows (Win+V history and cloud clipboard) via the documented
/// `CanIncludeInClipboardHistory`/`CanUploadToCloudClipboard` formats,
/// macOS clipboard managers via `org.nspasteboard.ConcealedType`.
fn write_secret(app: &tauri::AppHandle, text: &str) -> Result<(), String> {
    #[cfg(any(target_os = "macos", windows))]
    {
        let _ = app;
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        let set = cb.set();
        #[cfg(target_os = "macos")]
        let set = {
            use arboard::SetExtApple;
            set.exclude_from_history()
        };
        #[cfg(windows)]
        let set = {
            use arboard::SetExtWindows;
            set.exclude_from_history().exclude_from_cloud()
        };
        set.text(text).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        // Linux/X11: the plugin keeps the clipboard owner alive
        app.clipboard().write_text(text.to_string()).map_err(|e| e.to_string())
    }
}

fn copy_with_autoclear(app: tauri::AppHandle, mut text: String) -> Result<(), String> {
    let hash = state::file_hash(text.as_bytes());
    let written = write_secret(&app, &text);
    text.zeroize();
    written.map_err(|e| format!("Zwischenablage nicht verfügbar: {e}"))?;
    if let Ok(mut h) = app.state::<AppState>().clipboard_hash.lock() {
        *h = Some(hash);
    }
    let clear_after = settings::load(&app).clipboard_clear_seconds;
    if clear_after > 0 {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(clear_after as u64)).await;
            // only clear if the clipboard still holds what we put there
            if let Ok(current) = app.clipboard().read_text() {
                if state::file_hash(current.as_bytes()) == hash {
                    let _ = app.clipboard().write_text(String::new());
                }
            }
        });
    }
    Ok(())
}

/// Wipe the clipboard if it still holds the last secret keypile copied
/// (called on lock and when the app quits).
pub fn clear_clipboard_if_ours(app: &tauri::AppHandle) {
    let st = app.state::<AppState>();
    let Some(hash) = st.clipboard_hash.lock().ok().and_then(|mut h| h.take()) else {
        return;
    };
    if let Ok(current) = app.clipboard().read_text() {
        if state::file_hash(current.as_bytes()) == hash {
            let _ = app.clipboard().write_text(String::new());
        }
    }
}

/// Copy an arbitrary secret handed over from the UI (e.g. generator output).
#[tauri::command(async)]
pub fn copy_secret(app: tauri::AppHandle, text: String) -> Result<(), String> {
    copy_with_autoclear(app, text)
}

// ---------- health / pwned ----------

#[derive(Serialize)]
pub struct AuditDto {
    pub total: usize,
    pub weak: Vec<WeakDto>,
    pub reused: Vec<Vec<Uuid>>,
    /// password age buckets (by last password change, falling back to created)
    pub age_3_6m: Vec<Uuid>,
    pub age_6_12m: Vec<Uuid>,
    pub age_1_3y: Vec<Uuid>,
    pub age_3y: Vec<Uuid>,
    /// entries that have a TOTP secret configured
    pub with_totp: Vec<Uuid>,
    pub without_totp: usize,
    pub with_attachments: usize,
    pub passkeys: usize,
}

#[derive(Serialize)]
pub struct WeakDto {
    pub id: Uuid,
    pub score: u8,
}

#[tauri::command(async)]
pub fn audit_report(st: State<'_, AppState>) -> Result<AuditDto, String> {
    with_session(&st, |s| {
        let now = chrono::Utc::now();
        let entries: Vec<&Entry> = s
            .unlocked
            .vault
            .entries
            .iter()
            .filter(|e| !e.deleted && !e.archived)
            .collect();

        let mut report = AuditDto {
            total: entries.len(),
            weak: Vec::new(),
            reused: Vec::new(),
            age_3_6m: Vec::new(),
            age_6_12m: Vec::new(),
            age_1_3y: Vec::new(),
            age_3y: Vec::new(),
            with_totp: Vec::new(),
            without_totp: 0,
            with_attachments: 0,
            passkeys: 0,
        };
        let mut by_password: HashMap<&str, Vec<Uuid>> = HashMap::new();

        for e in &entries {
            if e.totp.is_some() {
                report.with_totp.push(e.id);
            } else {
                report.without_totp += 1;
            }
            if !e.attachments.is_empty() {
                report.with_attachments += 1;
            }
            if e.passkey.is_some() {
                report.passkeys += 1;
            }
            if e.password.is_empty() {
                continue;
            }
            let est = strength::estimate(&e.password, &[&e.username, &e.title]);
            if est.score <= 2 {
                report.weak.push(WeakDto {
                    id: e.id,
                    score: est.score,
                });
            }
            by_password.entry(e.password.as_str()).or_default().push(e.id);
            let age_days = (now - e.password_changed.unwrap_or(e.created)).num_days();
            match age_days {
                90..=179 => report.age_3_6m.push(e.id),
                180..=364 => report.age_6_12m.push(e.id),
                365..=1094 => report.age_1_3y.push(e.id),
                d if d >= 1095 => report.age_3y.push(e.id),
                _ => {}
            }
        }
        report.reused = by_password
            .into_values()
            .filter(|ids| ids.len() >= 2)
            .collect();
        Ok(report)
    })
}

#[derive(Serialize)]
pub struct PwnedDto {
    pub id: Uuid,
    pub count: u64,
}

#[tauri::command]
pub async fn check_pwned(st: State<'_, AppState>) -> Result<Vec<PwnedDto>, String> {
    // collect (id, password) pairs, then DROP the lock before any await
    let pairs: Vec<(Uuid, String)> = {
        let guard = st.session.lock().map_err(|_| "state poisoned")?;
        let s = guard.as_ref().ok_or("Tresor ist gesperrt")?;
        s.unlocked
            .vault
            .entries
            .iter()
            .filter(|e| !e.deleted && !e.archived && !e.password.is_empty())
            .map(|e| (e.id, e.password.clone()))
            .collect()
    };
    let unique: Vec<String> = {
        let mut set: Vec<String> = pairs.iter().map(|(_, p)| p.clone()).collect();
        set.sort();
        set.dedup();
        set
    };
    let counts = pwned::check_passwords(&unique).await?;
    Ok(pairs
        .into_iter()
        .filter_map(|(id, pw)| counts.get(&pw).map(|&count| PwnedDto { id, count }))
        .collect())
}

// ---------- import / export ----------

#[derive(Serialize)]
pub struct ImportDto {
    pub added: usize,
    pub folders: usize,
    pub skipped: usize,
}

#[tauri::command(async)]
pub fn import_file(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    path: String,
) -> Result<ImportDto, String> {
    let device_id = settings::load(&app).device_id;
    let bytes =
        std::fs::read(&path).map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
    let data = String::from_utf8(bytes).map_err(|_| {
        "Die Datei ist nicht UTF-8-kodiert — bitte als UTF-8-CSV exportieren".to_string()
    })?;
    let result = if path.to_lowercase().ends_with(".json") {
        import::import_bitwarden_json(&data, &device_id)
    } else {
        import::import_csv(&data, &device_id)
    }
    .map_err(|e| e.to_string())?;

    with_session(&st, |s| {
        let vault = &mut s.unlocked.vault;
        // reuse folders with identical names instead of duplicating them
        let mut folder_remap: HashMap<Uuid, Uuid> = HashMap::new();
        let mut new_folders = 0;
        for f in result.folders {
            match vault
                .folders
                .iter()
                .find(|v| !v.deleted && v.name == f.name)
            {
                Some(existing) => {
                    folder_remap.insert(f.id, existing.id);
                }
                None => {
                    vault.folders.push(f);
                    new_folders += 1;
                }
            }
        }
        let added = result.entries.len();
        for mut e in result.entries {
            if let Some(fid) = e.folder {
                if let Some(mapped) = folder_remap.get(&fid) {
                    e.folder = Some(*mapped);
                }
            }
            vault.entries.push(e);
        }
        state::persist(s)?;
        Ok(ImportDto {
            added,
            folders: new_folders,
            skipped: result.skipped,
        })
    })
}

#[tauri::command(async)]
pub fn export_csv_file(st: State<'_, AppState>, path: String) -> Result<usize, String> {
    with_session(&st, |s| {
        let csv = import::export_csv(&s.unlocked.vault).map_err(|e| e.to_string())?;
        let count = s.unlocked.vault.entries.iter().filter(|e| !e.deleted).count();
        std::fs::write(&path, csv).map_err(|e| format!("Export fehlgeschlagen: {e}"))?;
        Ok(count)
    })
}

// ---------- master password ----------

#[tauri::command]
pub async fn change_master_password(
    app: tauri::AppHandle,
    current_password: String,
    new_password: String,
    current_keyfile_path: Option<String>,
    new_keyfile_path: Option<String>,
) -> Result<(), String> {
    blocking(move || {
        change_master_blocking(
            app,
            current_password,
            new_password,
            current_keyfile_path,
            new_keyfile_path,
        )
    })
    .await
}

/// Two Argon2 runs happen WITHOUT holding the session lock (other commands,
/// the TOTP ticker and locking stay responsive). Before re-keying, the
/// session is checked again: if the vault was locked or swapped meanwhile,
/// nothing is changed.
fn change_master_blocking(
    app: tauri::AppHandle,
    mut current_password: String,
    mut new_password: String,
    current_keyfile_path: Option<String>,
    new_keyfile_path: Option<String>,
) -> Result<(), String> {
    use base64::Engine;
    let st = app.state::<AppState>();
    let wipe = |a: &mut String, b: &mut String| {
        a.zeroize();
        b.zeroize();
    };
    if new_password.len() < 8 {
        wipe(&mut current_password, &mut new_password);
        return Err("Das neue Master-Passwort muss mindestens 8 Zeichen haben".into());
    }
    let keyfiles = read_keyfile(&current_keyfile_path)
        .and_then(|c| read_keyfile(&new_keyfile_path).map(|n| (c, n)));
    let (current_keyfile, new_keyfile) = match keyfiles {
        Ok(k) => k,
        Err(e) => {
            wipe(&mut current_password, &mut new_password);
            return Err(e);
        }
    };
    // snapshot what the KDF needs, then release the lock
    let snapshot = with_session(&st, |s| {
        Ok((
            s.path.clone(),
            s.unlocked.header.salt.clone(),
            s.unlocked.header.kdf.clone(),
            zeroize::Zeroizing::new(*s.unlocked.key),
        ))
    });
    let (path, salt_b64, kdf, live_key) = match snapshot {
        Ok(x) => x,
        Err(e) => {
            wipe(&mut current_password, &mut new_password);
            return Err(e);
        }
    };
    let derived = (|| {
        let salt = base64::engine::general_purpose::STANDARD
            .decode(&salt_b64)
            .map_err(|_| "Header beschädigt".to_string())?;
        let check = keypile_core::crypto::derive_key(
            &current_password,
            current_keyfile.as_deref(),
            &salt,
            &kdf,
        )
        .map_err(|e| e.to_string())?;
        if !keypile_core::crypto::ct_eq(check.as_slice(), live_key.as_slice()) {
            return Err("Aktuelles Master-Passwort (oder Schlüsseldatei) ist falsch".to_string());
        }
        let new_salt = keypile_core::crypto::random_bytes(keypile_core::crypto::SALT_LEN);
        let new_key =
            keypile_core::crypto::derive_key(&new_password, new_keyfile.as_deref(), &new_salt, &kdf)
                .map_err(|e| e.to_string())?;
        Ok((new_key, base64::engine::general_purpose::STANDARD.encode(&new_salt)))
    })();
    wipe(&mut current_password, &mut new_password);
    let (new_key, new_salt_b64) = derived?;
    with_session(&st, |s| {
        if s.path != path || !keypile_core::crypto::ct_eq(s.unlocked.key.as_slice(), live_key.as_slice()) {
            return Err("Tresor ist gesperrt".into());
        }
        state::rekey(s, new_key, new_salt_b64, new_keyfile.is_some())
    })
}

// ---------- updater ----------

#[derive(Serialize)]
pub struct UpdateInfoDto {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

/// Check GitHub Releases (latest.json) for a newer version. Returns None when
/// the app is up to date or the endpoint is unreachable (fails soft).
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfoDto>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfoDto {
            version: update.version.clone(),
            notes: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Update-Prüfung fehlgeschlagen: {e}")),
    }
}

/// Download, verify (signed) and install the update in place, then relaunch.
/// The vault files and settings live outside the app bundle and are untouched.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update-Prüfung fehlgeschlagen: {e}"))?
        .ok_or("Kein Update verfügbar")?;
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Update fehlgeschlagen: {e}"))?;
    // On Windows the installer step ends the process via std::process::exit —
    // RunEvent::Exit never fires there, so wipe a copied secret now.
    clear_clipboard_if_ours(&app);
    update
        .install(bytes)
        .map_err(|e| format!("Update fehlgeschlagen: {e}"))?;
    app.restart();
}

/// Copy a field of an entry to the clipboard WITHOUT routing the secret
/// through the frontend.
#[tauri::command(async)]
pub fn copy_entry_field(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
    field: String,
) -> Result<(), String> {
    let text = with_session(&st, |s| {
        let e = find(&s.unlocked.vault, id)?;
        match field.as_str() {
            "username" => Ok(e.username.clone()),
            "password" => Ok(e.password.clone()),
            "totp" => {
                let secret = e.totp.as_deref().ok_or("Eintrag hat kein TOTP")?;
                let config = totp::parse(secret).map_err(|e| e.to_string())?;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_secs();
                Ok(totp::code_at(&config, now).0)
            }
            other => Err(format!("Unbekanntes Feld '{other}'")),
        }
    })?;
    copy_with_autoclear(app, text)
}
