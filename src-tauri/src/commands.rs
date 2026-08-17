use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;
use zeroize::Zeroize;

use keypile_core::crypto::KdfParams;
use keypile_core::generator::{PassphraseOptions, PasswordOptions};
use keypile_core::model::{CustomField, Entry, EntryHistory, Folder, Vault};
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
    pub favorite: bool,
    pub folder: Option<Uuid>,
    pub tags: Vec<String>,
    pub has_totp: bool,
    pub deleted: bool,
    pub modified: String,
}

#[derive(Deserialize)]
pub struct EntryInput {
    pub id: Option<Uuid>,
    pub folder: Option<Uuid>,
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
            trash_count: s.unlocked.vault.entries.iter().filter(|e| e.deleted).count(),
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

fn read_keyfile(path: &Option<String>) -> Result<Option<Vec<u8>>, String> {
    match path {
        None => Ok(None),
        Some(p) => std::fs::read(p)
            .map(Some)
            .map_err(|e| format!("Schlüsseldatei konnte nicht gelesen werden: {e}")),
    }
}

// ---------- settings ----------

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Settings {
    settings::load(&app)
}

#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, new_settings: Settings) {
    settings::store(&app, &new_settings);
}

// ---------- vault lifecycle ----------

#[tauri::command]
pub fn create_vault(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    path: String,
    name: String,
    mut password: String,
    keyfile_path: Option<String>,
) -> Result<StatusDto, String> {
    if password.len() < 8 {
        password.zeroize();
        return Err("Das Master-Passwort muss mindestens 8 Zeichen haben".into());
    }
    let keyfile = read_keyfile(&keyfile_path)?;
    let vault = Vault::new(&name);
    let (bytes, unlocked) = format::create(
        &vault,
        &password,
        keyfile.as_deref(),
        KdfParams::default(),
    )
    .map_err(|e| e.to_string())?;
    password.zeroize();
    let pb = PathBuf::from(&path);
    state::atomic_write(&pb, &bytes).map_err(|e| format!("Konnte Tresor nicht anlegen: {e}"))?;
    let session = Session {
        path: pb,
        unlocked,
        disk_hash: state::file_hash(&bytes),
    };
    settings::remember_vault(&app, &path);
    let mut guard = st.session.lock().map_err(|_| "state poisoned")?;
    *guard = Some(session);
    Ok(status_of(&guard))
}

#[tauri::command]
pub fn open_vault(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    path: String,
    mut password: String,
    keyfile_path: Option<String>,
) -> Result<StatusDto, String> {
    let bytes =
        std::fs::read(&path).map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
    let keyfile = read_keyfile(&keyfile_path)?;
    let unlocked = format::open(&bytes, &password, keyfile.as_deref()).map_err(|e| e.to_string())?;
    password.zeroize();
    let session = Session {
        path: PathBuf::from(&path),
        unlocked,
        disk_hash: state::file_hash(&bytes),
    };
    settings::remember_vault(&app, &path);
    let mut guard = st.session.lock().map_err(|_| "state poisoned")?;
    *guard = Some(session);
    Ok(status_of(&guard))
}

#[tauri::command]
pub fn lock_vault(st: State<'_, AppState>) {
    // UnlockedVault's key is Zeroizing — dropping the session wipes it.
    if let Ok(mut guard) = st.session.lock() {
        *guard = None;
    }
}

#[tauri::command]
pub fn vault_status(st: State<'_, AppState>) -> Result<StatusDto, String> {
    let guard = st.session.lock().map_err(|_| "state poisoned")?;
    Ok(status_of(&guard))
}

// ---------- entries ----------

#[tauri::command]
pub fn list_entries(st: State<'_, AppState>) -> Result<Vec<EntrySummary>, String> {
    with_session(&st, |s| {
        let mut list: Vec<EntrySummary> = s
            .unlocked
            .vault
            .entries
            .iter()
            .map(|e| EntrySummary {
                id: e.id,
                title: e.title.clone(),
                username: e.username.clone(),
                url: e.urls.first().cloned(),
                favorite: e.favorite,
                folder: e.folder,
                tags: e.tags.clone(),
                has_totp: e.totp.is_some(),
                deleted: e.deleted,
                modified: e.modified.to_rfc3339(),
            })
            .collect();
        list.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Ok(list)
    })
}

