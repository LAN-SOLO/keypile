import {
  confirm as tauriConfirm,
  open as tauriOpen,
  save as tauriSave,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from '@tauri-apps/plugin-dialog';

// Native Dialoge (Datei öffnen/speichern, Bestätigen) nehmen dem Fenster den
// Fokus. Mit „Sperren bei Fokusverlust“ würde der Tresor sonst genau dann
// gesperrt, wenn man z. B. einen Anhang auswählt — der Aufruf danach scheitert
// mit „Tresor ist gesperrt“. Solange ein Dialog offen ist, ignoriert App.tsx
// den Blur.

let open = 0;
let lastClosed = 0;

export function dialogActive(): boolean {
  // kleine Nachlaufzeit: manche Plattformen feuern blur erst nach dem Schließen
  return open > 0 || Date.now() - lastClosed < 500;
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  open++;
  try {
    return await fn();
  } finally {
    open--;
    lastClosed = Date.now();
  }
}

/** Single-file open dialog; returns the path or null. */
export async function pickFile(options: Omit<OpenDialogOptions, 'multiple' | 'directory'> = {}) {
  const sel = await guarded(() => tauriOpen({ ...options, multiple: false, directory: false }));
  return typeof sel === 'string' ? sel : null;
}

export async function pickSavePath(options: SaveDialogOptions = {}) {
  const sel = await guarded(() => tauriSave(options));
  return typeof sel === 'string' ? sel : null;
}

/** Native yes/no dialog. Always awaited: tauri-plugin-dialog replaces
 *  window.confirm with an async stub that is always truthy (see AUDIT-1.0.md,
 *  Runde 2). Button labels come from the UI language — the plugin defaults
 *  are English ("Ok"/"Cancel") even in the German UI. */
export function confirmDialog(
  message: string,
  labels: { ok: string; cancel: string },
  kind: 'info' | 'warning' = 'warning'
): Promise<boolean> {
  return guarded(() =>
    tauriConfirm(message, {
      title: 'keypile',
      kind,
      okLabel: labels.ok,
      cancelLabel: labels.cancel,
    })
  );
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Suggested file name for a save dialog from untrusted data (attachment
 *  names arrive through synced vault files): no path separators or
 *  characters Windows rejects, no reserved device names, no trailing dots or
 *  spaces (NTFS drops them), bounded length. Umlauts and spaces stay. */
export function safeFileName(name: string, fallback = 'attachment'): string {
  let n = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  if (!n) n = fallback;
  if (RESERVED.test(n)) n = `_${n}`;
  if (n.length > 200) {
    const dot = n.lastIndexOf('.');
    const ext = dot > 0 && n.length - dot <= 16 ? n.slice(dot) : '';
    n = n.slice(0, 200 - ext.length) + ext;
  }
  return n;
}

/** Windows/Linux save dialogs do not always append the filter extension. */
export function withExtension(path: string, ext: string): string {
  return path.toLowerCase().endsWith(`.${ext}`) ? path : `${path}.${ext}`;
}

/** Last path segment for display — handles Windows backslashes too. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
