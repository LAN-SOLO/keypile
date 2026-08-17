//! The `.keypile` container format (see FORMAT.md for the full spec).
//!
//! Layout:
//! ```text
//! offset  size  content
//! 0       8     magic  "KEYPILEV" (0x4B 45 59 50 49 4C 45 56)
//! 8       2     format version, u16 little-endian (currently 1)
//! 10      4     header length H, u32 little-endian
//! 14      H     header JSON (UTF-8): kdf params, salt, cipher, nonce, keyfile flag
//! 14+H    ..    AES-256-GCM ciphertext || 16-byte tag
//! ```
//! AAD for the cipher = bytes 0..14+H (magic, version, length, header JSON),
//! so any tampering with the plaintext header fails authentication.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::crypto::{self, KdfParams, KEY_LEN, SALT_LEN};
use crate::error::{CoreError, Result};
use crate::model::Vault;

pub const MAGIC: &[u8; 8] = b"KEYPILEV";
pub const FORMAT_VERSION: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Header {
    pub kdf: KdfParams,
    /// base64 KDF salt (16 bytes)
    pub salt: String,
    pub cipher: String,
    /// base64 GCM nonce (12 bytes) — fresh on every save
    pub nonce: String,
    /// informational: was a key file used when this vault was created?
    #[serde(default)]
    pub keyfile: bool,
}

/// A vault unlocked in memory: parsed data + the derived key + its header.
/// The key is zeroized on drop.
pub struct UnlockedVault {
    pub vault: Vault,
    pub key: Zeroizing<[u8; KEY_LEN]>,
    pub header: Header,
}

/// Serialize + encrypt a vault into the `.keypile` byte format.
/// A fresh nonce is generated on every call; the salt/KDF params come from `header`.
pub fn seal(vault: &Vault, key: &[u8; KEY_LEN], header: &Header) -> Result<Vec<u8>> {
    let payload = serde_json::to_vec(vault)?;

    // Fresh nonce on every seal; it must live inside the AAD-covered header.
    let mut header = header.clone();
    let nonce = crypto::random_bytes(crypto::NONCE_LEN);
    header.nonce = B64.encode(&nonce);
    let header_json = serde_json::to_vec(&header)?;

    let mut out = Vec::with_capacity(14 + header_json.len() + payload.len() + 16);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
    out.extend_from_slice(&(header_json.len() as u32).to_le_bytes());
    out.extend_from_slice(&header_json);

    let aad = out.clone();
    // encrypt() would generate its own nonce; we need the one recorded in the
    // header, so use the lower-level path with the recorded nonce.
    let ciphertext = {
        use aes_gcm::aead::{Aead, KeyInit, Payload};
        use aes_gcm::{Aes256Gcm, Nonce};
        let cipher =
            Aes256Gcm::new_from_slice(key).map_err(|e| CoreError::Crypto(e.to_string()))?;
        cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &payload,
                    aad: &aad,
                },
            )
            .map_err(|_| CoreError::Crypto("encryption failed".into()))?
    };
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Parse container bytes without decrypting (header inspection).
pub fn parse_header(data: &[u8]) -> Result<(Header, &[u8], &[u8])> {
    if data.len() < 14 {
        return Err(CoreError::Corrupt("file too short".into()));
    }
    if &data[0..8] != MAGIC {
        return Err(CoreError::BadMagic);
    }
    let version = u16::from_le_bytes([data[8], data[9]]);
    if version > FORMAT_VERSION {
        return Err(CoreError::UnsupportedVersion(version));
    }
    let hlen = u32::from_le_bytes([data[10], data[11], data[12], data[13]]) as usize;
    if data.len() < 14 + hlen {
        return Err(CoreError::Corrupt("truncated header".into()));
    }
    let header: Header = serde_json::from_slice(&data[14..14 + hlen])
        .map_err(|e| CoreError::Corrupt(format!("bad header: {e}")))?;
    let aad = &data[..14 + hlen];
    let ciphertext = &data[14 + hlen..];
    Ok((header, aad, ciphertext))
}

