//! Key derivation and authenticated encryption.
//!
//! - KDF: Argon2id (OWASP-recommended parameters, tunable per vault via header)
//! - Cipher: AES-256-GCM with a FRESH random 96-bit nonce on every encryption.
//!   Nonce reuse is the one unforgivable GCM mistake; we never cache nonces.
//! - Optional key file: its SHA-256 is combined with the password hash into a
//!   composite key BEFORE the KDF, so the key file strengthens the derivation
//!   itself rather than acting as a bypassable login gate.

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::error::{CoreError, Result};

/// Argon2id parameters stored in the vault header.
/// Defaults follow the OWASP "recommended" tier (64 MiB, t=3, p=4),
/// which lands in the 250–500 ms range on current hardware.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KdfParams {
    pub algo: String,
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        KdfParams {
            algo: "argon2id".into(),
            m_kib: 64 * 1024,
            t: 3,
            p: 4,
        }
    }
}

/// Bounds for KDF parameters read from a (possibly hostile) vault header.
/// The header is only authenticated AFTER the key is derived, so without
/// these limits a crafted file could make the app allocate many GiB of RAM
/// or spin for hours before the wrong-password error appears.
pub const KDF_MIN_M_KIB: u32 = 8 * 1024;
pub const KDF_MAX_M_KIB: u32 = 1024 * 1024;
pub const KDF_MAX_T: u32 = 64;
pub const KDF_MAX_P: u32 = 16;

impl KdfParams {
    /// Reject parameters outside the supported range (DoS guard + floor
    /// against downgraded files).
    pub fn validate(&self) -> Result<()> {
        if self.algo != "argon2id" {
            return Err(CoreError::Crypto(format!("unknown KDF '{}'", self.algo)));
        }
        if !(KDF_MIN_M_KIB..=KDF_MAX_M_KIB).contains(&self.m_kib)
            || !(1..=KDF_MAX_T).contains(&self.t)
            || !(1..=KDF_MAX_P).contains(&self.p)
        {
            return Err(CoreError::Corrupt(format!(
                "unsupported KDF parameters (m={} KiB, t={}, p={})",
                self.m_kib, self.t, self.p
            )));
        }
        Ok(())
    }
}

/// Constant-time equality for key material (no early exit on first mismatch).
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    std::hint::black_box(diff) == 0
}

pub const KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;
pub const SALT_LEN: usize = 16;

pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    buf
}

/// Derive the 256-bit vault key from master password (+ optional key file).
pub fn derive_key(
    password: &str,
    keyfile: Option<&[u8]>,
    salt: &[u8],
    params: &KdfParams,
) -> Result<Zeroizing<[u8; KEY_LEN]>> {
    params.validate()?;
    // Composite input: SHA256(SHA256(password) || SHA256(keyfile)).
    // Hashing the password first gives fixed-length input; the composite step
    // means neither factor alone can derive the key.
    let pw_hash = Sha256::digest(password.as_bytes());
    let mut hasher = Sha256::new();
    hasher.update(pw_hash);
    if let Some(kf) = keyfile {
        hasher.update(Sha256::digest(kf));
    }
    let composite: Zeroizing<[u8; 32]> = Zeroizing::new(hasher.finalize().into());

    let a2_params = Params::new(params.m_kib, params.t, params.p, Some(KEY_LEN))
        .map_err(|e| CoreError::Crypto(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, a2_params);

    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(composite.as_slice(), salt, key.as_mut())
        .map_err(|e| CoreError::Crypto(e.to_string()))?;
    Ok(key)
}

/// Encrypt with AES-256-GCM. Returns (nonce, ciphertext-with-tag).
/// `aad` binds the plaintext header to the ciphertext, so header tampering
/// (e.g. weakening the stored KDF parameters) breaks authentication.
pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8], aad: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| CoreError::Crypto(e.to_string()))?;
    let nonce_bytes = random_bytes(NONCE_LEN);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, Payload { msg: plaintext, aad })
        .map_err(|_| CoreError::Crypto("encryption failed".into()))?;
    Ok((nonce_bytes, ciphertext))
}

