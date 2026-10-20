//! In-memory session state. The derived key lives ONLY here (zeroized on
//! lock/drop); the master password itself is never stored anywhere.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use keypile_core::format::{self, UnlockedVault};
use keypile_core::merge;

pub struct Session {
    pub path: PathBuf,
    pub unlocked: UnlockedVault,
    /// SHA-256 of the vault file as we last read/wrote it — used to detect
    /// external modifications (e.g. a cloud sync client pulled a newer copy).
    pub disk_hash: [u8; 32],
    /// Word for conflict copies ("Titel (Konflikt)" / "Title (conflict)") —
    /// follows the UI language, updated when the language changes.
    pub conflict_label: String,
}

pub fn conflict_label(language: &str) -> String {
    if language == "de" { "Konflikt" } else { "conflict" }.to_string()
}

impl Drop for Session {
    /// Best effort: overwrite the decrypted secrets before the memory is
    /// freed (the key itself is `Zeroizing` already). Copies handed to the UI
    /// are outside our control.
    fn drop(&mut self) {
        wipe_vault(&mut self.unlocked.vault);
    }
}

pub fn wipe_vault(vault: &mut keypile_core::Vault) {
    use zeroize::Zeroize;
    for e in vault.entries.iter_mut() {
        e.password.zeroize();
        e.username.zeroize();
        e.notes.zeroize();
        if let Some(t) = e.totp.as_mut() {
            t.zeroize();
        }
        for f in e.custom_fields.iter_mut() {
            f.value.zeroize();
        }
        for h in e.history.iter_mut() {
            h.password.zeroize();
        }
        for a in e.attachments.iter_mut() {
            a.data.zeroize();
        }
    }
}

#[derive(Default)]
pub struct AppState {
    pub session: Mutex<Option<Session>>,
    /// SHA-256 of the last secret keypile put on the clipboard — lets
    /// lock/auto-clear wipe it without remembering the secret itself.
    pub clipboard_hash: Mutex<Option<[u8; 32]>>,
}

pub fn file_hash(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

/// Atomic write: temp file in the same directory, then rename over the target.
/// A `.bak` of the previous version is kept next to the vault.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let dir = match path.parent() {
        Some(d) if !d.as_os_str().is_empty() => d,
        _ => Path::new("."),
    };
    let tmp = dir.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("vault")
    ));
    let written = (|| {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        // make sure the bytes are on disk before the rename publishes them —
        // otherwise a crash/power loss can leave an empty vault behind
        f.sync_all()
    })();
    if let Err(e) = written {
        // disk full / quota: don't leave a half-written temp file behind
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    if path.exists() {
        let bak = backup_path(path);
        if std::fs::copy(path, &bak).is_err() {
            // a copy that died midway (disk full) leaves a truncated .bak that
            // would look like a valid backup — remove it; an intact older
            // .bak (copy failed at open, e.g. locked) is kept
            let same_len = |a: &Path, b: &Path| {
                matches!((std::fs::metadata(a), std::fs::metadata(b)),
                    (Ok(x), Ok(y)) if x.len() == y.len())
            };
            if !same_len(path, &bak) {
                let _ = std::fs::remove_file(&bak);
            }
        }
    }
    if let Err(e) = rename_with_retry(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

pub fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("keypile.bak")
}

/// On Windows, sync clients (OneDrive, Dropbox) and virus scanners briefly
/// hold the target open without FILE_SHARE_DELETE, so MoveFileEx fails with
/// "access denied" for a few hundred milliseconds. Retry before giving up.
pub fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let attempts = if cfg!(windows) { 20 } else { 1 };
    let mut last = None;
    for i in 0..attempts {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => {
                let retryable = e.kind() == std::io::ErrorKind::PermissionDenied
                    || e.raw_os_error() == Some(32) // ERROR_SHARING_VIOLATION
                    || e.raw_os_error() == Some(5); // ERROR_ACCESS_DENIED
                if !retryable || i + 1 == attempts {
                    return Err(e);
                }
                last = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("rename failed")))
}

/// Start of the error when the file on disk was re-keyed elsewhere. The
/// session's version then lives in the conflict copy — callers must keep it
/// in memory (no rollback), or the next attempt would overwrite that copy
/// with a vault that lacks the change.
pub const FOREIGN_KEY_MSG: &str = "Die Vault-Datei wurde extern mit anderem Schlüssel geändert.";

