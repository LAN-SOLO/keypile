//! Importers: generic CSV (Chrome, KeePassXC, LastPass, Bitwarden, 1Password
//! column conventions) and Bitwarden JSON (unencrypted export). Plus CSV/JSON
//! export. KDBX-native import is on the roadmap; KeePassXC users can export
//! CSV losslessly for logins in the meantime.

use serde_json::Value;
use uuid::Uuid;

use crate::error::{CoreError, Result};
use crate::model::{Entry, Folder, Vault};

/// Map a CSV header name (lowercased, trimmed) to a canonical field.
fn canonical(header: &str) -> Option<&'static str> {
    match header.trim().to_lowercase().as_str() {
        // title
        "title" | "name" | "account" | "item" => Some("title"),
        // username
        "username" | "user" | "login" | "login_username" | "user name" | "email" => {
            Some("username")
        }
        // password
        "password" | "login_password" | "pass" => Some("password"),
        // url
        "url" | "website" | "web site" | "login_uri" | "uri" | "site" => Some("url"),
        // notes
        "notes" | "note" | "extra" | "comments" => Some("notes"),
        // totp
        "totp" | "otp" | "otpauth" | "login_totp" | "one-time password" => Some("totp"),
        // folder / group
        "group" | "grouping" | "folder" | "category" | "vault" => Some("folder"),
        "favorite" | "fav" => Some("favorite"),
        _ => None,
    }
}

pub struct ImportResult {
    pub entries: Vec<Entry>,
    pub folders: Vec<Folder>,
    pub skipped: usize,
}