/// Decrypt and parse a `.keypile` container.
pub fn open(data: &[u8], password: &str, keyfile: Option<&[u8]>) -> Result<UnlockedVault> {
    let (header, aad, ciphertext) = parse_header(data)?;
    if header.cipher != "aes-256-gcm" {
        return Err(CoreError::Corrupt(format!(
            "unknown cipher '{}'",
            header.cipher
        )));
    }
    let salt = B64
        .decode(&header.salt)
        .map_err(|_| CoreError::Corrupt("bad salt encoding".into()))?;
    let nonce = B64
        .decode(&header.nonce)
        .map_err(|_| CoreError::Corrupt("bad nonce encoding".into()))?;
    let key = crypto::derive_key(password, keyfile, &salt, &header.kdf)?;
    let plaintext = crypto::decrypt(&key, &nonce, ciphertext, aad)?;
    let vault: Vault = serde_json::from_slice(&plaintext)?;
    Ok(UnlockedVault {
        vault,
        key,
        header,
    })
}

/// Create a brand-new vault container: fresh salt, derived key, sealed bytes.
pub fn create(
    vault: &Vault,
    password: &str,
    keyfile: Option<&[u8]>,
    kdf: KdfParams,
) -> Result<(Vec<u8>, UnlockedVault)> {
    let salt = crypto::random_bytes(SALT_LEN);
    let key = crypto::derive_key(password, keyfile, &salt, &kdf)?;
    let header = Header {
        kdf,
        salt: B64.encode(&salt),
        cipher: "aes-256-gcm".into(),
        nonce: String::new(), // set on each seal()
        keyfile: keyfile.is_some(),
    };
    let bytes = seal(vault, &key, &header)?;
    Ok((
        bytes,
        UnlockedVault {
            vault: vault.clone(),
            key,
            header,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Entry;

    fn fast_kdf() -> KdfParams {
        KdfParams {
            algo: "argon2id".into(),
            m_kib: 8 * 1024,
            t: 1,
            p: 1,
        }
    }

    #[test]
    fn container_roundtrip() {
        let mut vault = Vault::new("Test");
        let mut e = Entry::new("example.com");
        e.username = "alice".into();
        e.password = "s3cret!".into();
        vault.entries.push(e);

        let (bytes, unlocked) = create(&vault, "master", None, fast_kdf()).unwrap();
        assert_eq!(&bytes[0..8], MAGIC);

        let reopened = open(&bytes, "master", None).unwrap();
        assert_eq!(reopened.vault, vault);
        assert_eq!(reopened.header.kdf, unlocked.header.kdf);
    }

    #[test]
    fn wrong_password_rejected() {
        let vault = Vault::new("Test");
        let (bytes, _) = create(&vault, "master", None, fast_kdf()).unwrap();
        assert!(matches!(
            open(&bytes, "nope", None),
            Err(CoreError::DecryptFailed)
        ));
    }

    #[test]
    fn keyfile_required_when_set() {
        let vault = Vault::new("Test");
        let (bytes, _) = create(&vault, "master", Some(b"kf"), fast_kdf()).unwrap();
        assert!(open(&bytes, "master", None).is_err());
        assert!(open(&bytes, "master", Some(b"kf")).is_ok());
    }

    #[test]
    fn header_tamper_detected() {
        let vault = Vault::new("Test");
        let (mut bytes, _) = create(&vault, "master", None, fast_kdf()).unwrap();
        // flip a byte inside the header JSON (e.g. weaken KDF params)
        bytes[20] ^= 0x01;
        assert!(open(&bytes, "master", None).is_err());
    }

    #[test]
    fn reseal_uses_fresh_nonce() {
        let vault = Vault::new("Test");
        let (_, unlocked) = create(&vault, "master", None, fast_kdf()).unwrap();
        let b1 = seal(&vault, &unlocked.key, &unlocked.header).unwrap();
        let b2 = seal(&vault, &unlocked.key, &unlocked.header).unwrap();
        let (h1, _, _) = parse_header(&b1).unwrap();
        let (h2, _, _) = parse_header(&b2).unwrap();
        assert_ne!(h1.nonce, h2.nonce);
    }

    #[test]
    fn bad_magic_rejected() {
        assert!(matches!(
            open(b"NOTAVAULTxxxxxxxxxxx", "pw", None),
            Err(CoreError::BadMagic)
        ));
    }
}