#[derive(Debug)]
pub struct PersistOutcome {
    pub merged_external_changes: bool,
    pub conflicts: usize,
}

/// Seal and write the current vault. If the file changed on disk since we last
/// touched it (cloud sync!), decrypt the disk version with our key, merge it
/// in, and write the merged result — never blindly overwrite.
pub fn persist(session: &mut Session) -> Result<PersistOutcome, String> {
    let mut outcome = PersistOutcome {
        merged_external_changes: false,
        conflicts: 0,
    };

    if let Ok(disk_bytes) = std::fs::read(&session.path) {
        if file_hash(&disk_bytes) != session.disk_hash {
            // External change detected. Try to open the disk version with the
            // key we hold (works as long as salt/KDF are unchanged).
            match format::parse_header(&disk_bytes) {
                Ok((header, aad, ct)) => {
                    use base64::Engine;
                    let nonce = base64::engine::general_purpose::STANDARD
                        .decode(&header.nonce)
                        .map_err(|_| "Externe Vault-Datei ist beschädigt".to_string())?;
                    match keypile_core::crypto::decrypt(&session.unlocked.key, &nonce, ct, aad) {
                        Ok(plain) => {
                            let disk_vault: keypile_core::Vault = serde_json::from_slice(&plain)
                                .map_err(|e| format!("Externe Vault-Datei unlesbar: {e}"))?;
                            let m = merge::merge_with_label(
                                &session.unlocked.vault,
                                &disk_vault,
                                &session.conflict_label,
                            );
                            session.unlocked.vault = m.vault;
                            outcome.merged_external_changes = true;
                            outcome.conflicts = m.conflicts;
                        }
                        Err(_) => {
                            // Different key (e.g. master password changed elsewhere):
                            // do not overwrite. Save our version as a conflict copy.
                            let alt = conflict_path(&session.path, &session.conflict_label);
                            let bytes = format::seal(
                                &session.unlocked.vault,
                                &session.unlocked.key,
                                &session.unlocked.header,
                            )
                            .map_err(|e| e.to_string())?;
                            atomic_write(&alt, &bytes).map_err(|e| e.to_string())?;
                            return Err(format!(
                                "{FOREIGN_KEY_MSG} Deine Version wurde als '{}' gesichert.",
                                alt.file_name().and_then(|n| n.to_str()).unwrap_or("?")
                            ));
                        }
                    }
                }
                Err(_) => {
                    return Err("Die Vault-Datei auf der Festplatte ist beschädigt — \
                                Speichern abgebrochen, um nichts zu überschreiben."
                        .to_string())
                }
            }
        }
    }

    session.unlocked.vault.meta.generation += 1;
    session.unlocked.vault.meta.modified = chrono::Utc::now();
    let bytes = format::seal(
        &session.unlocked.vault,
        &session.unlocked.key,
        &session.unlocked.header,
    )
    .map_err(|e| e.to_string())?;
    atomic_write(&session.path, &bytes).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
    session.disk_hash = file_hash(&bytes);
    Ok(outcome)
}

/// Re-encrypt the session under a new key/salt (master password change).
/// External changes are merged under the OLD key first; if writing the
/// re-keyed file fails, the session keeps the old key so memory and disk
/// never disagree. Afterwards the `.bak` is refreshed so no copy readable
/// with the old password stays next to the vault.
pub fn rekey(
    session: &mut Session,
    new_key: zeroize::Zeroizing<[u8; keypile_core::crypto::KEY_LEN]>,
    new_salt_b64: String,
    uses_keyfile: bool,
) -> Result<(), String> {
    persist(session)?;
    let old_key = std::mem::replace(&mut session.unlocked.key, new_key);
    let old_header = session.unlocked.header.clone();
    session.unlocked.header.salt = new_salt_b64;
    session.unlocked.header.keyfile = uses_keyfile;
    if let Err(e) = persist(session) {
        session.unlocked.key = old_key;
        session.unlocked.header = old_header;
        return Err(e);
    }
    let bak = backup_path(&session.path);
    if bak.exists() {
        // best effort; a failure here must not undo the successful change
        if std::fs::copy(&session.path, &bak).is_err() {
            let _ = std::fs::remove_file(&bak);
        }
    }
    Ok(())
}

