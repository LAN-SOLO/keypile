// Line-style SVG icons (stroke = currentColor) — no emoji, per LAN-SOLO style.

import { ReactNode } from 'react';

const I = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    {children}
  </svg>
);

export const GlobeIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
  </I>
);

export const CardIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M2.5 10h19M6 14.5h4" />
  </I>
);

export const PersonIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c1.3-3.2 3.9-4.8 7-4.8s5.7 1.6 7 4.8" />
  </I>
);

export const NoteIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M5 3.5h14v12l-5 5H5z" />
    <path d="M14 20.5v-5h5" />
  </I>
);

export const KeyIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="8" cy="8" r="4.5" />
    <path d="M11.2 11.2 20 20M16 16l2.5-2.5M13.5 18.5l2-2" />
  </I>
);

export const BanknoteIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </I>
);

export const IdCardIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
    <circle cx="8" cy="10.5" r="2" />
    <path d="M5.5 15.8c.7-1.5 1.5-2.1 2.5-2.1s1.8.6 2.5 2.1M14 9.5h5M14 13h5" />
  </I>
);

export const PlaneIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M10.5 13.5 3 11l1.5-1.5L11 10l4.5-4.5c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L13.5 13l.5 6.5L12.5 21l-2-7.5z" />
  </I>
);

export const MonitorIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M9 20.5h6M12 16.5v4" />
  </I>
);

export const BriefcaseIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="3" y="7.5" width="18" height="12" rx="2" />
    <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
  </I>
);

export const TimerIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9.5V13l2.5 2M9.5 2.5h5" />
  </I>
);

export const PaperclipIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="m19 12.5-6.8 6.8a4.5 4.5 0 0 1-6.4-6.4l7.8-7.8a3 3 0 0 1 4.2 4.2l-7.4 7.4a1.5 1.5 0 0 1-2.1-2.1l6.4-6.4" />
  </I>
);

export const ArchiveIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="3" y="4" width="18" height="4.5" rx="1" />
    <path d="M4.5 8.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.5M10 12.5h4" />
  </I>
);

export const TrashIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6.5 6.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.5M10 10.5v6M14 10.5v6" />
  </I>
);

export const PasskeyIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3.5 20c1.1-2.9 3.3-4.4 6-4.4 1 0 1.9.2 2.7.6" />
    <circle cx="17.5" cy="13.5" r="2.5" />
    <path d="M17.5 16v4.5l1.5-1.5M17.5 20.5 16 19" />
  </I>
);

export const StarIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </I>
);

export const ShieldIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3 8 7.5 9.5 4.5-1.5 7.5-4.9 7.5-9.5V6z" />
    <path d="m9 12 2 2 4-4.5" />
  </I>
);

export const LockIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" />
  </I>
);

export const UnlockIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2M12 14.5v2" />
  </I>
);

export const UpdateIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5" />
  </I>
);

export const GearIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
  </I>
);

export const DiceIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9 9v.01M15 9v.01M9 15v.01M15 15v.01M12 12v.01" />
  </I>
);

export const SearchIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </I>
);

export const WarnIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 4 2.8 20h18.4z" />
    <path d="M12 10v4M12 17v.01" />
  </I>
);

export const ClockIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </I>
);

export const CopyIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M5.5 15.5h-1a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </I>
);

export const FolderIcon = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </I>
);

/** Category → icon component. */
export function CategoryIcon({ category, size }: { category: string; size?: number }) {
  switch (category) {
    case 'login':
      return <GlobeIcon size={size} />;
    case 'card':
      return <CardIcon size={size} />;
    case 'identity':
      return <PersonIcon size={size} />;
    case 'note':
      return <NoteIcon size={size} />;
    case 'password':
      return <KeyIcon size={size} />;
    case 'finance':
      return <BanknoteIcon size={size} />;
    case 'license':
      return <IdCardIcon size={size} />;
    case 'travel':
      return <PlaneIcon size={size} />;
    case 'computer':
      return <MonitorIcon size={size} />;
    default:
      return <BriefcaseIcon size={size} />;
  }
}
