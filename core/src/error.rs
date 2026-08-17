use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("not a keypile vault (bad magic bytes)")]
    BadMagic,
    #[error("vault format version {0} is newer than this app supports — please update keypile")]
    UnsupportedVersion(u16),
    #[error("wrong master password or key file, or the vault file is corrupted")]
    DecryptFailed,
    #[error("vault file is truncated or corrupted: {0}")]
    Corrupt(String),
    #[error("crypto error: {0}")]
    Crypto(String),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("import error: {0}")]
    Import(String),
    #[error("invalid TOTP secret: {0}")]
    Totp(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;
