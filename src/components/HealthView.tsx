import { useEffect, useMemo, useState } from 'react';
import { api, EntrySummary, Health, PwnedHit } from '../api';
import { useApp } from '../App';

interface Props {
  entries: EntrySummary[];
  onSelect: (id: string) => void;
}

export default function HealthView({ entries, onSelect }: Props) {
  const { t } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [pwned, setPwned] = useState<PwnedHit[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [pwnedError, setPwnedError] = useState('');

  useEffect(() => {
    api.healthReport().then(setHealth);
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

  if (!health) return <section className="detail" />;
  const clean =
    health.weak.length === 0 &&
    health.reused.length === 0 &&
    health.old.length === 0 &&
    (pwned?.length ?? 0) === 0;

  return (
    <section className="detail">
      <div className="head">
        <h2>{t.healthCheck}</h2>
      </div>

      <div className="health-section">
        <h3>
          {t.pwnedPasswords}
          {pwned && <span className="badge">{pwned.length}</span>}
        </h3>
        <div className="faint" style={{ marginBottom: 10 }}>
          {t.pwnedHint}
        </div>
        <button onClick={runPwned} disabled={checking}>
          {checking ? t.checking : t.checkPwned}
        </button>
        {pwnedError && <div className="error-text">{pwnedError}</div>}
        {pwned?.map((p) => (
          <div className="health-item" key={p.id} onClick={() => onSelect(p.id)} style={{ marginTop: 8 }}>
            {titleOf(p.id)}
            <span className="why sev-red">{t.pwnedCount(p.count)}</span>
          </div>
        ))}
      </div>

      {health.weak.length > 0 && (
        <div className="health-section">
          <h3>
            {t.weakPasswords} <span className="badge">{health.weak.length}</span>
          </h3>
          {health.weak.map((w) => (
            <div className="health-item" key={w.id} onClick={() => onSelect(w.id)}>
              {titleOf(w.id)}
              <span className={`why ${w.score <= 1 ? 'sev-red' : 'sev-yellow'}`}>
                {t.strength[w.score]}
              </span>
            </div>
          ))}
        </div>
      )}

      {health.reused.length > 0 && (
        <div className="health-section">
          <h3>
            {t.reusedPasswords} <span className="badge">{health.reused.length}</span>
          </h3>
          {health.reused.map((group, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div className="faint" style={{ marginBottom: 4 }}>
                {t.groupOf(group.length)}
              </div>
              {group.map((id) => (
                <div className="health-item" key={id} onClick={() => onSelect(id)}>
                  {titleOf(id)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {health.old.length > 0 && (
        <div className="health-section">
          <h3>
            {t.oldPasswords} <span className="badge">{health.old.length}</span>
          </h3>
          {health.old.map((id) => (
            <div className="health-item" key={id} onClick={() => onSelect(id)}>
              {titleOf(id)}
            </div>
          ))}
        </div>
      )}

      {clean && pwned !== null && <div className="ok-text">{t.allGood}</div>}
    </section>
  );
}
