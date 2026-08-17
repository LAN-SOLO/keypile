import { useEffect, useMemo, useState } from 'react';
import { api, Audit, EntrySummary, PwnedHit } from '../api';
import { useApp } from '../App';
import UnlockedBadge from './UnlockedBadge';
import { ClockIcon, PaperclipIcon, PasskeyIcon, ShieldIcon, TimerIcon, WarnIcon } from '../icons';

interface Props {
  entries: EntrySummary[];
  onSelect: (id: string) => void;
}

type Drill = { title: string; ids: string[] } | null;

export default function AuditView({ entries, onSelect }: Props) {
  const { t } = useApp();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [pwned, setPwned] = useState<PwnedHit[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [pwnedError, setPwnedError] = useState('');
  const [drill, setDrill] = useState<Drill>(null);

  useEffect(() => {
    api.auditReport().then(setAudit);
  }, [entries]);

  const titleOf = useMemo(() => {
    const map = new Map(entries.map((e) => [e.id, e.title]));
    return (id: string) => map.get(id) ?? '?';
  }, [entries]);

  const runPwned = async () => {
    setChecking(true);
    setPwnedError('');
    try {
      setPwned(await api.checkPwned());
    } catch (err) {
      setPwnedError(String(err));
    } finally {
      setChecking(false);
    }
  };

  if (!audit) return <section className="detail" />;

  const reusedIds = audit.reused.flat();

  // status semantics per dataviz rules: color + icon + label, never color alone
  const tile = (
    label: string,
    value: number,
    status: 'serious' | 'warning' | 'good' | 'info',
    icon: JSX.Element,
    ids?: string[],
    extra?: JSX.Element
  ) => (
    <button
      className={`stat-tile${ids && ids.length ? ' clickable' : ''}`}
      onClick={() => ids && ids.length && setDrill({ title: label, ids })}
      disabled={!ids || !ids.length}
    >
      <span className={`tile-num ${value === 0 && status !== 'good' && status !== 'info' ? 'is-zero' : `is-${status}`}`}>
        {value}
      </span>
      <span className="tile-label">
        {icon} {label} {extra}
      </span>
    </button>
  );

  return (
    <section className="detail">
      <div className="head">
        <h2>{t.audit}</h2>
        <span className="faint">
          {audit.total} {t.entries}
        </span>
      </div>

      <div className="health-section">
        <h3>{t.auditPasswords}</h3>
        <div className="tile-row">
          {tile(
            t.tileCompromised,
            pwned?.length ?? 0,
            'serious',
            <WarnIcon size={13} />,
            pwned?.map((p) => p.id),
            <UnlockedBadge />
          )}
          {tile(
            t.tileIdentical,
            reusedIds.length,
            'warning',
            <ShieldIcon size={13} />,
            reusedIds
          )}
          {tile(
            t.tileWeak,
            audit.weak.length,
            'warning',
            <WarnIcon size={13} />,
            audit.weak.map((w) => w.id)
          )}
        </div>
        {pwned === null && (
          <div style={{ marginTop: 10 }}>
            <button onClick={runPwned} disabled={checking}>
              {checking ? t.checking : t.runBreachCheck}
            </button>
            <span className="faint" style={{ marginLeft: 10 }}>
              {t.pwnedHint}
            </span>
            {pwnedError && <div className="error-text">{pwnedError}</div>}
          </div>
        )}
      </div>

      <div className="health-section">
        <h3>
          {t.auditAgeTitle} <UnlockedBadge />
        </h3>
        <div className="tile-row">
          {tile(t.age36, audit.age_3_6m.length, 'info', <ClockIcon size={13} />, audit.age_3_6m)}
          {tile(t.age612, audit.age_6_12m.length, 'info', <ClockIcon size={13} />, audit.age_6_12m)}
          {tile(t.age13, audit.age_1_3y.length, 'warning', <ClockIcon size={13} />, audit.age_1_3y)}
          {tile(t.age3plus, audit.age_3y.length, 'serious', <ClockIcon size={13} />, audit.age_3y)}
        </div>
      </div>

      <div className="health-section">
        <h3>{t.auditSecurity}</h3>
        <div className="tile-row">
          {tile(t.tileTwofa, audit.with_totp.length, 'good', <TimerIcon size={13} />, audit.with_totp)}
          {tile(t.tilePasskeys, audit.passkeys, 'info', <PasskeyIcon size={13} />)}
          {tile(t.tileAttachments, audit.with_attachments, 'info', <PaperclipIcon size={13} />)}
        </div>
      </div>

      {drill && (
        <div className="health-section">
          <h3>
            {drill.title} <span className="badge">{drill.ids.length}</span>
            <button className="ghost icon" style={{ marginLeft: 'auto' }} onClick={() => setDrill(null)}>
              ×
            </button>
          </h3>
          {drill.ids.map((id) => (
            <div className="health-item" key={id} onClick={() => onSelect(id)}>
              {titleOf(id)}
              {pwned?.find((p) => p.id === id) && (
                <span className="why sev-red">
                  {t.pwnedCount(pwned.find((p) => p.id === id)!.count)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {pwned !== null &&
        pwned.length === 0 &&
        audit.weak.length === 0 &&
        reusedIds.length === 0 && <div className="ok-text">{t.allGood}</div>}
    </section>
  );
}
