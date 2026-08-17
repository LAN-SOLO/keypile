import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, EntrySummary, Folder } from '../api';
import { useApp } from '../App';
import EntryDetail from './EntryDetail';
import GeneratorModal from './GeneratorModal';
import SettingsModal from './SettingsModal';
import HealthView from './HealthView';

export type Filter =
  | { kind: 'all' }
  | { kind: 'fav' }
  | { kind: 'trash' }
  | { kind: 'health' }
  | { kind: 'folder'; id: string };

export default function MainView() {
  const { t, toast, lock, refreshStatus } = useApp();
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const reload = useCallback(async () => {
    const [es, fs] = await Promise.all([api.listEntries(), api.listFolders()]);
    setEntries(es);
    setFolders(fs);
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visible = useMemo(() => {
    let list = entries;
    if (filter.kind === 'trash') list = list.filter((e) => e.deleted);
    else list = list.filter((e) => !e.deleted);
    if (filter.kind === 'fav') list = list.filter((e) => e.favorite);
    if (filter.kind === 'folder') list = list.filter((e) => e.folder === filter.id);
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

  const activeCount = entries.filter((e) => !e.deleted).length;
  const trashCount = entries.filter((e) => e.deleted).length;

  const select = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
  };

  const startCreate = () => {
    setSelectedId(null);
    setCreating(true);
    setEditing(true);
    if (filter.kind === 'trash' || filter.kind === 'health') setFilter({ kind: 'all' });
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

  return (
    <div className="main">
      <nav className="sidebar">
        <div className="brand">
          <span className="name">keypile</span>
          <span className="dot">.</span>
        </div>
        <button className={`side-item${isActive({ kind: 'all' }) ? ' active' : ''}`} onClick={() => setFilter({ kind: 'all' })}>
          {t.allEntries} <span className="count">{activeCount}</span>
        </button>
        <button className={`side-item${isActive({ kind: 'fav' }) ? ' active' : ''}`} onClick={() => setFilter({ kind: 'fav' })}>
          {t.favorites}
        </button>
        <button className={`side-item${isActive({ kind: 'health' }) ? ' active' : ''}`} onClick={() => setFilter({ kind: 'health' })}>
          {t.healthCheck}
        </button>
        <button className={`side-item${isActive({ kind: 'trash' }) ? ' active' : ''}`} onClick={() => setFilter({ kind: 'trash' })}>
          {t.trash} {trashCount > 0 && <span className="count">{trashCount}</span>}
        </button>

        <div className="side-section">{t.folders}</div>
        {folders.map((f) => (
          <div key={f.id} className="row" style={{ gap: 0 }}>
            <button
              className={`side-item${isActive({ kind: 'folder', id: f.id }) ? ' active' : ''}`}
              onClick={() => setFilter({ kind: 'folder', id: f.id })}
            >
              {f.name}
            </button>
            <button
              className="ghost icon noflex"
              title={t.delete}
              onClick={() => removeFolder(f.id)}
            >
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
          <button className="side-item" onClick={() => setShowGenerator(true)}>
            {t.generator}
          </button>
          <button className="side-item" onClick={() => setShowSettings(true)}>
            {t.settings}
          </button>
          <button className="side-item" onClick={lock}>
            {t.lock} ⌘L
          </button>
        </div>
      </nav>

      {filter.kind === 'health' ? (
        <HealthView entries={entries} onSelect={(id) => { setFilter({ kind: 'all' }); select(id); }} />
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
              <button className="primary noflex" title={t.newEntry} onClick={startCreate}>
                +
              </button>
            </div>
            <div className="entry-list">
              {visible.length === 0 && (
                <div className="list-empty">
                  {entries.length === 0 ? t.emptyVault : t.noResults}
                </div>
              )}
              {visible.map((e) => (
                <div
                  key={e.id}
                  className={`entry-item${selectedId === e.id ? ' active' : ''}`}
                  onClick={() => select(e.id)}
                >
                  <div className="t">
                    {e.favorite && <span className="star">★</span>}
                    {e.title}
                    {e.has_totp && <span className="badge">2FA</span>}
                  </div>
                  <div className="u">{e.username || e.url || '—'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="detail">
            {creating || selectedId ? (
              <EntryDetail
                key={creating ? 'new' : selectedId}
                entryId={creating ? null : selectedId}
                folders={folders}
                editing={editing}
                setEditing={setEditing}
                inTrash={filter.kind === 'trash'}
                onChanged={async (nextId) => {
                  await reload();
                  setCreating(false);
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
