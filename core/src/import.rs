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
    let data = strip_bom(data);
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
            // text columns may carry the formula-injection guard of our own
            // export ("'=…"); passwords are never trimmed or altered — a
            // leading/trailing space is part of the secret
            let text = || unescape_formula(v).to_string();
            match *kind {
                "title" => entry.title = text(),
                "username" if entry.username.is_empty() => entry.username = text(),
                "password" => entry.password = field.to_string(),
                "url" => entry.urls.push(text()),
                "notes" => entry.notes = text(),
                "totp" => entry.totp = Some(v.to_string()),
                "folder" => folder_name = text(),
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

/// Characters that make spreadsheet programs (Excel, LibreOffice, Numbers,
/// Google Sheets) treat a cell as a formula — OWASP "CSV injection".
fn is_formula_trigger(c: char) -> bool {
    matches!(c, '=' | '+' | '-' | '@' | '\t' | '\r')
}

/// Export guard: prefix a text cell that would be read as a formula with a
/// single quote. Applied to Group/Title/Username/URL/Notes only — Password
/// and TOTP stay byte-exact so a migration never imports altered secrets.
fn escape_formula(v: &str) -> std::borrow::Cow<'_, str> {
    match v.chars().next() {
        Some(c) if is_formula_trigger(c) => format!("'{v}").into(),
        _ => v.into(),
    }
}

/// Import side of [`escape_formula`]: drop exactly one guard quote, but only
/// when it precedes a trigger character (so plain "'quoted'" text stays).
fn unescape_formula(v: &str) -> &str {
    match v.strip_prefix('\'') {
        Some(rest) if rest.chars().next().is_some_and(is_formula_trigger) => rest,
        _ => v,
    }
}

