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
}

#[derive(Default)]
pub struct AppState {
    pub session: Mutex<Option<Session>>,
}

pub fn file_hash(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

/// Atomic write: temp file in the same directory, then rename over the target.
/// A `.bak` of the previous version is kept next to the vault.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let tmp = dir.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("vault")
    ));
    std::fs::write(&tmp, bytes)?;
    if path.exists() {
        let bak = path.with_extension("keypile.bak");
        let _ = std::fs::copy(path, bak);
    }
    std::fs::rename(&tmp, path)?;
    Ok(())
}

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
                            let m = merge::merge(&session.unlocked.vault, &disk_vault);
                            session.unlocked.vault = m.vault;
                            outcome.merged_external_changes = true;
                            outcome.conflicts = m.conflicts;
                        }
                        Err(_) => {
                            // Different key (e.g. master password changed elsewhere):
                            // do not overwrite. Save our version as a conflict copy.
                            let alt = conflict_path(&session.path);
                            let bytes = format::seal(
                                &session.unlocked.vault,
                                &session.unlocked.key,
                                &session.unlocked.header,
                            )
                            .map_err(|e| e.to_string())?;
                            atomic_write(&alt, &bytes).map_err(|e| e.to_string())?;
                            return Err(format!(
                                "Die Vault-Datei wurde extern mit anderem Schlüssel geändert. \
                                 Deine Version wurde als '{}' gesichert.",
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

fn conflict_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("vault");
    path.with_file_name(format!("{stem} (Konflikt).keypile"))
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

    /// Simulates a cloud-sync race: device B writes a newer file to disk while
    /// device A has the vault open. A's save must merge, not overwrite.
    #[test]
    fn persist_merges_external_changes() {
        let dir = std::env::temp_dir().join(format!("keypile-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("v.keypile");

        // device A creates the vault
        let vault = Vault::new("t");
        let (bytes, unlocked_a) = format::create(&vault, "pw", None, fast_kdf()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut session = Session {
            path: path.clone(),
            unlocked: unlocked_a,
            disk_hash: file_hash(&bytes),
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
}
