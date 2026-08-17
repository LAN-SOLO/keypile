import { useEffect, useState } from 'react';
import { api, Strength } from '../api';
import { useApp } from '../App';

export default function StrengthMeter({ password, context = [] }: { password: string; context?: string[] }) {
  const { t } = useApp();
  const [strength, setStrength] = useState<Strength | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!password) {
      setStrength(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api.passwordStrength(password, context).then((s) => {
        if (!cancelled) setStrength(s);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  if (!password || !strength) return null;
  const score = strength.score;
  return (
    <div className="meter">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`seg${i < Math.max(score, 1) ? ` on-${score}` : ''}`} />
      ))}
      <span className="label">{t.strength[score]}</span>
    </div>
  );
}
