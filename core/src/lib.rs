//! keypile-core — the vault engine.
//!
//! One implementation of format, crypto and merge logic for every platform
//! (desktop apps link it natively, the browser extension compiles it to WASM).
//! Network access deliberately lives OUTSIDE this crate: the core never talks
//! to any server, which keeps the auditable surface small.

pub mod crypto;
pub mod error;
pub mod format;
pub mod generator;
pub mod import;
pub mod merge;
pub mod model;
pub mod strength;
pub mod totp;

pub use error::CoreError;
pub use model::{Entry, EntryHistory, Folder, Vault, VaultMeta};
