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

export function confirmDialog(message: string): Promise<boolean> {
  return guarded(() => tauriConfirm(message));
}

/** Last path segment for display — handles Windows backslashes too. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