/// Import CSV with a header row. Column meanings are auto-detected from the
/// header names, so Chrome/KeePassXC/LastPass/Bitwarden/1Password CSVs all work.
pub fn import_csv(data: &str, device_id: &str) -> Result<ImportResult> {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(data.as_bytes());
    let headers: Vec<Option<&'static str>> = rdr
        .headers()
        .map_err(|e| CoreError::Import(format!("CSV konnte nicht gelesen werden: {e}")))?
        .iter()
        .map(canonical)
        .collect();
    if !headers.iter().any(|h| h == &Some("password")) {
        return Err(CoreError::Import(
            "CSV hat keine erkennbare Passwort-Spalte (erwartet z. B. 'password')".into(),
        ));
    }

    let mut folders: Vec<Folder> = Vec::new();
    let mut entries = Vec::new();
    let mut skipped = 0;

    for record in rdr.records() {
        let record = match record {
            Ok(r) => r,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let mut entry = Entry::new("");
        let mut folder_name = String::new();
        for (i, field) in record.iter().enumerate() {
            let Some(Some(kind)) = headers.get(i) else {
                continue;
            };
            let v = field.trim();
            if v.is_empty() {
                continue;
            }
            match *kind {
                "title" => entry.title = v.to_string(),
                "username" if entry.username.is_empty() => entry.username = v.to_string(),
                "password" => entry.password = v.to_string(),
                "url" => entry.urls.push(v.to_string()),
                "notes" => entry.notes = v.to_string(),
                "totp" => entry.totp = Some(v.to_string()),
                "folder" => folder_name = v.to_string(),
                "favorite" => entry.favorite = v == "1" || v.eq_ignore_ascii_case("true"),
                _ => {}
            }
        }
        if entry.title.is_empty() && entry.username.is_empty() && entry.password.is_empty() {
            skipped += 1;
            continue;
        }
        if entry.title.is_empty() {
            entry.title = entry
                .urls
                .first()
                .map(|u| host_of(u))
                .unwrap_or_else(|| "Unbenannt".to_string());
        }
        if !folder_name.is_empty() && folder_name.to_lowercase() != "root" {
            let folder = match folders.iter().find(|f| f.name == folder_name) {
                Some(f) => f.id,
                None => {
                    let f = Folder {
                        id: Uuid::new_v4(),
                        name: folder_name.clone(),
                        parent: None,
                        deleted: false,
                        vv: Default::default(),
                    };
                    let id = f.id;
                    folders.push(f);
                    id
                }
            };
            entry.folder = Some(folder);
        }
        entry.touch(device_id);
        entries.push(entry);
    }
    Ok(ImportResult {
        entries,
        folders,
        skipped,
    })
}

fn host_of(url: &str) -> String {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or(url)
        .to_string()
}

/// Import an unencrypted Bitwarden/Vaultwarden JSON export.
pub fn import_bitwarden_json(data: &str, device_id: &str) -> Result<ImportResult> {
    let root: Value = serde_json::from_str(data)
        .map_err(|e| CoreError::Import(format!("kein gültiges JSON: {e}")))?;
    if root.get("encrypted").and_then(Value::as_bool) == Some(true) {
        return Err(CoreError::Import(
            "Das ist ein VERSCHLÜSSELTER Bitwarden-Export. Bitte unverschlüsselt (.json) exportieren."
                .into(),
        ));
    }
    let mut folders: Vec<Folder> = Vec::new();
    let mut folder_map: std::collections::HashMap<String, Uuid> = Default::default();
    if let Some(fs) = root.get("folders").and_then(Value::as_array) {
        for f in fs {
            let (Some(id), Some(name)) = (
                f.get("id").and_then(Value::as_str),
                f.get("name").and_then(Value::as_str),
            ) else {
                continue;
            };
            let folder = Folder {
                id: Uuid::new_v4(),
                name: name.to_string(),
                parent: None,
                deleted: false,
                vv: Default::default(),
            };
            folder_map.insert(id.to_string(), folder.id);
            folders.push(folder);
        }
    }
    let items = root
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| CoreError::Import("JSON enthält kein 'items'-Array".into()))?;

    let mut entries = Vec::new();
    let mut skipped = 0;
    for item in items {
        let get = |k: &str| item.get(k).and_then(Value::as_str).unwrap_or("");
        let mut entry = Entry::new(get("name"));
        if entry.title.is_empty() {
            entry.title = "Unbenannt".into();
        }
        entry.notes = get("notes").to_string();
        entry.favorite = item.get("favorite").and_then(Value::as_bool).unwrap_or(false);
        if let Some(fid) = item.get("folderId").and_then(Value::as_str) {
            entry.folder = folder_map.get(fid).copied();
        }
        match item.get("type").and_then(Value::as_i64).unwrap_or(1) {
            1 => {
                if let Some(login) = item.get("login") {
                    entry.username = login
                        .get("username")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    entry.password = login
                        .get("password")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    if let Some(totp) = login.get("totp").and_then(Value::as_str) {
                        entry.totp = Some(totp.to_string());
                    }
                    if let Some(uris) = login.get("uris").and_then(Value::as_array) {
                        for u in uris {
                            if let Some(uri) = u.get("uri").and_then(Value::as_str) {
                                entry.urls.push(uri.to_string());
                            }
                        }
                    }
                }
            }
            2 => { /* secure note: title+notes already set */ }
            _ => {
                // cards/identities: keep data as note so nothing is lost
                if entry.notes.is_empty() {
                    entry.notes = serde_json::to_string_pretty(item).unwrap_or_default();
                    entry.tags.push("importiert:sonstiges".into());
                }
            }
        }
        // custom fields
        if let Some(fields) = item.get("fields").and_then(Value::as_array) {
            for f in fields {
                entry.custom_fields.push(crate::model::CustomField {
                    name: f
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    value: f
                        .get("value")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    protected: f.get("type").and_then(Value::as_i64) == Some(1),
                });
            }
        }
        if entry.title == "Unbenannt" && entry.username.is_empty() && entry.password.is_empty() {
            skipped += 1;
            continue;
        }
        entry.touch(device_id);
        entries.push(entry);
    }
    Ok(ImportResult {
        entries,
        folders,
        skipped,
    })
}

