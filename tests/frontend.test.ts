// Unit-Tests für die UI-Helfer ohne Browser: `pnpm test`
// (Node ≥ 22 mit --experimental-strip-types, keine zusätzliche Abhängigkeit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeError } from '../src/errors.ts';
import { localizeShortcuts, modLabel } from '../src/keys.ts';
import { safeFileName, withExtension } from '../src/dialogs.ts';

// every message the Rust side can produce (commands.rs, state.rs, pwned.rs,
// core error.rs) must read in the UI language — German must not leak into EN
const backend = [
  'Tresor ist gesperrt',
  'Eintrag nicht gefunden',
  'Interner Fehler: task panicked',
  'Zwischenablage nicht verfügbar: clipboard occupied',
  'Header beschädigt',
  "Unbekanntes Feld 'x'",
  'HIBP-Fehler: HTTP 503 Service Unavailable',
  'HIBP nicht erreichbar: dns error',
  'Speichern fehlgeschlagen: Zugriff verweigert (os error 5)',
  'Export fehlgeschlagen: Der Prozess kann nicht auf die Datei zugreifen (os error 32)',
  'Datei konnte nicht gelesen werden: No such file or directory (os error 2)',
  'Das Master-Passwort muss mindestens 8 Zeichen haben',
  'Aktuelles Master-Passwort (oder Schlüsseldatei) ist falsch',
  'Anhänge sind auf 10 MB begrenzt',
  'Die Datei ist nicht UTF-8-kodiert — bitte als UTF-8-CSV exportieren',
  "import error: JSON enthält kein 'items'-Array",
  'import error: kein gültiges JSON: expected value at line 1',
  'Externe Vault-Datei ist beschädigt',
  "Die Vault-Datei wurde extern mit anderem Schlüssel geändert. Deine Version wurde als 'v (conflict).keypile' gesichert.",
  "invalid TOTP secret: unsupported otpauth type 'hotp' (only totp)",
  'invalid TOTP secret: not valid base32',
  'crypto error: memory cost too high',
  'i/o error: broken pipe',
  'Update-Prüfung fehlgeschlagen: network',
  'Kein Update verfügbar',
];

const germanMarkers = /\b(Tresor|Eintrag|Fehler|nicht|Datei|Schlüssel|Zwischenablage|beschädigt|gesichert|Unbekanntes|fehlgeschlagen)\b|[äöüß]/;

test('backend errors are translated to English', () => {
  for (const m of backend) {
    const en = localizeError(m, 'en');
    // OS error texts after the colon may be in the system language; only
    // check the part keypile controls
    const own = en.split(/: (?=[A-Z][a-z]+ |Zugriff|Der Prozess)/)[0];
    assert.doesNotMatch(own, germanMarkers, `${m} → ${en}`);
  }
});

test('German UI keeps German texts without English prefixes', () => {
  assert.equal(localizeError("import error: JSON enthält kein 'items'-Array", 'de'), "JSON enthält kein 'items'-Array");
  assert.match(localizeError("invalid TOTP secret: unsupported otpauth type 'hotp' (only totp)", 'de'), /HOTP/);
  assert.match(localizeError('crypto error: x', 'de'), /^Kryptografie-Fehler/);
  assert.equal(localizeError('Error: Tresor ist gesperrt', 'de'), 'Tresor ist gesperrt');
});

test('shortcut labels: Strg on German, Ctrl on English Windows/Linux', () => {
  // Node is not a Mac WebView unless the test runs on macOS
  const mac = /mac/i.test(navigator.platform || navigator.userAgent);
  if (mac) {
    assert.equal(modLabel('de'), '⌘');
    assert.equal(localizeShortcuts('⌘C — kopieren', 'de'), '⌘C — kopieren');
  } else {
    assert.equal(modLabel('de'), 'Strg+');
    assert.equal(modLabel('en'), 'Ctrl+');
    assert.equal(localizeShortcuts('• ⌘C — Passwort · ⌘, — Einstellungen', 'de'), '• Strg+C — Passwort · Strg+, — Einstellungen');
    // "⌘ am Mac" (followed by a space) stays as an explanation
    assert.equal(localizeShortcuts('(⌘ am Mac, Strg unter Windows)', 'de'), '(⌘ am Mac, Strg unter Windows)');
  }
});

test('attachment names from a synced vault become safe dialog suggestions', () => {
  assert.equal(safeFileName('Vertrag Müller.pdf'), 'Vertrag Müller.pdf');
  assert.equal(safeFileName('..\\..\\Windows\\evil.exe'), '.._.._Windows_evil.exe');
  assert.equal(safeFileName('../../etc/passwd'), '.._.._etc_passwd');
  assert.equal(safeFileName('a:b*c?"d"<e>|f'), 'a_b_c__d__e__f');
  assert.equal(safeFileName('CON'), '_CON');
  assert.equal(safeFileName('nul.txt'), '_nul.txt');
  assert.equal(safeFileName('name. . '), 'name');
  assert.equal(safeFileName('..'), 'attachment');
  assert.equal(safeFileName('\u0000\u001f'), 'attachment');
  const long = safeFileName('x'.repeat(300) + '.pdf');
  assert.equal(long.length, 200);
  assert.ok(long.endsWith('.pdf'));
});

test('save dialogs get the extension when Windows drops it', () => {
  assert.equal(withExtension('C:\\Users\\a\\export', 'csv'), 'C:\\Users\\a\\export.csv');
  assert.equal(withExtension('C:\\Users\\a\\export.CSV', 'csv'), 'C:\\Users\\a\\export.CSV');
});

test('Windows WebView2: Strg/Ctrl labels and Ctrl (not AltGr) as modifier', async () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130' },
  });
  try {
    const k = await import('../src/keys.ts?win');
    assert.equal(k.isMac, false);
    assert.equal(k.modLabel('de'), 'Strg+');
    assert.equal(k.modLabel('en'), 'Ctrl+');
    assert.equal(k.localizeShortcuts('⌘F — Suche · ⌘L — sperren', 'de'), 'Strg+F — Suche · Strg+L — sperren');
    const ev = (o: Partial<KeyboardEvent>) => ({ ctrlKey: false, altKey: false, metaKey: false, ...o }) as KeyboardEvent;
    assert.equal(k.isModKey(ev({ ctrlKey: true })), true);
    // AltGr on a German keyboard arrives as Ctrl+Alt — must not trigger shortcuts
    assert.equal(k.isModKey(ev({ ctrlKey: true, altKey: true })), false);
  } finally {
    if (real) Object.defineProperty(globalThis, 'navigator', real);
  }
});