fn conflict_path(path: &Path, label: &str) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("vault");
    path.with_file_name(format!("{stem} ({label}).keypile"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use keypile_core::crypto::KdfParams;
    use keypile_core::model::{Entry, Vault};

    fn fast_kdf() -> KdfParams {
        KdfParams {
            algo: "argon2id".into(),
            m_kib: 8 * 1024,
            t: 1,
            p: 1,
        }
    }

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "keypile-test-{tag}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn open_session(path: &Path, pw: &str) -> Session {
        let bytes = std::fs::read(path).unwrap();
        Session {
            path: path.to_path_buf(),
            unlocked: format::open(&bytes, pw, None).unwrap(),
            disk_hash: file_hash(&bytes),
            conflict_label: conflict_label("de"),
        }
    }

    #[test]
    fn rekey_merges_first_and_refreshes_backup() {
        use base64::Engine;
        let dir = tmpdir("rekey");
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "old-password", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "old-password");
        // first save creates a .bak
        persist(&mut a).unwrap();

        // another device adds an entry meanwhile (old key)
        let mut b = open_session(&path, "old-password");
        let mut eb = Entry::new("from-B");
        eb.touch("B");
        b.unlocked.vault.entries.push(eb);
        persist(&mut b).unwrap();

        let salt = keypile_core::crypto::random_bytes(keypile_core::crypto::SALT_LEN);
        let key = keypile_core::crypto::derive_key("new-password", None, &salt, &fast_kdf()).unwrap();
        rekey(&mut a, key, base64::engine::general_purpose::STANDARD.encode(&salt), false).unwrap();

        let disk = std::fs::read(&path).unwrap();
        assert!(format::open(&disk, "old-password", None).is_err());
        let reopened = format::open(&disk, "new-password", None).unwrap();
        assert!(reopened.vault.entries.iter().any(|e| e.title == "from-B"));
        // the backup no longer opens with the old password
        let bak = std::fs::read(backup_path(&path)).unwrap();
        assert!(format::open(&bak, "old-password", None).is_err());
        assert!(format::open(&bak, "new-password", None).is_ok());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rekey_rolls_back_when_write_fails() {
        use base64::Engine;
        let dir = tmpdir("rekey-fail");
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "old-password", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "old-password");
        // point the session at a directory that does not exist → write fails
        a.path = dir.join("missing").join("v.keypile");
        let salt = keypile_core::crypto::random_bytes(keypile_core::crypto::SALT_LEN);
        let old_salt = a.unlocked.header.salt.clone();
        let key = keypile_core::crypto::derive_key("new-password", None, &salt, &fast_kdf()).unwrap();
        assert!(rekey(&mut a, key, base64::engine::general_purpose::STANDARD.encode(&salt), false).is_err());
        assert_eq!(a.unlocked.header.salt, old_salt);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn foreign_key_on_disk_writes_conflict_copy() {
        let dir = tmpdir("conflict");
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "pw-one", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "pw-one");
        // file replaced by a vault with a different key
        let (other, _) = format::create(&Vault::new("x"), "pw-two", None, fast_kdf()).unwrap();
        std::fs::write(&path, &other).unwrap();
        let err = persist(&mut a).unwrap_err();
        assert!(err.contains("Konflikt"));
        assert!(dir.join("v (Konflikt).keypile").exists());
        // the foreign file was not overwritten
        assert_eq!(std::fs::read(&path).unwrap(), other);
        // English UI: the copy is named in English
        a.conflict_label = conflict_label("en");
        let err = persist(&mut a).unwrap_err();
        assert!(err.contains("v (conflict).keypile"));
        assert!(dir.join("v (conflict).keypile").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_disk_file_is_not_overwritten() {
        let dir = tmpdir("corrupt");
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "pw");
        std::fs::write(&path, b"garbage").unwrap();
        assert!(persist(&mut a).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"garbage");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn atomic_write_leaves_no_temp_file() {
        let dir = tmpdir("atomic");
        let path = dir.join("v.keypile");
        atomic_write(&path, b"one").unwrap();
        atomic_write(&path, b"two").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"two");
        assert_eq!(std::fs::read(backup_path(&path)).unwrap(), b"one");
        assert!(!dir.join(".v.keypile.tmp").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Journey "read-only folder": saving fails with a clear error, the file
    /// on disk stays the last good version, nothing half-written is left, and
    /// the change is still in memory — once the folder is writable again the
    /// next save succeeds. A restart in between sees the last good version.
    #[cfg(unix)]
    #[test]
    fn read_only_folder_fails_cleanly_and_recovers() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tmpdir("readonly");
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "pw");
        a.unlocked.vault.entries.push(Entry::new("neu"));
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        // root ignores directory permissions — nothing to test then
        if std::fs::File::create(dir.join("probe")).is_ok() {
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
            std::fs::remove_dir_all(&dir).ok();
            return;
        }
        let err = persist(&mut a).unwrap_err();
        assert!(err.starts_with("Speichern fehlgeschlagen"), "{err}");
        assert_eq!(std::fs::read(&path).unwrap(), bytes, "last good version untouched");
        assert!(!dir.join(".v.keypile.tmp").exists());
        assert_eq!(a.unlocked.vault.entries.len(), 1, "change kept in memory");
        // "restart" while still read-only: the old state opens fine
        assert!(open_session(&path, "pw").unlocked.vault.entries.is_empty());
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        persist(&mut a).unwrap();
        let reopened = open_session(&path, "pw");
        assert_eq!(reopened.unlocked.vault.entries[0].title, "neu");
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Journey "app killed mid-save": a stale temp file from a crash between
    /// write and rename must neither block opening nor the next save.
    #[test]
    fn stale_temp_file_from_crash_is_harmless() {
        let dir = tmpdir("stale-tmp");
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        std::fs::write(dir.join(".v.keypile.tmp"), b"half-written garbage").unwrap();
        let mut a = open_session(&path, "pw");
        a.unlocked.vault.entries.push(Entry::new("nach Absturz"));
        persist(&mut a).unwrap();
        assert!(!dir.join(".v.keypile.tmp").exists());
        assert_eq!(open_session(&path, "pw").unlocked.vault.entries.len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Journey "disk full". Needs a small scratch volume, so it only runs on
    /// request: `KEYPILE_FULL_DIR=/Volumes/kpfull cargo test -p keypile -- --ignored disk_full`
    /// (macOS: `hdiutil attach $(hdiutil create -size 2m -fs HFS+ -volname kpfull -o /tmp/kpfull)`).
    #[test]
    #[ignore]
    fn disk_full_keeps_last_good_version() {
        let Ok(base) = std::env::var("KEYPILE_FULL_DIR") else { return };
        let dir = PathBuf::from(base).join(format!("kp-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("v.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "pw");
        persist(&mut a).unwrap(); // creates the .bak
        let mut big = Entry::new("groß");
        big.notes = "x".repeat(256 * 1024);
        a.unlocked.vault.entries.push(big);
        // fill the volume
        let filler = dir.join("filler");
        {
            use std::io::Write;
            let mut f = std::fs::File::create(&filler).unwrap();
            let chunk = vec![0u8; 16 * 1024];
            while f.write_all(&chunk).is_ok() {}
            let _ = f.sync_all();
        }
        let err = persist(&mut a).unwrap_err();
        assert!(err.starts_with("Speichern fehlgeschlagen"), "{err}");
        assert!(!dir.join(".v.keypile.tmp").exists(), "no half-written temp file");
        assert!(open_session(&path, "pw").unlocked.vault.entries.is_empty());
        std::fs::remove_file(&filler).unwrap();
        persist(&mut a).unwrap();
        assert_eq!(open_session(&path, "pw").unlocked.vault.entries.len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Paths with spaces and umlauts (typical OneDrive/Dropbox folders on
    /// Windows and macOS) — save, backup and reopen must work unchanged.
    #[test]
    fn unicode_and_space_paths() {
        let dir = tmpdir("unicode").join("Jörg Müller — Tresore");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("Mein Tresor ä.keypile");
        let (bytes, _) = format::create(&Vault::new("t"), "pw-ümlaut-€", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "pw-ümlaut-€");
        a.unlocked.vault.entries.push(Entry::new("x"));
        persist(&mut a).unwrap();
        assert!(dir.join("Mein Tresor ä.keypile.bak").exists());
        let reopened = format::open(&std::fs::read(&path).unwrap(), "pw-ümlaut-€", None).unwrap();
        assert_eq!(reopened.vault.entries.len(), 1);
        std::fs::remove_dir_all(dir.parent().unwrap()).ok();
    }

    #[test]
    fn wipe_clears_secrets() {
        let mut v = Vault::new("t");
        let mut e = Entry::new("x");
        e.password = "secret".into();
        e.totp = Some("JBSWY3DPEHPK3PXP".into());
        v.entries.push(e);
        wipe_vault(&mut v);
        assert!(v.entries[0].password.is_empty());
        assert_eq!(v.entries[0].totp.as_deref(), Some(""));
    }

    /// Simulates a cloud-sync race: device B writes a newer file to disk while
    /// device A has the vault open. A's save must merge, not overwrite.
    #[test]
    fn persist_merges_external_changes() {
        let dir = tmpdir("merge");
        let path = dir.join("v.keypile");

        // device A creates the vault
        let vault = Vault::new("t");
        let (bytes, unlocked_a) = format::create(&vault, "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut session = Session {
            path: path.clone(),
            unlocked: unlocked_a,
            disk_hash: file_hash(&bytes),
            conflict_label: conflict_label("de"),
        };

        // device B opens the same file, adds an entry, writes it back
        let mut unlocked_b = format::open(&bytes, "pw", None).unwrap();
        let mut eb = Entry::new("from-B");
        eb.touch("B");
        unlocked_b.vault.entries.push(eb);
        let bytes_b = format::seal(&unlocked_b.vault, &unlocked_b.key, &unlocked_b.header).unwrap();
        std::fs::write(&path, &bytes_b).unwrap();

        // device A adds its own entry and saves
        let mut ea = Entry::new("from-A");
        ea.touch("A");
        session.unlocked.vault.entries.push(ea);
        let outcome = persist(&mut session).unwrap();
        assert!(outcome.merged_external_changes);
        assert_eq!(outcome.conflicts, 0);

        // the file on disk now contains BOTH entries
        let final_bytes = std::fs::read(&path).unwrap();
        let reopened = format::open(&final_bytes, "pw", None).unwrap();
        let titles: Vec<&str> = reopened
            .vault
            .entries
            .iter()
            .map(|e| e.title.as_str())
            .collect();
        assert!(titles.contains(&"from-A"));
        assert!(titles.contains(&"from-B"));
        // backup exists
        assert!(path.with_extension("keypile.bak").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Purge sync through the real file path: A empties the trash, B still
    /// holds the trashed entry in memory and saves something else — the entry
    /// must not come back, neither on disk nor in B's session; a third device
    /// that re-opens the file sees only the tombstone (and no content).
    #[test]
    fn purge_survives_persist_on_other_device() {
        let dir = tmpdir("purge");
        let path = dir.join("v.keypile");
        let mut v = Vault::new("t");
        let mut e = Entry::new("old-site");
        e.password = "s3cret-pw".into();
        e.touch("A");
        e.deleted = true;
        e.touch("A");
        let id = e.id;
        v.entries.push(e);
        let (bytes, _) = format::create(&v, "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut a = open_session(&path, "pw");
        let mut b = open_session(&path, "pw");

        // A: empty trash (same as the empty_trash command)
        for x in a.unlocked.vault.entries.iter_mut() {
            if x.deleted && !x.purged {
                x.purge("A");
            }
        }
        persist(&mut a).unwrap();

        // B: unrelated edit, saved on top of A's file
        let mut nb = Entry::new("from-B");
        nb.touch("B");
        b.unlocked.vault.entries.push(nb);
        let out = persist(&mut b).unwrap();
        assert!(out.merged_external_changes);
        assert_eq!(out.conflicts, 0);
        let in_b = b.unlocked.vault.entry(id).unwrap();
        assert!(in_b.purged && in_b.password.is_empty());

        let c = open_session(&path, "pw");
        let x = c.unlocked.vault.entry(id).unwrap();
        assert!(x.purged && x.title.is_empty() && x.password.is_empty());
        assert!(c.unlocked.vault.entries.iter().any(|e| e.title == "from-B"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
