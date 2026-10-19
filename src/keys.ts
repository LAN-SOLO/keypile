import type { Lang } from './i18n';

// Plattform-Helfer für Tastenkürzel, Datumsformat und externe Links.

export const isMac = /mac/i.test(navigator.platform || navigator.userAgent);

/** Modifier label for shortcut hints: "⌘" on macOS, "Strg+" on German and
 *  "Ctrl+" on English Windows/Linux keyboards. */
export function modLabel(lang: Lang): string {
  if (isMac) return '⌘';
  return lang === 'de' ? 'Strg+' : 'Ctrl+';
}

/** The shortcut modifier for this platform: ⌘ on macOS, Ctrl elsewhere —
 *  but not Ctrl+Alt, which is AltGr on German Windows keyboards (AltGr+Q = @). */
export function isModKey(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.altKey && !e.metaKey;
}

/** Replace "⌘X" style hints in static texts (Help) with the platform label. */
export function localizeShortcuts(text: string, lang: Lang): string {
  if (isMac) return text;
  return text.replace(/⌘(?=[A-Z0-9,])/g, modLabel(lang));
}

/** Dates follow the UI language, not the OS locale of the WebView. */
export function uiLocale(lang: Lang): string {
  return lang === 'de' ? 'de-DE' : 'en-US';
}

/** Open a stored URL in the default browser (bare hosts get https://). */
export async function openExternal(url: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  const u = url.trim();
  await openUrl(/^https?:\/\//i.test(u) ? u : `https://${u}`);
}
