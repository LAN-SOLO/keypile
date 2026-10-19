//! Three-way-free merge of two vault replicas via per-entry version vectors.
//!
//! Rules (never silently lose data):
//! - Entry only in one replica → keep it.
//! - One version vector dominates the other → the dominated side lost, keep
//!   the dominating entry (this includes tombstones: a dominating delete wins).
//! - Concurrent edits (neither VV dominates) → keep BOTH: the local entry
//!   stays, the remote one is added as a conflict copy for manual resolution.
//!   A purged tombstone (`purged: true`) never becomes a conflict copy: it
//!   holds no data, so a concurrent edit on the other side simply survives.

use std::collections::BTreeMap;

use crate::model::{Vault, VersionVector};

#[derive(Debug, PartialEq)]
enum VvOrder {
    Equal,
    LeftNewer,
    RightNewer,
    Concurrent,
}

fn compare_vv(a: &VersionVector, b: &VersionVector) -> VvOrder {
    let mut a_ahead = false;
    let mut b_ahead = false;
    let devices: std::collections::BTreeSet<&String> = a.keys().chain(b.keys()).collect();
    for d in devices {
        let av = a.get(d).copied().unwrap_or(0);
        let bv = b.get(d).copied().unwrap_or(0);
        if av > bv {
            a_ahead = true;
        }
        if bv > av {
            b_ahead = true;
        }
    }
    match (a_ahead, b_ahead) {
        (false, false) => VvOrder::Equal,
        (true, false) => VvOrder::LeftNewer,
        (false, true) => VvOrder::RightNewer,
        (true, true) => VvOrder::Concurrent,
    }
}

pub struct MergeResult {
    pub vault: Vault,
    pub conflicts: usize,
    pub taken_remote: usize,
}

/// Merge `remote` into `local`. Folder merge is name-based and additive
/// (folders are cheap; entries are the data that must never be lost).
pub fn merge(local: &Vault, remote: &Vault) -> MergeResult {
    merge_with_label(local, remote, "Konflikt")
}

