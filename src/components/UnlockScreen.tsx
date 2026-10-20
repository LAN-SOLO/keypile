import { FormEvent, useState } from 'react';
import { api } from '../api';
import { baseName, pickFile, pickSavePath, safeFileName } from '../dialogs';
import { localizeError } from '../errors';
import { useApp } from '../App';
import StrengthMeter from './StrengthMeter';

type Mode = 'home' | 'unlock' | 'create';

export default function UnlockScreen() {
  const { t, settings, refreshStatus, reloadSettings } = useApp();
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
      let sel: string | null = null;
      try {
        sel = await pickFile({
          filters: [{ name: 'keypile', extensions: ['keypile'] }],
        });
      } catch (err) {
        setError(localizeError(err, settings.language));
      }
      if (!sel) return;
      file = sel;
    }
    setPath(file);
    reset();
    setMode('unlock');
  };

  const pickNewLocation = async () => {
    const sel = await pickSavePath({
      // the vault name is free text — "Privat/Arbeit" or "a:b" must not steer the dialog
      defaultPath: `${safeFileName(name.trim() || t.defaultVaultName, t.defaultVaultName)}.keypile`,
      filters: [{ name: 'keypile', extensions: ['keypile'] }],
    });
    if (!sel) return null;
    // Linux/Windows dialogs don't always append the filter extension
    return /\.keypile$/i.test(sel) ? sel : `${sel}.keypile`;
  };

  const pickKeyfile = async () => {
    try {
      const sel = await pickFile();
      if (sel) setKeyfile(sel);
    } catch (err) {
      setError(localizeError(err, settings.language));
    }
  };

  const doUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.openVault(path, password, keyfile);
      await refreshStatus();
      await reloadSettings();
    } catch (err) {
      setError(localizeError(err, settings.language));
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
      await api.createVault(file, name.trim() || t.defaultVaultName, password, keyfile);
      await refreshStatus();
      await reloadSettings();
    } catch (err) {
      setError(localizeError(err, settings.language));
      setBusy(false);
    }
  };

  const forgetRecent = async (p: string) => {
    try {
      await api.forgetRecentVault(p);
      await reloadSettings();
    } catch (err) {
      setError(localizeError(err, settings.language));
    }
  };

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
                    {baseName(p)}
                    <span className="path">{p}</span>
                  </button>
                  <button className="ghost icon noflex" title={t.forgetRecent} onClick={() => forgetRecent(p)}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ height: 14 }} />
            </>
          )}
          {error && <div className="error-text">{error}</div>}
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
          <h2 className="mono dim">{baseName(path)}</h2>
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
            <button type="button" className="ghost" disabled={busy} onClick={pickKeyfile}>
              {keyfile ? baseName(keyfile) : t.keyfileOptional}
            </button>
            {keyfile && (
              <button type="button" className="ghost icon noflex" onClick={() => setKeyfile(null)}>
                ×
              </button>
            )}
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" disabled={busy} onClick={() => setMode('home')}>
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
            <button type="button" className="ghost" disabled={busy} onClick={pickKeyfile}>
              {keyfile ? baseName(keyfile) : t.keyfileOptional}
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
            <button type="button" disabled={busy} onClick={() => setMode('home')}>
              {t.back}
            </button>
            <button
              className="primary"
              type="submit"
              disabled={busy || [...password].length < 8 || !password2}
            >
              {busy ? '…' : t.create}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
