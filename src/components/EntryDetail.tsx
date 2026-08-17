import { useEffect, useState } from 'react';
import { api, CustomField, Entry, EntryInput, Folder } from '../api';
import { useApp } from '../App';
import StrengthMeter from './StrengthMeter';
import GeneratorModal from './GeneratorModal';
import { confirmDialog } from './MainView';

interface Props {
  entryId: string | null; // null = create new
  folders: Folder[];
  editing: boolean;
  setEditing: (e: boolean) => void;
  inTrash: boolean;
  onChanged: (selectId: string | null) => Promise<void>;
}

const emptyDraft = (): EntryInput => ({
  id: null,
  folder: null,
  title: '',
  username: '',
  password: '',
  urls: [],
  notes: '',
  tags: [],
  totp: null,
  custom_fields: [],
  favorite: false,
});

export default function EntryDetail(props: Props) {
  const { t, toast } = useApp();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<EntryInput>(emptyDraft());
  const [revealed, setRevealed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [genFor, setGenFor] = useState(false);

  useEffect(() => {
    if (props.entryId) {
      api.getEntry(props.entryId).then((e) => {
        setEntry(e);
        setDraft({
          id: e.id,
          folder: e.folder,
          title: e.title,
          username: e.username,
          password: e.password,
          urls: e.urls,
          notes: e.notes,
          tags: e.tags,
          totp: e.totp,
          custom_fields: e.custom_fields,
          favorite: e.favorite,
        });
      });
    } else {
      setEntry(null);
      setDraft(emptyDraft());
    }
    setRevealed(false);
    setShowHistory(false);
  }, [props.entryId]);

  const copyField = async (field: 'username' | 'password' | 'totp') => {
    if (!entry) return;
    try {
      await api.copyEntryField(entry.id, field);
      toast(t.copied);
    } catch (err) {
      toast(String(err), true);
    }
  };

  const copyText = async (text: string) => {
    await api.copySecret(text);
    toast(t.copied);
  };

  const save = async () => {
    if (!draft.title.trim()) return;
    try {
      const saved = await api.saveEntry({
        ...draft,
        title: draft.title.trim(),
        urls: draft.urls.map((u) => u.trim()).filter(Boolean),
        tags: draft.tags.map((x) => x.trim()).filter(Boolean),
        totp: draft.totp?.trim() || null,
      });
      await props.onChanged(saved.id);
    } catch (err) {
      toast(String(err), true);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!(await confirmDialog(t.confirmDelete))) return;
    await api.deleteEntry(entry.id);
    await props.onChanged(null);
  };

  const purge = async () => {
    if (!entry) return;
    if (!(await confirmDialog(t.confirmPurge))) return;
    await api.purgeEntry(entry.id);
    await props.onChanged(null);
  };

  const restore = async () => {
    if (!entry) return;
    await api.restoreEntry(entry.id);
    await props.onChanged(entry.id);
  };

  const openUrl = async (url: string) => {
    const { openUrl: doOpen } = await import('@tauri-apps/plugin-opener');
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await doOpen(full);
  };

  // ---------- edit mode ----------
  if (props.editing) {
    const set = (patch: Partial<EntryInput>) => setDraft({ ...draft, ...patch });
    return (
      <div>
        <div className="head">
          <h2>{entry ? t.edit : t.newEntry}</h2>
        </div>
        <label className="field">
          <span>{t.title}</span>
          <input
            type="text"
            autoFocus
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="field">
          <span>{t.username}</span>
          <input
            type="text"
            value={draft.username}
            onChange={(e) => set({ username: e.target.value })}
          />
        </label>
        <label className="field">
          <span>{t.password}</span>
          <div className="row">
            <input
              type={revealed ? 'text' : 'password'}
              className="mono"
              value={draft.password}
              onChange={(e) => set({ password: e.target.value })}
            />
            <button type="button" className="noflex" onClick={() => setRevealed(!revealed)}>
              {revealed ? t.hide : t.reveal}
            </button>
            <button type="button" className="noflex" onClick={() => setGenFor(true)}>
              ⚙︎
            </button>
          </div>
          <StrengthMeter password={draft.password} context={[draft.username, draft.title]} />
        </label>
        {[...draft.urls, ''].map((u, i) => (
          <label className="field" key={i}>
            <span>
              {t.url} {i > 0 ? i + 1 : ''}
            </span>
            <input
              type="text"
              value={u}
              placeholder={i === draft.urls.length ? t.addUrl : ''}
              onChange={(e) => {
                const urls = [...draft.urls];
                if (i === urls.length) urls.push(e.target.value);
                else urls[i] = e.target.value;
                set({ urls: urls.filter((x, idx) => x !== '' || idx === urls.length - 1) });
              }}
            />
          </label>
        ))}
        <label className="field">
          <span>{t.totp}</span>
          <input
            type="text"
            className="mono"
            value={draft.totp ?? ''}
            onChange={(e) => set({ totp: e.target.value })}
          />
        </label>
        <label className="field">
          <span>{t.tags}</span>
          <input
            type="text"
            value={draft.tags.join(', ')}
            onChange={(e) => set({ tags: e.target.value.split(',') })}
          />
        </label>
        <label className="field">
          <span>{t.folders}</span>
          <select
            value={draft.folder ?? ''}
            onChange={(e) => set({ folder: e.target.value || null })}
          >
            <option value="">{t.folderNone}</option>
            {props.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t.notes}</span>
          <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>

        <div className="fieldlabel">{t.customFields}</div>
        {draft.custom_fields.map((f, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <input
              type="text"
              placeholder={t.fieldName}
              value={f.name}
              onChange={(e) => {
                const cf = [...draft.custom_fields];
                cf[i] = { ...f, name: e.target.value };
                set({ custom_fields: cf });
              }}
            />
            <input
              type={f.protected ? 'password' : 'text'}
              placeholder={t.fieldValue}
              value={f.value}
              onChange={(e) => {
                const cf = [...draft.custom_fields];
                cf[i] = { ...f, value: e.target.value };
                set({ custom_fields: cf });
              }}
            />
            <label className="check noflex" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={f.protected}
                onChange={(e) => {
                  const cf = [...draft.custom_fields];
                  cf[i] = { ...f, protected: e.target.checked };
                  set({ custom_fields: cf });
                }}
              />
              {t.protectedField}
            </label>
            <button
              className="ghost icon noflex"
              onClick={() => set({ custom_fields: draft.custom_fields.filter((_, x) => x !== i) })}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="ghost"
          onClick={() =>
            set({
              custom_fields: [...draft.custom_fields, { name: '', value: '', protected: false } as CustomField],
            })
          }
        >
          + {t.addField}
        </button>

        <label className="check" style={{ marginTop: 14 }}>
          <input
            type="checkbox"
            checked={draft.favorite}
            onChange={(e) => set({ favorite: e.target.checked })}
          />
          {t.favorite}
        </label>

        <div className="row" style={{ marginTop: 20, maxWidth: 320 }}>
          <button
            onClick={() => {
              props.setEditing(false);
              if (!entry) props.onChanged(null);
            }}
          >
            {t.cancel}
          </button>
          <button className="primary" onClick={save} disabled={!draft.title.trim()}>
            {t.save}
          </button>
        </div>

        {genFor && (
          <GeneratorModal
            onClose={() => setGenFor(false)}
            onPick={(pw) => {
              set({ password: pw });
              setGenFor(false);
            }}
          />
        )}
      </div>
    );
  }

  // ---------- view mode ----------
  if (!entry) return null;
  const fmtDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div>
      <div className="head">
        <h2>
          {entry.favorite && <span className="star">★ </span>}
          {entry.title}
        </h2>
        {!props.inTrash ? (
          <>
            <button onClick={() => props.setEditing(true)}>{t.edit}</button>
            <button className="danger" onClick={remove}>
              {t.delete}
            </button>
          </>
        ) : (
          <>
            <button onClick={restore}>{t.restore}</button>
            <button className="danger" onClick={purge}>
              {t.deleteForever}
            </button>
          </>
        )}
      </div>

      {entry.username && (
        <div className="kv">
          <div className="fieldlabel">{t.username}</div>
          <div className="val">
            <span className="text">{entry.username}</span>
            <button className="icon" onClick={() => copyField('username')}>
              {t.copy}
            </button>
          </div>
        </div>
      )}

      {entry.password && (
        <div className="kv">
          <div className="fieldlabel">{t.password}</div>
          <div className="val">
            <span className="text">{revealed ? entry.password : '••••••••••••'}</span>
            <button className="icon" onClick={() => setRevealed(!revealed)}>
              {revealed ? t.hide : t.reveal}
            </button>
            <button className="icon" onClick={() => copyField('password')}>
              {t.copy}
            </button>
          </div>
        </div>
      )}

      {entry.totp && <TotpBlock entryId={entry.id} onCopy={() => copyField('totp')} />}

      {entry.urls.map((u, i) => (
        <div className="kv" key={i}>
          <div className="fieldlabel">{t.url}</div>
          <div className="val">
            <span className="text">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl(u);
                }}
              >
                {u}
              </a>
            </span>
            <button className="icon" onClick={() => copyText(u)}>
              {t.copy}
            </button>
          </div>
        </div>
      ))}

      {entry.custom_fields.map((f, i) => (
        <CustomFieldView key={i} field={f} onCopy={() => copyText(f.value)} />
      ))}

      {entry.tags.length > 0 && (
        <div className="kv">
          {entry.tags.map((tag) => (
            <span key={tag} className="tagchip">
              {tag}
            </span>
          ))}
        </div>
      )}

      {entry.notes && (
        <div className="kv">
          <div className="fieldlabel">{t.notes}</div>
          <div className="notes-box">{entry.notes}</div>
        </div>
      )}

      {entry.history.length > 0 && (
        <div className="kv">
          <button className="ghost" onClick={() => setShowHistory(!showHistory)}>
            {t.history} ({entry.history.length})
          </button>
          {showHistory &&
            entry.history.map((h, i) => (
              <div className="val" key={i} style={{ marginTop: 6 }}>
                <span className="text">{h.password}</span>
                <span className="faint">{fmtDate(h.replaced)}</span>
                <button className="icon" onClick={() => copyText(h.password)}>
                  {t.copy}
                </button>
              </div>
            ))}
        </div>
      )}

      <div className="faint" style={{ marginTop: 26 }}>
        {t.created}: {fmtDate(entry.created)} · {t.modified}: {fmtDate(entry.modified)}
      </div>
    </div>
  );
}

function CustomFieldView({ field, onCopy }: { field: CustomField; onCopy: () => void }) {
  const { t } = useApp();
  const [show, setShow] = useState(false);
  return (
    <div className="kv">
      <div className="fieldlabel">{field.name}</div>
      <div className="val">
        <span className="text">
          {field.protected && !show ? '••••••••' : field.value}
        </span>
        {field.protected && (
          <button className="icon" onClick={() => setShow(!show)}>
            {show ? t.hide : t.reveal}
          </button>
        )}
        <button className="icon" onClick={onCopy}>
          {t.copy}
        </button>
      </div>
    </div>
  );
}

function TotpBlock({ entryId, onCopy }: { entryId: string; onCopy: () => void }) {
  const { t } = useApp();
  const [code, setCode] = useState<{ code: string; remaining: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .totpCode(entryId)
        .then((c) => alive && setCode(c))
        .catch((e) => alive && setError(String(e)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [entryId]);

  if (error) return <div className="error-text">{error}</div>;
  if (!code) return null;
  const pretty = code.code.length === 6 ? `${code.code.slice(0, 3)} ${code.code.slice(3)}` : code.code;
  return (
    <div className="kv">
      <div className="fieldlabel">{t.totpCode}</div>
      <div className="val">
        <span className="text totp-code">{pretty}</span>
        <span className="totp-ring">{code.remaining}s</span>
        <button className="icon" onClick={onCopy}>
          {t.copy}
        </button>
      </div>
    </div>
  );
}
