import type { Lang } from './i18n';

// Backend-Fehler kommen als feste Texte (Core: Englisch, App-Schicht:
// Deutsch). Hier werden die bekannten Meldungen in die UI-Sprache übersetzt;
// Unbekanntes wird unverändert angezeigt.

type Rule = { re: RegExp; de: (m: RegExpMatchArray) => string; en: (m: RegExpMatchArray) => string };

const rules: Rule[] = [
  {
    re: /wrong master password or key file/i,
    de: () => 'Falsches Master-Passwort oder falsche Schlüsseldatei — oder die Datei ist beschädigt.',
    en: () => 'Wrong master password or key file — or the vault file is corrupted.',
  },
  {
    re: /not a keypile vault/i,
    de: () => 'Das ist keine keypile-Tresordatei.',
    en: () => 'This is not a keypile vault file.',
  },
  {
    re: /vault format version (\d+) is newer/i,
    de: (m) => `Tresorformat ${m[1]} ist neuer als diese App — bitte keypile aktualisieren.`,
    en: (m) => `Vault format ${m[1]} is newer than this app — please update keypile.`,
  },
  {
    re: /unsupported KDF parameters|unknown KDF|unknown cipher|truncated or corrupted/i,
    de: () => 'Die Tresordatei ist beschädigt oder manipuliert.',
    en: () => 'The vault file is corrupted or has been tampered with.',
  },
  {
    re: /invalid TOTP secret/i,
    de: () => 'Ungültiges TOTP-Secret (Base32 oder otpauth://-URI erwartet).',
    en: () => 'Invalid TOTP secret (expected Base32 or an otpauth:// URI).',
  },
  { re: /^Tresor ist gesperrt$/, de: (m) => m[0], en: () => 'The vault is locked.' },
  {
    re: /^Das Master-Passwort muss mindestens 8 Zeichen haben$/,
    de: (m) => m[0],
    en: () => 'The master password must be at least 8 characters long.',
  },
  {
    re: /^Das neue Master-Passwort muss mindestens 8 Zeichen haben$/,
    de: (m) => m[0],
    en: () => 'The new master password must be at least 8 characters long.',
  },
  {
    re: /^Aktuelles Master-Passwort \(oder Schlüsseldatei\) ist falsch$/,
    de: (m) => m[0],
    en: () => 'Current master password (or key file) is wrong.',
  },
  { re: /^Anhänge sind auf 10 MB begrenzt$/, de: (m) => m[0], en: () => 'Attachments are limited to 10 MB.' },
  { re: /^Eintrag nicht gefunden$/, de: (m) => m[0], en: () => 'Entry not found.' },
  { re: /^Anhang nicht gefunden$/, de: (m) => m[0], en: () => 'Attachment not found.' },
  { re: /^Anhang ist beschädigt$/, de: (m) => m[0], en: () => 'Attachment is corrupted.' },
  { re: /^Eintrag hat kein TOTP$/, de: (m) => m[0], en: () => 'Entry has no TOTP secret.' },
  { re: /^Ordnername darf nicht leer sein$/, de: (m) => m[0], en: () => 'Folder name must not be empty.' },
  { re: /^Kein Update verfügbar$/, de: (m) => m[0], en: () => 'No update available.' },
  {
    re: /CSV hat keine erkennbare Passwort-Spalte/,
    de: (m) => m.input ?? m[0],
    en: () => "The CSV has no recognizable password column (expected e.g. 'password').",
  },
  {
    re: /VERSCHLÜSSELTER Bitwarden-Export/,
    de: (m) => m.input ?? m[0],
    en: () => 'This is an ENCRYPTED Bitwarden export. Please export unencrypted (.json).',
  },
  {
    re: /nicht UTF-8-kodiert/,
    de: (m) => m.input ?? m[0],
    en: () => 'The file is not UTF-8 encoded — please export it as UTF-8 CSV.',
  },
  {
    re: /^HIBP nicht erreichbar: (.*)$/s,
    de: (m) => m[0],
    en: (m) => `Have I Been Pwned is unreachable: ${m[1]}`,
  },
  {
    re: /extern mit anderem Schlüssel geändert\. Deine Version wurde als '(.+)' gesichert/s,
    de: (m) => m.input ?? m[0],
    en: (m) =>
      `The vault file was changed elsewhere with a different key. Your version was saved as '${m[1]}'.`,
  },
  {
    re: /Vault-Datei auf der Festplatte ist beschädigt/,
    de: (m) => m.input ?? m[0],
    en: () => 'The vault file on disk is corrupted — saving was aborted so nothing gets overwritten.',
  },
  {
    re: /^(Datei konnte nicht gelesen werden|Schlüsseldatei konnte nicht gelesen werden|Speichern fehlgeschlagen|Export fehlgeschlagen|Konnte Tresor nicht anlegen|Update-Prüfung fehlgeschlagen|Update fehlgeschlagen): (.*)$/s,
    de: (m) => m[0],
    en: (m) =>
      `${
        {
          'Datei konnte nicht gelesen werden': 'Could not read the file',
          'Schlüsseldatei konnte nicht gelesen werden': 'Could not read the key file',
          'Speichern fehlgeschlagen': 'Saving failed',
          'Export fehlgeschlagen': 'Export failed',
          'Konnte Tresor nicht anlegen': 'Could not create the vault',
          'Update-Prüfung fehlgeschlagen': 'Update check failed',
          'Update fehlgeschlagen': 'Update failed',
        }[m[1]] ?? m[1]
      }: ${m[2]}`,
  },
];

export function localizeError(err: unknown, lang: Lang): string {
  const msg = String(err).replace(/^Error:\s*/, '');
  for (const r of rules) {
    const m = msg.match(r.re);
    if (m) return lang === 'de' ? r.de(m) : r.en(m);
  }
  return msg;
}
