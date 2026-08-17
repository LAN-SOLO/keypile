import { useState } from 'react';
import { api, UpdateInfo } from '../api';
import { useApp } from '../App';
import { UpdateIcon } from '../icons';

interface Props {
  info: UpdateInfo;
  onClose: () => void;
}

/** Shown before installing an update: version, date and the changelog from
 *  the release notes. Install only starts after explicit confirmation. */
export default function UpdateModal({ info, onClose }: Props) {
  const { t, toast } = useApp();
  const [busy, setBusy] = useState(false);

  const install = async () => {
    setBusy(true);
    toast(t.updateInstalling);
    try {
      await api.installUpdate();
      // on success the app restarts — this line is never reached
    } catch (err) {
      toast(String(err), true);
      setBusy(false);
    }
  };

  const date = info.date ? new Date(info.date) : null;

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>
            <UpdateIcon size={15} /> {t.updateModalTitle(info.version)}
          </h3>
          <button className="ghost icon" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="mbody">
          {date && !Number.isNaN(date.getTime()) && (
            <div className="faint" style={{ marginBottom: 10 }}>
              {t.publishedOn(date.toLocaleDateString())}
            </div>
          )}
          <div className="fieldlabel">{t.changelogTitle}</div>
          <div className="changelog-box">
            {info.notes?.trim() ? info.notes.trim() : t.noChangelog}
          </div>
          <div className="faint" style={{ marginTop: 12 }}>
            {t.updateSafeNote}
          </div>
        </div>
        <div className="mfoot">
          <button onClick={onClose} disabled={busy}>
            {t.updateLater}
          </button>
          <button className="primary" onClick={install} disabled={busy}>
            {busy ? '…' : t.updateNow}
          </button>
        </div>
      </div>
    </div>
  );
}
