//! Vault data model. This schema IS the documented `.keypile` payload format
//! (see FORMAT.md) — every field here is part of the public spec.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

/// Version vector: device id → monotonically increasing edit counter.
/// Used by the merge logic to distinguish "newer" from "concurrent" edits.
pub type VersionVector = BTreeMap<String, u64>;

fn default_category() -> String {
    "login".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Vault {
    pub meta: VaultMeta,
    #[serde(default)]
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub entries: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VaultMeta {
    pub name: String,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    /// Monotonic save counter of this replica — cheap "did anything change" check.
    #[serde(default)]
    pub generation: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Folder {
    pub id: Uuid,
    pub name: String,
    #[serde(default)]
    pub parent: Option<Uuid>,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub vv: VersionVector,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct CustomField {
    pub name: String,
    pub value: String,
    /// Protected fields are masked in the UI until revealed.
    #[serde(default)]
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntryHistory {
    pub password: String,
    pub replaced: DateTime<Utc>,
}

/// File attachment stored inside the encrypted vault payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Attachment {
    pub id: Uuid,
    pub name: String,
    /// Raw file bytes, base64-encoded (kept as string so the payload stays JSON).
    pub data: String,
    /// Original size in bytes (pre-base64), for display without decoding.
    pub size: u64,
}

/// Entry categories — determine the template (visible fields) and the icon.
/// Stored as a plain string so future categories don't break old readers.
pub const CATEGORIES: &[&str] = &[
    "login",
    "card",
    "identity",
    "note",
    "password",
    "finance",
    "license",
    "travel",
    "computer",
    "misc",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    pub id: Uuid,
    #[serde(default)]
    pub folder: Option<Uuid>,
    /// One of `CATEGORIES`; unknown values are treated as "misc" by UIs.
    #[serde(default = "default_category")]
    pub category: String,
    pub title: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    /// First URL is the primary one; matching is exact-origin (see autofill spec).
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// TOTP secret: either a raw base32 secret or a full otpauth:// URI.
    #[serde(default)]
    pub totp: Option<String>,
    #[serde(default)]
    pub custom_fields: Vec<CustomField>,
    /// Reserved for passkey (WebAuthn credential) storage — schema stable, UI later.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub passkey: Option<serde_json::Value>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    #[serde(default)]
    pub favorite: bool,
    /// Archived entries are hidden from the main list but stay searchable.
    #[serde(default)]
    pub archived: bool,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    #[serde(default)]
    pub password_changed: Option<DateTime<Utc>>,
    /// Previous passwords, newest first. Capped at 10 by the engine.
    #[serde(default)]
    pub history: Vec<EntryHistory>,
    /// Tombstone: deleted entries stay in the vault so deletions replicate
    /// through sync instead of resurrecting on merge. Purged via "empty trash".
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub vv: VersionVector,
}

impl Vault {
    pub fn new(name: &str) -> Self {
        let now = Utc::now();
        Vault {
            meta: VaultMeta {
                name: name.to_string(),
                created: now,
                modified: now,
                generation: 0,
            },
            folders: Vec::new(),
            entries: Vec::new(),
        }
    }

    pub fn entry(&self, id: Uuid) -> Option<&Entry> {
        self.entries.iter().find(|e| e.id == id)
    }

    pub fn entry_mut(&mut self, id: Uuid) -> Option<&mut Entry> {
        self.entries.iter_mut().find(|e| e.id == id)
    }
}

impl Entry {
    pub fn new(title: &str) -> Self {
        let now = Utc::now();
        Entry {
            id: Uuid::new_v4(),
            folder: None,
            category: default_category(),
            title: title.to_string(),
            username: String::new(),
            password: String::new(),
            urls: Vec::new(),
            notes: String::new(),
            tags: Vec::new(),
            totp: None,
            custom_fields: Vec::new(),
            passkey: None,
            attachments: Vec::new(),
            favorite: false,
            archived: false,
            created: now,
            modified: now,
            password_changed: None,
            history: Vec::new(),
            deleted: false,
            deleted_at: None,
            vv: VersionVector::new(),
        }
    }

    /// Record an edit made on `device_id`: bump the version vector and timestamps.
    pub fn touch(&mut self, device_id: &str) {
        *self.vv.entry(device_id.to_string()).or_insert(0) += 1;
        self.modified = chrono::Utc::now();
    }
}
