import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, Settings, Status, UpdateInfo } from './api';
import { Dict, dictionaries } from './i18n';
import UnlockScreen from './components/UnlockScreen';
import MainView from './components/MainView';
import UpdateModal from './components/UpdateModal';
import Help from './components/Help';
import { localizeError } from './errors';
import { dialogActive } from './dialogs';

interface AppCtx {
  t: Dict;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** re-read settings from disk (recent vaults change on open/create) */
  reloadSettings: () => Promise<void>;
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
  const lastActivity = useRef<number>(Date.now());

  const refreshStatus = useCallback(async () => {
    setStatus(await api.vaultStatus());
  }, []);

  useEffect(() => {
    api.getSettings().then(async (loaded) => {
      // First run: the Rust default only looks at $LANG, which Windows does
      // not set — take the language from the WebView (system locale) once.
      let firstRun = false;
      try {
        firstRun = !localStorage.getItem('keypile.tutorialSeen') && !localStorage.getItem('keypile.langInit');
        localStorage.setItem('keypile.langInit', '1');
      } catch {
        /* ignore */
      }
      const sysLang = navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
      if (firstRun && loaded.language !== sysLang) {
        setSettings(await api.setSettings({ ...loaded, language: sysLang }));
      } else {
        setSettings(loaded);
      }
    });
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

  const lang = settings?.language === 'de' ? 'de' : 'en';
  const toast = useCallback(
    (msg: string, isError = false) => {
      setToastMsg({ msg: isError ? localizeError(msg, lang) : msg, err: isError });
    window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToastMsg(null), isError ? 6000 : 3500);
    },
    [lang]
  );

  const reloadSettings = useCallback(async () => {
    setSettings(await api.getSettings());
  }, []);

  const lock = useCallback(async () => {
    await api.lockVault();
    await refreshStatus();
    await reloadSettings();
  }, [refreshStatus, reloadSettings]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings!, ...patch };
      setSettings(next);
      // the backend owns recent_vaults/device_id and returns the stored state
      setSettings(await api.setSettings(next));
    },
    [settings]
  );

  // Darstellung aus den Einstellungen auf <html> spiegeln; localStorage dient
  // nur als Cache für main.tsx, damit der erste Frame schon richtig aussieht.
  useEffect(() => {
    if (!settings) return;
    const theme = settings.theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [settings]);

  // auto-lock on inactivity — compares wall-clock timestamps instead of one
  // long setTimeout, which pauses while the machine sleeps and would keep the
  // vault open for the full period again after wake-up
  const autoLockMinutes = settings?.auto_lock_minutes ?? 0;
  const unlocked = !!status && !status.locked;
  useEffect(() => {
    if (!unlocked || autoLockMinutes <= 0) return;
    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const check = () => {
      if (Date.now() - lastActivity.current >= autoLockMinutes * 60_000) lock();
    };
    const events = ['pointermove', 'keydown', 'pointerdown', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(check, 5_000);
    // after sleep/wake or switching back to the window: check right away
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [unlocked, autoLockMinutes, lock]);

  // lock on blur (not while one of our own native dialogs has the focus)
  const lockOnBlur = !!settings?.lock_on_blur;
  useEffect(() => {
    if (!lockOnBlur || !unlocked) return;
    const onBlur = () => {
      if (!dialogActive()) lock();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [lockOnBlur, unlocked, lock]);

  if (!settings || !status) return null;
  const t = dictionaries[settings.language] ?? dictionaries.en;

  return (
    <Ctx.Provider
      value={{
        t,
        settings,
        updateSettings,
        reloadSettings,
        toast,
        status,
        refreshStatus,
        lock,
        update,
        openUpdateModal: () => setShowUpdateModal(true),
      }}
    >
      {status.locked ? <UnlockScreen /> : <MainView key={status.path ?? ''} />}
      <Help lang={settings.language} />
      {showUpdateModal && update && (
        <UpdateModal info={update} onClose={() => setShowUpdateModal(false)} />
      )}
      {toastMsg && <div className={`toast${toastMsg.err ? ' err' : ''}`}>{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}