/// Export the vault as CSV (KeePassXC-compatible columns).
pub fn export_csv(vault: &Vault) -> Result<String> {
    let mut wtr = csv::Writer::from_writer(Vec::new());
    wtr.write_record(["Group", "Title", "Username", "Password", "URL", "Notes", "TOTP"])
        .map_err(|e| CoreError::Import(e.to_string()))?;
    for e in vault.entries.iter().filter(|e| !e.deleted) {
        let group = e
            .folder
            .and_then(|fid| vault.folders.iter().find(|f| f.id == fid))
            .map(|f| f.name.clone())
            .unwrap_or_default();
        wtr.write_record([
            group.as_str(),
            &e.title,
            &e.username,
            &e.password,
            e.urls.first().map(String::as_str).unwrap_or(""),
            &e.notes,
            e.totp.as_deref().unwrap_or(""),
        ])
        .map_err(|e| CoreError::Import(e.to_string()))?;
    }
    String::from_utf8(
        wtr.into_inner()
            .map_err(|e| CoreError::Import(e.to_string()))?,
    )
    .map_err(|e| CoreError::Import(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrome_csv() {
        let csv = "name,url,username,password,note\nGitHub,https://github.com,alice,pw123,my note\n";
        let r = import_csv(csv, "dev").unwrap();
        assert_eq!(r.entries.len(), 1);
        let e = &r.entries[0];
        assert_eq!(e.title, "GitHub");
        assert_eq!(e.username, "alice");
        assert_eq!(e.password, "pw123");
        assert_eq!(e.urls, vec!["https://github.com"]);
        assert_eq!(e.notes, "my note");
    }

    #[test]
    fn keepassxc_csv_with_group_and_totp() {
        let csv = "\"Group\",\"Title\",\"Username\",\"Password\",\"URL\",\"Notes\",\"TOTP\"\n\"Root/Work\",\"Jira\",\"bob\",\"s3cret\",\"https://jira.example\",\"\",\"JBSWY3DPEHPK3PXP\"\n";
        let r = import_csv(csv, "dev").unwrap();
        assert_eq!(r.entries.len(), 1);
        assert_eq!(r.folders.len(), 1);
        assert_eq!(r.folders[0].name, "Root/Work");
        assert_eq!(r.entries[0].totp.as_deref(), Some("JBSWY3DPEHPK3PXP"));
    }

    #[test]
    fn missing_password_column_rejected() {
        assert!(import_csv("a,b,c\n1,2,3\n", "dev").is_err());
    }

    #[test]
    fn bitwarden_json() {
        let json = r#"{
          "encrypted": false,
          "folders": [{"id": "f1", "name": "Social"}],
          "items": [{
            "type": 1, "name": "Twitter", "folderId": "f1", "favorite": true,
            "notes": "n",
            "login": {"username": "u", "password": "p", "totp": "JBSWY3DPEHPK3PXP",
                      "uris": [{"uri": "https://twitter.com"}]},
            "fields": [{"name": "pin", "value": "1234", "type": 1}]
          }]
        }"#;
        let r = import_bitwarden_json(json, "dev").unwrap();
        assert_eq!(r.entries.len(), 1);
        let e = &r.entries[0];
        assert_eq!(e.title, "Twitter");
        assert!(e.favorite);
        assert_eq!(e.custom_fields.len(), 1);
        assert!(e.custom_fields[0].protected);
        assert_eq!(r.folders.len(), 1);
        assert_eq!(e.folder, Some(r.folders[0].id));
    }

    #[test]
    fn encrypted_bitwarden_rejected() {
        let json = r#"{"encrypted": true, "items": []}"#;
        assert!(import_bitwarden_json(json, "dev").is_err());
    }

    #[test]
    fn csv_export_roundtrip() {
        let csv = "name,url,username,password\nSite,https://s.io,u,p\n";
        let imported = import_csv(csv, "dev").unwrap();
        let mut vault = Vault::new("t");
        vault.entries = imported.entries;
        let out = export_csv(&vault).unwrap();
        let re = import_csv(&out, "dev").unwrap();
        assert_eq!(re.entries.len(), 1);
        assert_eq!(re.entries[0].password, "p");
    }
}
