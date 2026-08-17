import { useApp } from '../App';
import { UnlockIcon } from '../icons';

/** Marks a feature that belongs to the paid "unlocked" tier
 *  (free to test during the alpha — tooltip explains). */
export default function UnlockedBadge() {
  const { t } = useApp();
  return (
    <span className="unlocked-badge" title={t.alphaPreviewNote}>
      <UnlockIcon size={10} /> {t.unlockedBadge}
    </span>
  );
}