#[tauri::command]
pub fn get_entry(st: State<'_, AppState>, id: Uuid) -> Result<Entry, String> {
    with_session(&st, |s| {
        s.unlocked
            .vault
            .entry(id)
            .cloned()
            .ok_or_else(|| "Eintrag nicht gefunden".into())
    })
}

#[tauri::command]
pub fn save_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    input: EntryInput,
) -> Result<Entry, String> {
    let device_id = settings::load(&app).device_id;
    with_session(&st, |s| {
        let vault = &mut s.unlocked.vault;
        let entry = match input.id.and_then(|id| vault.entry_mut(id)) {
            Some(existing) => {
                if existing.password != input.password && !existing.password.is_empty() {
                    existing.history.insert(
                        0,
                        EntryHistory {
                            password: existing.password.clone(),
                            replaced: chrono::Utc::now(),
                        },
                    );
                    existing.history.truncate(MAX_HISTORY);
                    existing.password_changed = Some(chrono::Utc::now());
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
        // validate TOTP early so broken secrets don't sit silently in the vault
        if let Some(t) = &entry.totp {
            totp::parse(t).map_err(|e| e.to_string())?;
        }
        state::persist(s)?;
        Ok(entry)
    })
}

fn set_deleted(
    app: &tauri::AppHandle,
    st: &State<'_, AppState>,
    id: Uuid,
    deleted: bool,
) -> Result<(), String> {
    let device_id = settings::load(app).device_id;
    with_session(st, |s| {
        let e = s
            .unlocked
            .vault
            .entry_mut(id)
            .ok_or("Eintrag nicht gefunden")?;
        e.deleted = deleted;
        e.deleted_at = deleted.then(chrono::Utc::now);
        e.touch(&device_id);
        state::persist(s)?;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    set_deleted(&app, &st, id, true)
}

#[tauri::command]
pub fn restore_entry(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    set_deleted(&app, &st, id, false)
}

#[tauri::command]
pub fn purge_entry(st: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    with_session(&st, |s| {
        s.unlocked.vault.entries.retain(|e| e.id != id);
        state::persist(s)?;
        Ok(())
    })
}

#[tauri::command]
pub fn empty_trash(st: State<'_, AppState>) -> Result<(), String> {
    with_session(&st, |s| {
        s.unlocked.vault.entries.retain(|e| !e.deleted);
        state::persist(s)?;
        Ok(())
    })
}

// ---------- folders ----------

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
pub fn totp_code(st: State<'_, AppState>, id: Uuid) -> Result<TotpDto, String> {
    with_session(&st, |s| {
        let e = s.unlocked.vault.entry(id).ok_or("Eintrag nicht gefunden")?;
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

fn copy_with_autoclear(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text.clone())
        .map_err(|e| e.to_string())?;
    let clear_after = settings::load(&app).clipboard_clear_seconds;
    if clear_after > 0 {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(clear_after as u64)).await;
            // only clear if the clipboard still holds what we put there
            if let Ok(current) = app.clipboard().read_text() {
                if current == text {
                    let _ = app.clipboard().write_text(String::new());
                }
            }
        });
    }
    Ok(())
}

/// Copy an arbitrary secret handed over from the UI (e.g. generator output).
#[tauri::command]
pub fn copy_secret(app: tauri::AppHandle, text: String) -> Result<(), String> {
    copy_with_autoclear(app, text)
}

// ---------- health / pwned ----------

#[derive(Serialize)]
pub struct HealthDto {
    pub weak: Vec<WeakDto>,
    pub reused: Vec<Vec<Uuid>>,
    pub old: Vec<Uuid>,
    pub no_totp_candidates: usize,
}

#[derive(Serialize)]
pub struct WeakDto {
    pub id: Uuid,
    pub score: u8,
}

#[tauri::command]
pub fn health_report(st: State<'_, AppState>) -> Result<HealthDto, String> {
    with_session(&st, |s| {
        let entries: Vec<&Entry> = s
            .unlocked
            .vault
            .entries
            .iter()
            .filter(|e| !e.deleted && !e.password.is_empty())
            .collect();

        let mut weak = Vec::new();
        let mut by_password: HashMap<&str, Vec<Uuid>> = HashMap::new();
        let mut old = Vec::new();
        let year_ago = chrono::Utc::now() - chrono::Duration::days(365);

        for e in &entries {
            let est = strength::estimate(&e.password, &[&e.username, &e.title]);
            if est.score <= 2 {
                weak.push(WeakDto {
                    id: e.id,
                    score: est.score,
                });
            }
            by_password.entry(e.password.as_str()).or_default().push(e.id);
            if e.password_changed.unwrap_or(e.created) < year_ago {
                old.push(e.id);
            }
        }
        let reused: Vec<Vec<Uuid>> = by_password
            .into_values()
            .filter(|ids| ids.len() >= 2)
            .collect();
        Ok(HealthDto {
            weak,
            reused,
            old,
            no_totp_candidates: entries.iter().filter(|e| e.totp.is_none()).count(),
        })
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
            .filter(|e| !e.deleted && !e.password.is_empty())
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

#[tauri::command]
pub fn import_file(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    path: String,
) -> Result<ImportDto, String> {
    let device_id = settings::load(&app).device_id;
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
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

#[tauri::command]
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
pub fn change_master_password(
    st: State<'_, AppState>,
    mut current_password: String,
    mut new_password: String,
    current_keyfile_path: Option<String>,
    new_keyfile_path: Option<String>,
) -> Result<(), String> {
    if new_password.len() < 8 {
        return Err("Das neue Master-Passwort muss mindestens 8 Zeichen haben".into());
    }
    let current_keyfile = read_keyfile(&current_keyfile_path)?;
    let new_keyfile = read_keyfile(&new_keyfile_path)?;
    with_session(&st, |s| {
        // verify the current credentials against the live session key
        use base64::Engine;
        let salt = base64::engine::general_purpose::STANDARD
            .decode(&s.unlocked.header.salt)
            .map_err(|_| "Header beschädigt")?;
        let check = keypile_core::crypto::derive_key(
            &current_password,
            current_keyfile.as_deref(),
            &salt,
            &s.unlocked.header.kdf,
        )
        .map_err(|e| e.to_string())?;
        current_password.zeroize();
        if check.as_slice() != s.unlocked.key.as_slice() {
            new_password.zeroize();
            return Err("Aktuelles Master-Passwort (oder Schlüsseldatei) ist falsch".into());
        }
        // fresh salt + new key
        let new_salt = keypile_core::crypto::random_bytes(keypile_core::crypto::SALT_LEN);
        let new_key = keypile_core::crypto::derive_key(
            &new_password,
            new_keyfile.as_deref(),
            &new_salt,
            &s.unlocked.header.kdf,
        )
        .map_err(|e| e.to_string())?;
        new_password.zeroize();
        s.unlocked.key = new_key;
        s.unlocked.header.salt = base64::engine::general_purpose::STANDARD.encode(&new_salt);
        s.unlocked.header.keyfile = new_keyfile.is_some();
        state::persist(s)?;
        Ok(())
    })
}

/// Copy a field of an entry to the clipboard WITHOUT routing the secret
/// through the frontend.
#[tauri::command]
pub fn copy_entry_field(
    app: tauri::AppHandle,
    st: State<'_, AppState>,
    id: Uuid,
    field: String,
) -> Result<(), String> {
    let text = with_session(&st, |s| {
        let e = s.unlocked.vault.entry(id).ok_or("Eintrag nicht gefunden")?;
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
