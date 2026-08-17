import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, EntrySummary, Folder, UpdateInfo } from '../api';
import { useApp } from '../App';
import EntryDetail from './EntryDetail';
import GeneratorModal from './GeneratorModal';
import SettingsModal from './SettingsModal';
import AuditView from './AuditView';
import TemplatePicker from './TemplatePicker';
import { Category } from '../templates';
import {
  ArchiveIcon,
  CategoryIcon,
  DiceIcon,
  FolderIcon,
  GearIcon,
  KeyIcon,
  LockIcon,
  PaperclipIcon,
  PasskeyIcon,
  ShieldIcon,
  StarIcon,
  TimerIcon,
  TrashIcon,
  UpdateIcon,
} from '../icons';

export type Filter =
  | { kind: 'all' }
  | { kind: 'fav' }
  | { kind: 'audit' }
  | { kind: 'trash' }
  | { kind: 'archived' }
  | { kind: 'totp' }
  | { kind: 'attachments' }
  | { kind: 'category'; cat: string }
  | { kind: 'folder'; id: string };

export default function MainView() {
  const { t, toast, lock, refreshStatus } = useApp();
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState<Category | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);

  const reload = useCallback(async () => {
    const [es, fs] = await Promise.all([api.listEntries(), api.listFolders()]);
    setEntries(es);
    setFolders(fs);
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  // silent update check once per unlocked session
  useEffect(() => {
    api.checkUpdate().then(setUpdate).catch(() => {});
  }, []);

  const doUpdate = async () => {
    setUpdating(true);
    toast(t.updateInstalling);
    try {
      await api.installUpdate();
    } catch (err) {
      toast(String(err), true);
      setUpdating(false);
    }
  };

  const visible = useMemo(() => {
    let list = entries;
    if (filter.kind === 'trash') list = list.filter((e) => e.deleted);
    else list = list.filter((e) => !e.deleted);
    if (filter.kind === 'archived') list = list.filter((e) => e.archived);
    else if (filter.kind !== 'trash' && !search.trim())
      list = list.filter((e) => !e.archived);
    switch (filter.kind) {
      case 'fav':
        list = list.filter((e) => e.favorite);
        break;
      case 'totp':
        list = list.filter((e) => e.has_totp);
        break;
      case 'attachments':
        list = list.filter((e) => e.attachment_count > 0);
        break;
      case 'category':
        list = list.filter((e) => e.category === filter.cat);
        break;
      case 'folder':
        list = list.filter((e) => e.folder === filter.id);
        break;
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          (e.url ?? '').toLowerCase().includes(q) ||
          e.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return list;
  }, [entries, filter, search]);

  const active = entries.filter((e) => !e.deleted && !e.archived);
  const trashCount = entries.filter((e) => e.deleted).length;
  const archivedCount = entries.filter((e) => e.archived && !e.deleted).length;
  const totpCount = active.filter((e) => e.has_totp).length;
  const attachCount = active.filter((e) => e.attachment_count > 0).length;
  const usedCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of active) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return counts;
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setCreating(null);
  };

  const startCreate = (cat: Category) => {
    setShowTemplates(false);
    setSelectedId(null);
    setCreating(cat);
    setEditing(true);
    if (filter.kind === 'trash' || filter.kind === 'audit') setFilter({ kind: 'all' });
  };

  const [folderDraft, setFolderDraft] = useState<string | null>(null);
  const commitFolder = async () => {
    const name = folderDraft?.trim();
    setFolderDraft(null);
    if (!name) return;
    try {
      await api.saveFolder(null, name);
      await reload();
    } catch (err) {
      toast(String(err), true);
    }
  };

  // ⌘L / Ctrl+L locks the vault
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lock]);

  const removeFolder = async (id: string) => {
    try {
      await api.deleteFolder(id);
      if (filter.kind === 'folder' && filter.id === id) setFilter({ kind: 'all' });
      await reload();
    } catch (err) {
      toast(String(err), true);
    }
  };

  const isActive = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);
  const item = (f: Filter, icon: JSX.Element, label: string, count?: number, badge?: string) => (
    <button
      className={`side-item${isActive(f) ? ' active' : ''}`}
      onClick={() => setFilter(f)}
    >
      {icon} {label}
      {badge && <span className="badge soon">{badge}</span>}
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  );

  return (
    <div className="main">
      <nav className="sidebar">
        <div className="brand">
          <span className="name">keypile</span>
          <span className="dot">.</span>
        </div>
        {item({ kind: 'all' }, <KeyIcon />, t.allEntries, active.length)}
        {item({ kind: 'fav' }, <StarIcon />, t.favorites)}
        {item({ kind: 'audit' }, <ShieldIcon />, t.audit)}

        <div className="side-section">{t.categoriesSection}</div>
        {[...usedCategories.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([cat, n]) =>
            item({ kind: 'category', cat }, <CategoryIcon category={cat} />, t.categories[cat] ?? cat, n)
          )}

        <div className="side-section">{t.othersSection}</div>
        <button className="side-item" disabled title={t.comingSoon}>
          <PasskeyIcon /> {t.passkeys}
          <span className="badge soon">{t.comingSoon}</span>
        </button>
        {item({ kind: 'totp' }, <TimerIcon />, t.oneTimeCodes, totpCount)}
        {item({ kind: 'attachments' }, <PaperclipIcon />, t.attachmentsNav, attachCount)}
        {item({ kind: 'archived' }, <ArchiveIcon />, t.archived, archivedCount)}
        {item({ kind: 'trash' }, <TrashIcon />, t.trash, trashCount)}

        <div className="side-section">{t.folders}</div>
        {folders.map((f) => (
          <div key={f.id} className="row" style={{ gap: 0 }}>
            <button
              className={`side-item${isActive({ kind: 'folder', id: f.id }) ? ' active' : ''}`}
              onClick={() => setFilter({ kind: 'folder', id: f.id })}
            >
              <FolderIcon /> {f.name}
            </button>
            <button className="ghost icon noflex" title={t.delete} onClick={() => removeFolder(f.id)}>
              ×
            </button>
          </div>
        ))}
        {folderDraft === null ? (
          <button
            className="side-item"
            style={{ color: 'var(--text-faint)' }}
            onClick={() => setFolderDraft('')}
          >
            + {t.newFolder}
          </button>
        ) : (
          <input
            type="text"
            autoFocus
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            onBlur={commitFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitFolder();
              if (e.key === 'Escape') setFolderDraft(null);
            }}
          />
        )}

        <div className="bottom">
          {update && (
            <button className="side-item update-item" onClick={doUpdate} disabled={updating}>
              <UpdateIcon /> {updating ? '…' : t.updateAvailable(update.version)}
            </button>
          )}
          <button className="side-item" onClick={() => setShowGenerator(true)}>
            <DiceIcon /> {t.generator}
          </button>
          <button className="side-item" onClick={() => setShowSettings(true)}>
            <GearIcon /> {t.settings}
          </button>
          <button className="side-item" onClick={lock}>
            <LockIcon /> {t.lock} ⌘L
          </button>
        </div>
      </nav>

      {filter.kind === 'audit' ? (
        <AuditView
          entries={entries}
          onSelect={(id) => {
            setFilter({ kind: 'all' });
            select(id);
          }}
        />
      ) : (
        <>
          <section className="listpane">
            <div className="searchbar">
              <input
                type="text"
                placeholder={t.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="primary noflex"
                title={t.newEntry}
                onClick={() => setShowTemplates(true)}
              >
                +
              </button>
            </div>
            <div className="entry-list">
              {visible.length === 0 && (
                <div className="list-empty">{entries.length === 0 ? t.emptyVault : t.noResults}</div>
              )}
              {visible.map((e) => (
                <div
                  key={e.id}
                  className={`entry-item${selectedId === e.id ? ' active' : ''}`}
                  onClick={() => select(e.id)}
                >
                  <div className="t">
                    <span className="cat-ico">
                      <CategoryIcon category={e.category} size={15} />
                    </span>
                    {e.favorite && <span className="star">★</span>}
                    <span className="title-text">{e.title}</span>
                    {e.has_totp && <span className="badge">2FA</span>}
                    {e.attachment_count > 0 && (
                      <span className="badge">
                        <PaperclipIcon size={10} />
                      </span>
                    )}
                  </div>
                  <div className="u">{e.username || e.url || '—'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="detail">
            {creating || selectedId ? (
              <EntryDetail
                key={creating ? `new-${creating}` : selectedId}
                entryId={creating ? null : selectedId}
                newCategory={creating}
                folders={folders}
                editing={editing}
                setEditing={setEditing}
                inTrash={filter.kind === 'trash'}
                onChanged={async (nextId) => {
                  await reload();
                  setCreating(null);
                  setEditing(false);
                  setSelectedId(nextId);
                }}
              />
            ) : (
              <div className="list-empty" style={{ marginTop: 80 }}>
                {t.emptySelection}
              </div>
            )}
            {filter.kind === 'trash' && trashCount > 0 && !selectedId && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button
                  className="danger"
                  onClick={async () => {
                    if (await confirmDialog(t.confirmEmptyTrash)) {
                      await api.emptyTrash();
                      setSelectedId(null);
                      await reload();
                    }
                  }}
                >
                  {t.emptyTrash}
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {showTemplates && (
        <TemplatePicker onPick={startCreate} onClose={() => setShowTemplates(false)} />
      )}
      {showGenerator && <GeneratorModal onClose={() => setShowGenerator(false)} />}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onVaultChanged={reload} />
      )}
    </div>
  );
}

export async function confirmDialog(message: string): Promise<boolean> {
  const { confirm } = await import('@tauri-apps/plugin-dialog');
  return confirm(message);
}
