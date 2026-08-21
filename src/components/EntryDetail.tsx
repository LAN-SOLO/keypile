import { useEffect, useState } from 'react';
import { api, CustomField, Entry, EntryInput, FIELD_TYPES, Folder, normalizeFieldType } from '../api';
import { useApp } from '../App';
import StrengthMeter from './StrengthMeter';
import GeneratorModal from './GeneratorModal';
import UnlockedBadge from './UnlockedBadge';
import { confirmDialog } from './MainView';
import { Category, TEMPLATES, normalizeCategory, parseTemplateField } from '../templates';
import { ArchiveIcon, CategoryIcon, PaperclipIcon } from '../icons';

interface Props {
  entryId: string | null; // null = create new
  newCategory: Category | null;
  folders: Folder[];
  editing: boolean;
  setEditing: (e: boolean) => void;
  inTrash: boolean;
  onChanged: (selectId: string | null) => Promise<void>;
}

const draftFor = (cat: Category, t: { templateFields: Record<string, string> }): EntryInput => ({
  id: null,
  folder: null,
  category: cat,
  title: '',
  username: '',
  password: '',
  urls: [],
  notes: '',
  tags: [],
  totp: null,
  custom_fields: TEMPLATES[cat].fields.map((f) => {
    const spec = parseTemplateField(f);
    return {
      name: t.templateFields[spec.key] ?? spec.key,
      value: '',
      protected: spec.protected,
      field_type: spec.fieldType,
    };
  }),
  favorite: false,
});