/// Like [`merge`], with the word appended to conflict copies ("Title (label)")
/// in the UI language of the device that does the merge.
pub fn merge_with_label(local: &Vault, remote: &Vault, label: &str) -> MergeResult {
    let mut out = local.clone();
    let mut conflicts = 0;
    let mut taken_remote = 0;

    // --- folders: union by id; a dominating version vector carries renames
    // and deletions across devices. Concurrent folder edits keep the local
    // state (folders hold no secrets — entries are what must never be lost).
    for rf in &remote.folders {
        match out.folders.iter_mut().find(|f| f.id == rf.id) {
            None => out.folders.push(rf.clone()),
            Some(lf) => match compare_vv(&lf.vv, &rf.vv) {
                VvOrder::RightNewer => *lf = rf.clone(),
                VvOrder::Concurrent => {
                    for (d, c) in &rf.vv {
                        let slot = lf.vv.entry(d.clone()).or_insert(0);
                        *slot = (*slot).max(*c);
                    }
                }
                VvOrder::Equal | VvOrder::LeftNewer => {}
            },
        }
    }

    // --- entries ---
    let local_ids: BTreeMap<_, _> = local.entries.iter().map(|e| (e.id, ())).collect();
    for re in &remote.entries {
        match out.entry_mut(re.id) {
            None => {
                out.entries.push(re.clone());
                taken_remote += 1;
            }
            Some(le) => match compare_vv(&le.vv, &re.vv) {
                VvOrder::Equal | VvOrder::LeftNewer => {}
                VvOrder::RightNewer => {
                    *le = re.clone();
                    taken_remote += 1;
                }
                VvOrder::Concurrent => {
                    // Keep both. Merge the VVs into the surviving local entry so
                    // the conflict doesn't re-trigger on the next merge.
                    let mut merged_vv = le.vv.clone();
                    for (d, c) in &re.vv {
                        let slot = merged_vv.entry(d.clone()).or_insert(0);
                        *slot = (*slot).max(*c);
                    }
                    le.vv = merged_vv.clone();
                    if re.purged {
                        // a purge tombstone carries no data: the concurrent
                        // local edit simply survives, nothing to copy
                        continue;
                    }
                    let mut copy = re.clone();
                    copy.id = uuid::Uuid::new_v4();
                    copy.title = format!("{} ({label})", copy.title);
                    copy.vv = merged_vv;
                    out.entries.push(copy);
                    conflicts += 1;
                }
            },
        }
    }
    let _ = local_ids;

    if taken_remote > 0 || conflicts > 0 {
        out.meta.modified = chrono::Utc::now();
    }

    MergeResult {
        vault: out,
        conflicts,
        taken_remote,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Entry;

    fn vault_with(entries: Vec<Entry>) -> Vault {
        let mut v = Vault::new("t");
        v.entries = entries;
        v
    }

    #[test]
    fn remote_only_entry_is_added() {
        let a = vault_with(vec![]);
        let mut e = Entry::new("new");
        e.touch("deviceB");
        let b = vault_with(vec![e]);
        let r = merge(&a, &b);
        assert_eq!(r.vault.entries.len(), 1);
        assert_eq!(r.conflicts, 0);
    }

    #[test]
    fn newer_remote_wins() {
        let mut e = Entry::new("site");
        e.touch("A");
        let local = vault_with(vec![e.clone()]);
        let mut e2 = e.clone();
        e2.password = "updated".into();
        e2.touch("A"); // strictly newer on same device
        let remote = vault_with(vec![e2]);
        let r = merge(&local, &remote);
        assert_eq!(r.vault.entries.len(), 1);
        assert_eq!(r.vault.entries[0].password, "updated");
    }

    #[test]
    fn newer_local_kept() {
        let mut e = Entry::new("site");
        e.touch("A");
        let remote = vault_with(vec![e.clone()]);
        let mut e2 = e.clone();
        e2.password = "local-newer".into();
        e2.touch("A");
        let local = vault_with(vec![e2]);
        let r = merge(&local, &remote);
        assert_eq!(r.vault.entries.len(), 1);
        assert_eq!(r.vault.entries[0].password, "local-newer");
        assert_eq!(r.taken_remote, 0);
    }

    #[test]
    fn concurrent_edit_keeps_both() {
        let mut base = Entry::new("site");
        base.touch("A");
        let mut le = base.clone();
        le.password = "edit-on-A".into();
        le.touch("A");
        let mut re = base.clone();
        re.password = "edit-on-B".into();
        re.touch("B");
        let local = vault_with(vec![le]);
        let remote = vault_with(vec![re]);
        let r = merge(&local, &remote);
        assert_eq!(r.conflicts, 1);
        assert_eq!(r.vault.entries.len(), 2);
        assert!(r.vault.entries.iter().any(|e| e.title.contains("Konflikt")));
        // idempotent: merging again must not create more conflict copies
        let r2 = merge(&r.vault, &remote);
        assert_eq!(r2.conflicts, 0);
        assert_eq!(r2.vault.entries.len(), 2);
        // English UI: the conflict copy carries the English word
        let r3 = merge_with_label(&local, &remote, "conflict");
        assert!(r3.vault.entries.iter().any(|e| e.title == "site (conflict)"));
        assert!(!r3.vault.entries.iter().any(|e| e.title.contains("Konflikt")));
    }

    #[test]
    fn folder_rename_and_delete_propagate() {
        use crate::model::Folder;
        let base = Folder {
            id: uuid::Uuid::new_v4(),
            name: "Work".into(),
            parent: None,
            deleted: false,
            vv: [("A".to_string(), 1u64)].into_iter().collect(),
        };
        let mut local = Vault::new("t");
        local.folders.push(base.clone());
        let mut remote = local.clone();
        remote.folders[0].name = "Arbeit".into();
        remote.folders[0].vv.insert("B".into(), 1);
        let r = merge(&local, &remote);
        assert_eq!(r.vault.folders.len(), 1);
        assert_eq!(r.vault.folders[0].name, "Arbeit");

        let mut remote_del = local.clone();
        remote_del.folders[0].deleted = true;
        remote_del.folders[0].vv.insert("A".into(), 2);
        let r = merge(&local, &remote_del);
        assert!(r.vault.folders[0].deleted);

        // local newer → stays
        let r = merge(&remote_del, &local);
        assert!(r.vault.folders[0].deleted);
    }

    /// Emptying the trash on one device must not be undone by a device that
    /// still holds the (deleted) entry — the purge tombstone dominates.
    #[test]
    fn purge_replicates_instead_of_resurrecting() {
        let mut e = Entry::new("site");
        e.password = "secret".into();
        e.touch("A");
        e.deleted = true;
        e.touch("A");
        let other_device = vault_with(vec![e.clone()]);
        let mut purged = e.clone();
        purged.purge("A");
        let local = vault_with(vec![purged]);
        // both directions: the purge wins and no content comes back
        for r in [merge(&local, &other_device), merge(&other_device, &local)] {
            assert_eq!(r.vault.entries.len(), 1);
            let x = &r.vault.entries[0];
            assert!(x.purged && x.deleted);
            assert!(x.title.is_empty() && x.password.is_empty());
            assert_eq!(r.conflicts, 0);
        }
    }

    /// A concurrent edit on another device survives a purge (never lose data):
    /// purged locally + edited remotely → the edit comes back as conflict copy;
    /// edited locally + purged remotely → the local edit stays, no junk copy.
    #[test]
    fn concurrent_edit_survives_purge() {
        let mut base = Entry::new("site");
        base.touch("A");
        let mut purged = base.clone();
        purged.purge("A");
        let mut edited = base.clone();
        edited.password = "new".into();
        edited.touch("B");

        let r = merge(&vault_with(vec![purged.clone()]), &vault_with(vec![edited.clone()]));
        assert_eq!(r.conflicts, 1);
        assert!(r.vault.entries.iter().any(|e| !e.purged && e.password == "new"));

        let r = merge(&vault_with(vec![edited]), &vault_with(vec![purged]));
        assert_eq!(r.vault.entries.len(), 1);
        assert!(!r.vault.entries[0].purged);
        assert_eq!(r.vault.entries[0].password, "new");
    }

    #[test]
    fn purged_flag_roundtrips_and_is_omitted_when_false() {
        let mut e = Entry::new("x");
        let json = serde_json::to_string(&e).unwrap();
        assert!(!json.contains("purged"));
        e.purge("A");
        let back: Entry = serde_json::from_str(&serde_json::to_string(&e).unwrap()).unwrap();
        assert!(back.purged && back.deleted && back.title.is_empty());
    }

    #[test]
    fn dominating_delete_wins() {
        let mut e = Entry::new("site");
        e.touch("A");
        let local = vault_with(vec![e.clone()]);
        let mut del = e.clone();
        del.deleted = true;
        del.touch("B");
        del.touch("B");
        // remote saw A's edit and then deleted → dominates
        let remote = vault_with(vec![del]);
        let r = merge(&local, &remote);
        assert_eq!(r.vault.entries.len(), 1);
        assert!(r.vault.entries[0].deleted);
    }
}
