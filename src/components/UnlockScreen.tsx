import { FormEvent, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { save } from '@tauri-apps/plugin-dialog';
import { api } from '../api';
import { useApp } from '../App';
import StrengthMeter from './StrengthMeter';

type Mode = 'home' | 'unlock' | 'create';

export default function UnlockScreen() {
  const { t, settings, refreshStatus, updateSettings } = useApp();
  const [mode, setMode] = useState<Mode>('home');
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [keyfile, setKeyfile] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPassword('');
    setPassword2('');
    setKeyfile(null);
    setError('');
  };

  const pickVault = async (preset?: string) => {
    let file = preset;
    if (!file) {
      const sel = await open({
        multiple: false,
        filters: [{ name: 'keypile', extensions: ['keypile'] }],
      });
      if (typeof sel !== 'string') return;
      file = sel;
    }
    setPath(file);
    reset();
    setMode('unlock');
  };

  const pickNewLocation = async () => {
    const sel = await save({
      defaultPath: `${name.trim() || 'Tresor'}.keypile`,
      filters: [{ name: 'keypile', extensions: ['keypile'] }],
    });
    if (typeof sel === 'string') return sel;
    return null;
  };

  const pickKeyfile = async () => {
    const sel = await open({ multiple: false });
    if (typeof sel === 'string') setKeyfile(sel);
  };

  const doUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.openVault(path, password, keyfile);
      await refreshStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  const doCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== password2) {
      setError(t.passwordsDontMatch);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const file = await pickNewLocation();
      if (!file) {
        setBusy(false);
        return;
      }
      await api.createVault(file, name.trim() || 'Tresor', password, keyfile);
      await refreshStatus();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  const forgetRecent = (p: string) =>
    updateSettings({ recent_vaults: settings.recent_vaults.filter((r) => r !== p) });

  return (
    <div className="unlock">
      <h1 className="brand">
        <span className="name">keypile</span>
        <span className="dot">.</span>
      </h1>
      <div className="tagline">// {t.tagline}</div>

      {mode === 'home' && (
        <div className="card">
          {settings.recent_vaults.length > 0 && (
            <>
              <h2>{t.recentVaults}</h2>
              {settings.recent_vaults.map((p) => (
                <div key={p} className="row" style={{ marginBottom: 6 }}>
                  <button className="recent-item" onClick={() => pickVault(p)}>
                    {p.split('/').pop()}
                    <span className="path">{p}</span>
                  </button>
                  <button className="ghost icon noflex" title="×" onClick={() => forgetRecent(p)}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ height: 14 }} />
            </>
          )}
          <div className="row">
            <button onClick={() => pickVault()}>{t.openVault}</button>
            <button
              className="primary"
              onClick={() => {
                reset();
                setName('');
                setMode('create');
              }}
            >
              {t.createVault}
            </button>
          </div>
        </div>
      )}

      {mode === 'unlock' && (
        <form className="card" onSubmit={doUnlock}>
          <h2 className="mono dim">{path.split('/').pop()}</h2>
          <label className="field">
            <span>{t.masterPassword}</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="row" style={{ marginBottom: 12 }}>
            <button type="button" className="ghost" onClick={pickKeyfile}>
              {keyfile ? keyfile.split('/').pop() : t.keyfileOptional}
            </button>
            {keyfile && (
              <button type="button" className="ghost icon noflex" onClick={() => setKeyfile(null)}>
                ×
              </button>
            )}
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" onClick={() => setMode('home')}>
              {t.back}
            </button>
            <button className="primary" type="submit" disabled={busy || !password}>
              {busy ? '…' : t.unlock}
            </button>
          </div>
        </form>
      )}

      {mode === 'create' && (
        <form className="card" onSubmit={doCreate}>
          <h2>{t.createVault}</h2>
          <label className="field">
            <span>{t.vaultName}</span>
            <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.masterPassword}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <StrengthMeter password={password} context={[name]} />
          </label>
          <label className="field">
            <span>{t.masterPasswordRepeat}</span>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </label>
          <div className="row" style={{ marginBottom: 6 }}>
            <button type="button" className="ghost" onClick={pickKeyfile}>
              {keyfile ? keyfile.split('/').pop() : t.keyfileOptional}
            </button>
            {keyfile && (
              <button type="button" className="ghost icon noflex" onClick={() => setKeyfile(null)}>
                ×
              </button>
            )}
          </div>
          {keyfile && <div className="faint">{t.keyfileHint}</div>}
          <div className="faint" style={{ marginTop: 8 }}>
            {t.masterHint}
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" onClick={() => setMode('home')}>
              {t.back}
            </button>
            <button
              className="primary"
              type="submit"
              disabled={busy || password.length < 8 || !password2}
            >
              {busy ? '…' : t.create}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