pub fn decrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8],
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>> {
    if nonce.len() != NONCE_LEN {
        return Err(CoreError::Corrupt("bad nonce length".into()));
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| CoreError::Crypto(e.to_string()))?;
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| CoreError::DecryptFailed)?;
    Ok(Zeroizing::new(plaintext))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fast_params() -> KdfParams {
        KdfParams {
            algo: "argon2id".into(),
            m_kib: 8 * 1024,
            t: 1,
            p: 1,
        }
    }

    #[test]
    fn roundtrip() {
        let salt = random_bytes(SALT_LEN);
        let key = derive_key("hunter2", None, &salt, &fast_params()).unwrap();
        let (nonce, ct) = encrypt(&key, b"secret payload", b"aad").unwrap();
        let pt = decrypt(&key, &nonce, &ct, b"aad").unwrap();
        assert_eq!(pt.as_slice(), b"secret payload");
    }

    #[test]
    fn wrong_password_fails() {
        let salt = random_bytes(SALT_LEN);
        let key = derive_key("hunter2", None, &salt, &fast_params()).unwrap();
        let bad = derive_key("hunter3", None, &salt, &fast_params()).unwrap();
        let (nonce, ct) = encrypt(&key, b"secret", b"").unwrap();
        assert!(matches!(
            decrypt(&bad, &nonce, &ct, b""),
            Err(CoreError::DecryptFailed)
        ));
    }

    #[test]
    fn keyfile_changes_key() {
        let salt = random_bytes(SALT_LEN);
        let k1 = derive_key("pw", None, &salt, &fast_params()).unwrap();
        let k2 = derive_key("pw", Some(b"keyfile-bytes"), &salt, &fast_params()).unwrap();
        assert_ne!(k1.as_slice(), k2.as_slice());
    }

    #[test]
    fn tampered_aad_fails() {
        let salt = random_bytes(SALT_LEN);
        let key = derive_key("pw", None, &salt, &fast_params()).unwrap();
        let (nonce, ct) = encrypt(&key, b"secret", b"header-v1").unwrap();
        assert!(decrypt(&key, &nonce, &ct, b"header-v2").is_err());
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let salt = random_bytes(SALT_LEN);
        let key = derive_key("pw", None, &salt, &fast_params()).unwrap();
        let (nonce, mut ct) = encrypt(&key, b"secret", b"").unwrap();
        ct[0] ^= 0xff;
        assert!(decrypt(&key, &nonce, &ct, b"").is_err());
    }

    #[test]
    fn kdf_bounds_enforced() {
        let salt = random_bytes(SALT_LEN);
        let huge = KdfParams { m_kib: 64 * 1024 * 1024, ..fast_params() };
        assert!(derive_key("pw", None, &salt, &huge).is_err());
        let tiny = KdfParams { m_kib: 64, ..fast_params() };
        assert!(derive_key("pw", None, &salt, &tiny).is_err());
        let slow = KdfParams { t: 10_000, ..fast_params() };
        assert!(derive_key("pw", None, &salt, &slow).is_err());
        let wide = KdfParams { p: 255, ..fast_params() };
        assert!(derive_key("pw", None, &salt, &wide).is_err());
        let other = KdfParams { algo: "scrypt".into(), ..fast_params() };
        assert!(derive_key("pw", None, &salt, &other).is_err());
        assert!(KdfParams::default().validate().is_ok());
    }

    #[test]
    fn ct_eq_works() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
    }

    #[test]
    fn fresh_nonce_every_time() {
        let salt = random_bytes(SALT_LEN);
        let key = derive_key("pw", None, &salt, &fast_params()).unwrap();
        let (n1, _) = encrypt(&key, b"x", b"").unwrap();
        let (n2, _) = encrypt(&key, b"x", b"").unwrap();
        assert_ne!(n1, n2);
    }
}