/// Excel, 1Password and several Windows tools write a UTF-8 BOM; left in
/// place it glues onto the first header ("\u{feff}name") and that column is
/// silently dropped.
fn strip_bom(data: &str) -> &str {
    data.strip_prefix('\u{feff}').unwrap_or(data)
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
    let root: Value = serde_json::from_str(strip_bom(data))
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
                    ..Default::default()
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

/// Export the vault as CSV (KeePassXC-compatible columns). Starts with a
/// UTF-8 BOM: without it Excel on Windows reads the file as ANSI and mangles
/// umlauts; every importer here (and KeePassXC/Bitwarden) skips the BOM.
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
            &*escape_formula(&group),
            &*escape_formula(&e.title),
            &*escape_formula(&e.username),
            e.password.as_str(),
            &*escape_formula(e.urls.first().map(String::as_str).unwrap_or("")),
            &*escape_formula(&e.notes),
            e.totp.as_deref().unwrap_or(""),
        ])
        .map_err(|e| CoreError::Import(e.to_string()))?;
    }
    let body = String::from_utf8(
        wtr.into_inner()
            .map_err(|e| CoreError::Import(e.to_string()))?,
    )
    .map_err(|e| CoreError::Import(e.to_string()))?;
    Ok(format!("\u{feff}{body}"))
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
    fn csv_with_utf8_bom() {
        let csv = "\u{feff}name,url,username,password\nGitHub,https://github.com,alice,pw\n";
        let r = import_csv(csv, "dev").unwrap();
        assert_eq!(r.entries[0].title, "GitHub");
    }

    #[test]
    fn bitwarden_json_with_bom() {
        let json = "\u{feff}{\"items\": [{\"type\": 2, \"name\": \"Note\", \"notes\": \"x\"}]}";
        let r = import_bitwarden_json(json, "dev").unwrap();
        assert_eq!(r.entries.len(), 1);
    }

    #[test]
    fn onepassword_and_bitwarden_csv_headers() {
        let op = "Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nMail,https://m.io,me,pw,otpauth://totp/x?secret=JBSWY3DPEHPK3PXP,true,false,,n\n";
        let r = import_csv(op, "dev").unwrap();
        assert_eq!(r.entries[0].username, "me");
        assert!(r.entries[0].favorite);
        assert!(r.entries[0].totp.is_some());
        let bw = "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nWork,1,login,Jira,,,0,https://j.io,bob,s3,\n";
        let r = import_csv(bw, "dev").unwrap();
        assert_eq!(r.entries[0].title, "Jira");
        assert_eq!(r.entries[0].password, "s3");
        assert_eq!(r.folders[0].name, "Work");
    }

    #[test]
    fn export_quotes_special_characters() {
        let mut vault = Vault::new("t");
        let mut e = Entry::new("a,b \"quoted\"");
        e.password = "p,w\n2".into();
        e.notes = "line1\nline2".into();
        vault.entries.push(e);
        let out = export_csv(&vault).unwrap();
        assert!(out.starts_with('\u{feff}'), "Excel needs the UTF-8 BOM");
        let re = import_csv(&out, "dev").unwrap();
        assert_eq!(re.entries[0].title, "a,b \"quoted\"");
        assert_eq!(re.entries[0].password, "p,w\n2");
        assert_eq!(re.entries[0].notes, "line1\nline2");
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
    fn export_guards_formula_cells_but_keeps_secrets_exact() {
        let mut vault = Vault::new("t");
        let mut e = Entry::new("=HYPERLINK(\"http://x\",\"klick\")");
        e.username = "+49 160 1234".into();
        e.password = "=1+1 ".into();
        e.urls.push("@evil".into());
        e.notes = "-2+3\nzweite Zeile".into();
        vault.entries.push(e);
        let mut tab = Entry::new("\tTab");
        tab.password = " -lead and trail- ".into();
        tab.notes = "'quoted' bleibt".into();
        vault.entries.push(tab);
        let out = export_csv(&vault).unwrap();
        let mut rdr = csv::Reader::from_reader(out.trim_start_matches('\u{feff}').as_bytes());
        let rows: Vec<csv::StringRecord> = rdr.records().map(|r| r.unwrap()).collect();
        // what a spreadsheet sees: text cells are neutralised …
        assert_eq!(&rows[0][1], "'=HYPERLINK(\"http://x\",\"klick\")");
        assert_eq!(&rows[0][2], "'+49 160 1234");
        assert_eq!(&rows[0][4], "'@evil");
        assert_eq!(&rows[0][5], "'-2+3\nzweite Zeile");
        assert_eq!(&rows[1][1], "'\tTab");
        // … secrets are byte-exact
        assert_eq!(&rows[0][3], "=1+1 ");
        assert_eq!(&rows[1][3], " -lead and trail- ");
        // keypile's own import restores the original text and passwords
        let re = import_csv(&out, "dev").unwrap();
        assert_eq!(re.entries[0].title, "=HYPERLINK(\"http://x\",\"klick\")");
        assert_eq!(re.entries[0].username, "+49 160 1234");
        assert_eq!(re.entries[0].password, "=1+1 ");
        assert_eq!(re.entries[0].urls, vec!["@evil".to_string()]);
        assert_eq!(re.entries[0].notes, "-2+3\nzweite Zeile");
        // the guard quote also protects a leading tab from being trimmed away
        assert_eq!(re.entries[1].title, "\tTab");
        assert_eq!(re.entries[1].password, " -lead and trail- ");
        assert_eq!(re.entries[1].notes, "'quoted' bleibt");
    }

    #[test]
    fn csv_export_roundtrip() {
        let csv = "name,url,username,password\nSite,https://s.io,u,p\n";
        let imported = import_csv(csv, "dev").unwrap();
        let mut vault = Vault::new("t");
        vault.entries = imported.entries;
        let out = export_csv(&vault).unwrap();
        assert!(out.starts_with('\u{feff}'), "Excel needs the UTF-8 BOM");
        let re = import_csv(&out, "dev").unwrap();
        assert_eq!(re.entries.len(), 1);
        assert_eq!(re.entries[0].password, "p");
    }
}
