import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, Settings, Status, UpdateInfo } from './api';
import { Dict, dictionaries } from './i18n';
import UnlockScreen from './components/UnlockScreen';
import MainView from './components/MainView';
import UpdateModal from './components/UpdateModal';

interface AppCtx {
  t: Dict;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  toast: (msg: string, isError?: boolean) => void;
  status: Status;
  refreshStatus: () => Promise<void>;
  lock: () => Promise<void>;
  /** available update found by the startup check (null = none known) */
  update: UpdateInfo | null;
  openUpdateModal: () => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => useContext(Ctx)!;

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; err: boolean } | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const toastTimer = useRef<number>(0);
  const lockTimer = useRef<number>(0);

  const refreshStatus = useCallback(async () => {
    setStatus(await api.vaultStatus());
  }, []);

  useEffect(() => {
    api.getSettings().then(setSettings);
    refreshStatus();
    // silent update check on app start; when an update exists the changelog
    // dialog opens once (dismissable — buttons in sidebar/settings remain)
    api
      .checkUpdate()
      .then((u) => {
        setUpdate(u);
        if (u) setShowUpdateModal(true);
      })
      .catch(() => {});
  }, [refreshStatus]);

  const toast = useCallback((msg: string, isError = false) => {
    setToastMsg({ msg, err: isError });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const lock = useCallback(async () => {
    await api.lockVault();
    await refreshStatus();
  }, [refreshStatus]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings!, ...patch };
      setSettings(next);
      await api.setSettings(next);
    },
    [settings]
  );

  // auto-lock on inactivity
  useEffect(() => {
    if (!settings || !status || status.locked) return;
    const reset = () => {
      window.clearTimeout(lockTimer.current);
      if (settings.auto_lock_minutes > 0) {
        lockTimer.current = window.setTimeout(lock, settings.auto_lock_minutes * 60_000);
      }
    };
    reset();
    const events = ['pointermove', 'keydown', 'pointerdown'] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      window.clearTimeout(lockTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [settings, status, lock]);

  // lock on blur
  useEffect(() => {
    if (!settings?.lock_on_blur || !status || status.locked) return;
    const onBlur = () => lock();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [settings, status, lock]);

  if (!settings || !status) return null;
  const t = dictionaries[settings.language] ?? dictionaries.en;

  return (
    <Ctx.Provider
      value={{
        t,
        settings,
        updateSettings,
        toast,
        status,
        refreshStatus,
        lock,
        update,
        openUpdateModal: () => setShowUpdateModal(true),
      }}
    >
      {status.locked ? <UnlockScreen /> : <MainView key={status.path ?? ''} />}
      {showUpdateModal && update && (
        <UpdateModal info={update} onClose={() => setShowUpdateModal(false)} />
      )}
      {toastMsg && <div className={`toast${toastMsg.err ? ' err' : ''}`}>{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}
