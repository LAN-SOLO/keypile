import { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { api } from '../api';
import { useApp } from '../App';
import { confirmDialog } from './MainView';
import StrengthMeter from './StrengthMeter';

interface Props {
  onClose: () => void;
  onVaultChanged: () => Promise<void>;
}

export default function SettingsModal({ onClose, onVaultChanged }: Props) {
  const { t, settings, updateSettings, toast, status } = useApp();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    const sel = await open({
      multiple: false,
      filters: [{ name: 'Import', extensions: ['csv', 'json'] }],
    });
    if (typeof sel !== 'string') return;
    setBusy(true);
    try {
      const r = await api.importFile(sel);
      toast(t.importDone(r.added, r.skipped));
      await onVaultChanged();
    } catch (err) {
      toast(String(err), true);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!(await confirmDialog(t.exportWarning))) return;
    const sel = await save({
      defaultPath: 'keypile-export.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (typeof sel !== 'string') return;
    try {
      const n = await api.exportCsv(sel);
      toast(t.exportDone(n));
    } catch (err) {
      toast(String(err), true);
    }
  };

  const doChangeMaster = async () => {
    if (newPw !== newPw2) {
      toast(t.passwordsDontMatch, true);
      return;
    }
    setBusy(true);
    try {
      await api.changeMasterPassword(currentPw, newPw, null, null);
      toast(t.changed);
      setCurrentPw('');
      setNewPw('');
      setNewPw2('');
    } catch (err) {
      toast(String(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{t.settings}</h3>
          <button className="ghost icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mbody">
          <div className="settings-section">
            <h4>{t.plan}</h4>
            <div className="plan-card active-plan">
              <div className="pname">
                {t.planFree}
                <span className="tag">AKTIV</span>
              </div>
              <p>{t.planFreeDesc}</p>
            </div>
            <div className="plan-card">
              <div className="pname">
                <span className="brand">
                  <span className="name">keypile</span>
                  <span className="dot">.</span>
                </span>{' '}
                {t.planUnlocked}
              </div>
              <p>{t.planUnlockedDesc}</p>
              <p className="faint" style={{ marginTop: 6 }}>
                → {t.planWaitlist}
              </p>
            </div>
          </div>

          <div className="settings-section">
            <h4>{t.security}</h4>
            <label className="field">
              <span>{t.autoLock}</span>
              <input
                type="number"
                min={0}
                max={720}
                value={settings.auto_lock_minutes}
                onChange={(e) =>
                  updateSettings({ auto_lock_minutes: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </label>
            <label className="field">
              <span>{t.clipboardClear}</span>
              <input
                type="number"
                min={0}
                max={600}
                value={settings.clipboard_clear_seconds}
                onChange={(e) =>
                  updateSettings({
                    clipboard_clear_seconds: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.lock_on_blur}
                onChange={(e) => updateSettings({ lock_on_blur: e.target.checked })}
              />
              {t.lockOnBlur}
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>{t.language}</span>
              <select
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value as 'de' | 'en' })}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <div className="settings-section">
            <h4>{t.importExport}</h4>
            <div className="row">
              <button onClick={doImport} disabled={busy}>
                {t.importBtn}
              </button>
              <button onClick={doExport} disabled={busy}>
                {t.exportBtn}
              </button>
            </div>
            <div className="faint" style={{ marginTop: 8 }}>
              {t.importHint}
            </div>
          </div>

          <div className="settings-section">
            <h4>{t.changeMaster}</h4>
            <label className="field">
              <span>{t.currentPassword}</span>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{t.newPassword}</span>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              <StrengthMeter password={newPw} />
            </label>
            <label className="field">
              <span>{t.masterPasswordRepeat}</span>
              <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
            </label>
            <button
              className="primary"
              disabled={busy || !currentPw || newPw.length < 8 || !newPw2}
              onClick={doChangeMaster}
            >
              {t.changeMaster}
            </button>
          </div>

          <div className="settings-section">
            <h4>{t.vaultInfo}</h4>
            <div className="faint mono" style={{ wordBreak: 'break-all' }}>
              {status.path}
            </div>
            <div className="faint" style={{ marginTop: 8 }}>
              {t.syncHint}
            </div>
          </div>

          <div className="settings-section">
            <h4>{t.about}</h4>
            <p className="faint">
              <span className="brand">
                <span className="name">keypile</span>
                <span className="dot">.</span>
              </span>{' '}
              v0.1.0 — {t.aboutText}
            </p>
          </div>
        </div>
        <div className="mfoot">
          <button onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