export default function EntryDetail(props: Props) {
  const { t, toast } = useApp();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<EntryInput>(draftFor(props.newCategory ?? 'login', t));
  const [revealed, setRevealed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [genFor, setGenFor] = useState(false);
  // custom-field editing: per-row reveal, options dialog, drag & drop reorder
  const [cfShow, setCfShow] = useState<Record<number, boolean>>({});
  const [cfOptions, setCfOptions] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [dragArmed, setDragArmed] = useState<number | null>(null);

  const loadEntry = (id: string) =>
    api.getEntry(id).then((e) => {
      setEntry(e);
      setDraft({
        id: e.id,
        folder: e.folder,
        category: e.category,
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

  useEffect(() => {
    if (props.entryId) {
      loadEntry(props.entryId);
    } else {
      setEntry(null);
      setDraft(draftFor(props.newCategory ?? 'login', t));
    }
    setRevealed(false);
    setShowHistory(false);
    setCfShow({});
    setCfOptions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.entryId, props.newCategory]);

  const template = TEMPLATES[normalizeCategory(draft.category)];

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
        custom_fields: draft.custom_fields.filter((f) => f.name.trim() || f.value.trim()),
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

  const toggleArchive = async () => {
    if (!entry) return;
    await api.setArchived(entry.id, !entry.archived);
    await props.onChanged(entry.id);
  };

  const addAttachment = async () => {
    if (!entry) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ multiple: false });
    if (typeof sel !== 'string') return;
    try {
      const updated = await api.addAttachment(entry.id, sel);
      setEntry(updated);
      await props.onChanged(entry.id);
    } catch (err) {
      toast(String(err), true);
    }
  };

  const saveAttachment = async (attId: string, name: string) => {
    if (!entry) return;
    const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
    const sel = await saveDialog({ defaultPath: name });
    if (typeof sel !== 'string') return;
    try {
      await api.saveAttachment(entry.id, attId, sel);
      toast('✓');
    } catch (err) {
      toast(String(err), true);
    }
  };

  const removeAttachment = async (attId: string) => {
    if (!entry) return;
    if (!(await confirmDialog(t.confirmRemoveAttachment))) return;
    try {
      await api.removeAttachment(entry.id, attId);
      await loadEntry(entry.id);
      await props.onChanged(entry.id);
    } catch (err) {
      toast(String(err), true);
    }
  };

  const openUrl = async (url: string) => {
    const { openUrl: doOpen } = await import('@tauri-apps/plugin-opener');
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await doOpen(full);
  };

  const fmtSize = (bytes: number) =>
    bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  // ---------- edit mode ----------
  if (props.editing) {
    const set = (patch: Partial<EntryInput>) => setDraft({ ...draft, ...patch });
    return (
      <div>
        <div className="head">
          <span className="cat-chip">
            <CategoryIcon category={draft.category} size={20} />
          </span>
          <h2>
            {entry ? t.edit : t.newEntry} — {t.categories[normalizeCategory(draft.category)]}
          </h2>
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
        {template.username && (
          <label className="field">
            <span>{t.username}</span>
            <input
              type="text"
              value={draft.username}
              onChange={(e) => set({ username: e.target.value })}
            />
          </label>
        )}
        {template.password && (
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
        )}
        {template.urls &&
          [...draft.urls, ''].map((u, i) => (
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
        {template.totp && (
          <label className="field">
            <span>
              {t.totp} <UnlockedBadge />
            </span>
            <input
              type="text"
              className="mono"
              value={draft.totp ?? ''}
              onChange={(e) => set({ totp: e.target.value })}
            />
          </label>
        )}

        <div className="fieldlabel">{t.customFields}</div>
        {draft.custom_fields.map((f, i) => {
          const ftype = normalizeFieldType(f.field_type);
          const patchField = (patch: Partial<CustomField>) => {
            const cf = [...draft.custom_fields];
            cf[i] = { ...f, ...patch };
            set({ custom_fields: cf });
          };
          const removeField = () => {
            setCfShow({});
            set({ custom_fields: draft.custom_fields.filter((_, x) => x !== i) });
          };
          const valueInput =
            ftype === 'multiline' ? (
              <textarea
                placeholder={t.fieldValue}
                value={f.value}
                rows={3}
                onChange={(e) => patchField({ value: e.target.value })}
              />
            ) : (
              <input
                type={
                  f.protected && !cfShow[i]
                    ? 'password'
                    : ftype === 'date'
                      ? 'date'
                      : 'text'
                }
                className={['password', 'pin', 'numeric'].includes(ftype) ? 'mono' : undefined}
                inputMode={['pin', 'numeric', 'phone'].includes(ftype) ? 'numeric' : undefined}
                placeholder={t.fieldValue}
                value={f.value}
                onChange={(e) => patchField({ value: e.target.value })}
              />
            );
          return (
            <div
              className={
                'cf-row' +
                (ftype === 'section' ? ' cf-section-row' : '') +
                (dragIdx === i ? ' dragging' : '') +
                (overIdx === i && dragIdx !== null && dragIdx !== i ? ' dragover' : '')
              }
              key={i}
              draggable={dragArmed === i}
              onDragStart={(e) => {
                setDragIdx(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (dragIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverIdx(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== i) {
                  const cf = [...draft.custom_fields];
                  const [moved] = cf.splice(dragIdx, 1);
                  cf.splice(i, 0, moved);
                  setCfShow({});
                  set({ custom_fields: cf });
                }
                setDragIdx(null);
                setOverIdx(null);
                setDragArmed(null);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
                setDragArmed(null);
              }}
            >
              <span
                className="cf-handle"
                title={t.dragToReorder}
                onMouseDown={() => setDragArmed(i)}
                onMouseUp={() => setDragArmed(null)}
              >
                ≡
              </span>
              <input
                type="text"
                className={ftype === 'section' ? 'cf-section-name' : 'cf-name'}
                placeholder={ftype === 'section' ? t.fieldTypes.section : t.fieldName}
                value={f.name}
                onChange={(e) => patchField({ name: e.target.value })}
              />
              {ftype !== 'section' && valueInput}
              {ftype !== 'section' && f.protected && (
                <button
                  type="button"
                  className="icon noflex"
                  onClick={() => setCfShow({ ...cfShow, [i]: !cfShow[i] })}
                >
                  {cfShow[i] ? t.hide : t.reveal}
                </button>
              )}
              <button
                type="button"
                className="icon noflex"
                title={t.fieldOptions}
                onClick={() => setCfOptions(i)}
              >
                ⚙︎
              </button>
              <button type="button" className="ghost icon noflex" onClick={removeField}>
                ×
              </button>
            </div>
          );
        })}
        <div className="row" style={{ maxWidth: 420 }}>
          <button
            className="ghost"
            onClick={() => {
              set({
                custom_fields: [
                  ...draft.custom_fields,
                  { name: '', value: '', protected: false, field_type: 'text' },
                ],
              });
              setCfOptions(draft.custom_fields.length);
            }}
          >
            + {t.addField}
          </button>
          <button
            className="ghost"
            onClick={() =>
              set({
                custom_fields: [
                  ...draft.custom_fields,
                  { name: '', value: '', protected: false, field_type: 'section' },
                ],
              })
            }
          >
            + {t.addSection}
          </button>
        </div>

        <label className="field" style={{ marginTop: 14 }}>
          <span>{t.notes}</span>
          <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <label className="field">
          <span>{t.tags}</span>
          <input
            type="text"
            value={draft.tags.join(', ')}
            onChange={(e) => set({ tags: e.target.value.split(',') })}
          />
        </label>
        <div className="row" style={{ maxWidth: 420 }}>
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
            <span>{t.categoriesSection}</span>
            <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
              {Object.keys(TEMPLATES).map((cat) => (
                <option key={cat} value={cat}>
                  {t.categories[cat]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
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

        {cfOptions !== null && draft.custom_fields[cfOptions] && (
          <FieldOptionsModal
            field={draft.custom_fields[cfOptions]}
            onChange={(patch) => {
              const cf = [...draft.custom_fields];
              cf[cfOptions] = { ...cf[cfOptions], ...patch };
              set({ custom_fields: cf });
            }}
            onDelete={() => {
              set({ custom_fields: draft.custom_fields.filter((_, x) => x !== cfOptions) });
              setCfShow({});
              setCfOptions(null);
            }}
            onClose={() => setCfOptions(null)}
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
        <span className="cat-chip">
          <CategoryIcon category={entry.category} size={20} />
        </span>
        <h2>
          {entry.favorite && <span className="star">★ </span>}
          {entry.title}
        </h2>
        {!props.inTrash ? (
          <>
            <button onClick={() => props.setEditing(true)}>{t.edit}</button>
            <button title={entry.archived ? t.unarchive : t.archive} onClick={toggleArchive}>
              <ArchiveIcon size={14} />
            </button>
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

      <div className="kv">
        <div className="fieldlabel">
          {t.attachments} <UnlockedBadge />
        </div>
        {entry.attachments.map((a) => (
          <div className="val" key={a.id} style={{ marginBottom: 6 }}>
            <PaperclipIcon size={14} />
            <span className="text">{a.name}</span>
            <span className="faint">{fmtSize(a.size)}</span>
            <button className="icon" onClick={() => saveAttachment(a.id, a.name)}>
              {t.saveAttachmentAs}
            </button>
            <button className="icon danger" onClick={() => removeAttachment(a.id)}>
              ×
            </button>
          </div>
        ))}
        <button className="ghost" onClick={addAttachment}>
          + {t.addAttachment}
        </button>
        <div className="faint" style={{ marginTop: 4 }}>
          {t.attachmentNote}
        </div>
      </div>

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

function FieldOptionsModal({
  field,
  onChange,
  onDelete,
  onClose,
}: {
  field: CustomField;
  onChange: (patch: Partial<CustomField>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useApp();
  const ftype = normalizeFieldType(field.field_type);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{t.fieldOptions}</h3>
        </div>
        <div className="mbody">
          <label className="field">
            <span>{t.fieldName}</span>
            <input
              type="text"
              autoFocus
              value={field.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t.fieldTypeLabel}</span>
            <select
              value={ftype}
              onChange={(e) => {
                const next = e.target.value;
                // password/pin are sensitive by nature — pre-set the mask
                onChange({
                  field_type: next,
                  protected:
                    next === 'password' || next === 'pin'
                      ? true
                      : next === 'section'
                        ? false
                        : field.protected,
                });
              }}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {t.fieldTypes[ft]}
                </option>
              ))}
            </select>
          </label>
          {ftype !== 'section' && (
            <label className="check">
              <input
                type="checkbox"
                checked={field.protected}
                onChange={(e) => onChange({ protected: e.target.checked })}
              />
              {t.sensitiveField}
            </label>
          )}
        </div>
        <div className="mfoot">
          <button className="danger" onClick={onDelete}>
            {t.deleteField}
          </button>
          <button className="primary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomFieldView({ field, onCopy }: { field: CustomField; onCopy: () => void }) {
  const { t } = useApp();
  const [show, setShow] = useState(false);
  const ftype = normalizeFieldType(field.field_type);
  if (ftype === 'section') {
    if (!field.name) return null;
    return <div className="fieldlabel cf-section-view">{field.name}</div>;
  }
  if (!field.value) return null;

  const openUrl = async (url: string) => {
    const { openUrl: doOpen } = await import('@tauri-apps/plugin-opener');
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await doOpen(full);
  };
  const masked = field.protected && !show;
  const display =
    ftype === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(field.value)
      ? new Date(`${field.value}T00:00:00`).toLocaleDateString()
      : field.value;

  return (
    <div className="kv">
      <div className="fieldlabel">{field.name}</div>
      <div className="val">
        {ftype === 'multiline' && !masked ? (
          <div className="notes-box" style={{ flex: 1 }}>
            {field.value}
          </div>
        ) : (
          <span className={'text' + (['password', 'pin', 'numeric'].includes(ftype) ? ' mono' : '')}>
            {masked ? (
              '••••••••'
            ) : ftype === 'url' ? (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl(field.value);
                }}
              >
                {field.value}
              </a>
            ) : (
              display
            )}
          </span>
        )}
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
      <div className="fieldlabel">
        {t.totpCode} <UnlockedBadge />
      </div>
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
