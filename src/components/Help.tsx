import { useState } from 'react';

// Selbstständiges Hilfe-System: schwebender ?-Button, First-Run-Tutorial
// und durchsuchbares Handbuch. Sprache folgt der App-Einstellung.

interface Step {
  title: string;
  body: string[];
}

interface Section {
  id: string;
  title: string;
  body: string[];
}

interface Content {
  labels: {
    fab: string;
    tutorial: string;
    manual: string;
    search: string;
    next: string;
    back: string;
    skip: string;
    done: string;
    stepOf: (n: number, total: number) => string;
    noResults: string;
  };
  tutorial: Step[];
  sections: Section[];
}

const de: Content = {
  labels: {
    fab: 'Hilfe & Handbuch',
    tutorial: 'Tutorial',
    manual: 'Handbuch',
    search: 'Handbuch durchsuchen …',
    next: 'Weiter',
    back: 'Zurück',
    skip: 'Überspringen',
    done: 'Los geht’s',
    stepOf: (n, total) => `Schritt ${n} von ${total}`,
    noResults: 'Keine Treffer',
  },
  tutorial: [
    {
      title: 'Willkommen bei keypile.',
      body: [
        'keypile ist ein Passwortmanager ohne Cloud-Zwang: Dein Tresor ist eine einzige, verschlüsselte Datei auf deinem Gerät.',
        'Kein Konto, kein Server — das Master-Passwort verlässt dieses Gerät nie und kann nicht wiederhergestellt werden.',
        'Dieses Tutorial dauert zwei Minuten. Du findest es jederzeit wieder über den ?-Knopf unten rechts.',
      ],
    },
    {
      title: 'Tresor anlegen',
      body: [
        '„Neuen Tresor anlegen“, Speicherort wählen, Master-Passwort setzen — fertig.',
        'Wähle ein langes, einzigartiges Master-Passwort (am besten eine Passphrase aus mehreren Wörtern). Es ist der einzige Schlüssel zu allem.',
        'Optional: eine Schlüsseldatei als zweiten Faktor — ohne diese Datei lässt sich der Tresor selbst mit Passwort nicht öffnen. Bewahre sie getrennt auf.',
      ],
    },
    {
      title: 'Einträge & Kategorien',
      body: [
        '„Neuer Eintrag“ öffnet die Vorlagen-Auswahl: Login, Karte, Notiz und mehr — jede Vorlage bringt die passenden Felder mit.',
        'Eigene Felder lassen sich jederzeit ergänzen — mit Typ (Text, Passwort, PIN, Datum, URL …), per Drag & Drop anordenbar und in Abschnitte gruppierbar; sensible Felder werden verdeckt dargestellt.',
        'Ordnung halten: Ordner in der Seitenleiste, Favoriten, Tags und die Suche oben.',
      ],
    },
    {
      title: 'Generator & Passwort-Check',
      body: [
        'Der Generator erzeugt starke Passwörter (Länge, Ziffern, Symbole) oder merkbare Passphrasen.',
        'Der Passwort-Check durchleuchtet den Tresor: schwache, wiederverwendete, identische und alte Passwörter — plus Abgleich gegen bekannte Datenlecks (k-anonym, dein Passwort verlässt das Gerät nie).',
      ],
    },
    {
      title: 'TOTP, Anhänge & mehr',
      body: [
        'Einmalcodes (TOTP): den 2FA-Schlüssel im Eintrag hinterlegen — keypile zeigt den laufenden 6-stelligen Code direkt an.',
        'Datei-Anhänge: Dokumente sicher beim Eintrag ablegen, verschlüsselt im Tresor.',
        'Beides gehört später zu keypile unlocked — in der Alpha ist es frei testbar.',
      ],
    },
    {
      title: 'Sync ohne Cloud-Zwang',
      body: [
        'Lege die Tresor-Datei einfach in deinen Cloud-Ordner (iCloud, Dropbox, Nextcloud …) — keypile erkennt externe Änderungen und führt sie zusammen.',
        'Der Cloud-Anbieter sieht dabei nur verschlüsselte Bytes. Eine Kopie der Datei auf einem USB-Stick ist bereits ein vollständiges Backup.',
      ],
    },
    {
      title: 'Sperren & Updates',
      body: [
        'keypile sperrt sich automatisch nach Inaktivität (einstellbar) und auf Wunsch beim Verlassen des Fensters. Kopierte Passwörter verschwinden nach kurzer Zeit aus der Zwischenablage.',
        'Updates kommen signiert direkt in die App — Changelog vorab, installiert wird erst nach deinem Klick.',
      ],
    },
  ],
  sections: [
    {
      id: 'vault',
      title: 'Tresor',
      body: [
        'Dein Tresor ist eine einzige, verschlüsselte Datei (Argon2id + AES-256-GCM). Du bestimmst, wo sie liegt.',
        '• Anlegen — „Neuen Tresor anlegen“: Speicherort, Name, Master-Passwort',
        '• Öffnen — „Tresor öffnen“ oder ein Eintrag unter „Zuletzt geöffnet“',
        '• Master-Passwort ändern — in den Einstellungen; die Datei wird komplett neu verschlüsselt',
        'Das Master-Passwort verlässt das Gerät nie und ist nicht wiederherstellbar — ohne Passwort (und ggf. Schlüsseldatei) gibt es keinen Zugang, auch für uns nicht.',
        'Schlüsseldatei (optional): ein zweiter Faktor beim Anlegen. Tresor öffnen geht dann nur mit Passwort UND Datei — ideal auf einem USB-Stick getrennt vom Rechner.',
      ],
    },
    {
      id: 'entries',
      title: 'Einträge',
      body: [
        '„Neuer Eintrag“ startet mit einer Vorlage (Login, Karte, Identität, Notiz …) — jede bringt passende Felder mit.',
        '• Felder — Benutzername, Passwort, URL, Notizen; eigene Felder beliebig ergänzbar (Typ über ⚙︎ wählbar: Text, Mehrzeilig, Passwort, PIN, Zahl, Datum, E-Mail, URL, Telefon), per ≡-Griff neu anordenbar, Abschnitte als Zwischenüberschriften; sensible Felder verdeckt',
        '• Kopieren — Symbol am Feld kopiert den Wert; Passwörter laufen dabei nie durchs UI, sondern direkt vom Tresor in die Zwischenablage',
        '• URL öffnen — startet die hinterlegte Website im Browser',
        '• Verlauf — geänderte Passwörter bleiben in der Eintrags-Historie nachvollziehbar',
        '• Archiv & Papierkorb — Ausgemustertes verschwindet aus den Listen, bleibt aber wiederherstellbar; endgültig löschen geht über den Papierkorb',
      ],
    },
    {
      id: 'organize',
      title: 'Ordner, Favoriten & Suche',
      body: [
        '• Ordner — eigene Struktur in der Seitenleiste; Einträge per Auswahl zuordnen',
        '• Favoriten — der Stern markiert Wichtiges, die Favoriten-Ansicht sammelt es',
        '• Tags — Schlagworte pro Eintrag, unabhängig von Ordnern',
        '• Suche — durchsucht Titel, Benutzernamen, URLs und Tags in Echtzeit',
      ],
    },
    {
      id: 'generator',
      title: 'Generator',
      body: [
        'Der Generator erzeugt Zufallspasswörter und Passphrasen:',
        '• Passwort — Länge und Zeichenklassen (Groß/klein, Ziffern, Symbole) wählbar; mehrdeutige Zeichen (l/1/O/0) lassen sich ausschließen',
        '• Passphrase — mehrere zufällige Wörter mit wählbarem Trenner; leichter zu merken, genauso stark',
        'Die Stärke-Anzeige bewertet das Ergebnis live. „Neu würfeln“ erzeugt Varianten, bis eine gefällt.',
      ],
    },
    {
      id: 'audit',
      title: 'Passwort-Check',
      body: [
        'Der Passwort-Check analysiert den ganzen Tresor und sortiert Funde in Kacheln:',
        '• Schwach — kurze oder simple Passwörter',
        '• Wiederverwendet / Identisch — dasselbe Passwort bei mehreren Einträgen',
        '• Alt — lange nicht geänderte Passwörter',
        '• Ohne 2FA — Einträge ohne hinterlegten Einmalcode',
        '• Kompromittiert — Abgleich gegen bekannte Datenlecks (Have-I-Been-Pwned)',
        'Der Leck-Abgleich ist k-anonym: Es verlassen nur die ersten 5 Zeichen des Passwort-Hashes das Gerät — nie das Passwort, nie der volle Hash.',
      ],
    },
    {
      id: 'totp',
      title: 'Einmalcodes (TOTP)',
      body: [
        'Hinterlege den 2FA-Schlüssel (das „Secret“ aus dem QR-Code) im Eintrag — keypile zeigt den laufenden 6-stelligen Code mit Ablauf-Anzeige.',
        'Code kopieren: ein Klick. So liegen Passwort und zweiter Faktor beisammen — praktisch; wer maximale Trennung will, nutzt weiterhin eine separate Authenticator-App.',
        'TOTP startet als Teil von keypile unlocked und ist in der Alpha frei testbar.',
      ],
    },
    {
      id: 'attachments',
      title: 'Anhänge',
      body: [
        'Dateien (Recovery-Codes, Verträge, Scans) lassen sich direkt am Eintrag ablegen — verschlüsselt im Tresor, nicht daneben.',
        'Anhänge lassen sich jederzeit wieder als Datei speichern oder vom Eintrag entfernen.',
        'Anhänge starten als Teil von keypile unlocked und sind in der Alpha frei testbar.',
      ],
    },
    {
      id: 'importexport',
      title: 'Import & Export',
      body: [
        '• Import — CSV-Exporte gängiger Passwortmanager und Browser einlesen; keypile ordnet die Spalten zu',
        '• Export — den Tresor als CSV exportieren, etwa für einen Umzug',
        'Achtung beim Export: Die CSV ist unverschlüsselter Klartext. Nur auf sicheren Datenträgern ablegen und danach löschen.',
      ],
    },
    {
      id: 'sync',
      title: 'Sync über deinen Cloud-Speicher',
      body: [
        'keypile braucht keinen eigenen Server: Lege die Tresor-Datei in einen synchronisierten Ordner (iCloud Drive, Dropbox, Google Drive, Nextcloud …) und öffne sie auf jedem Gerät.',
        'Ändert ein anderes Gerät die Datei, erkennt keypile das und führt die Stände zusammen; bei echten Konflikten wird nichts verworfen, sondern ein Konflikt-Eintrag angelegt.',
        'Zero-Knowledge bleibt gewahrt: Der Cloud-Anbieter sieht nur verschlüsselte Bytes.',
      ],
    },
    {
      id: 'security',
      title: 'Sicherheit & Sperren',
      body: [
        '• Auto-Sperre — der Tresor sperrt sich nach einstellbarer Inaktivität (Standard 10 Minuten)',
        '• Sperren bei Fokusverlust — optional sofort beim Verlassen des Fensters',
        '• Zwischenablage — kopierte Geheimnisse werden nach einstellbarer Zeit automatisch entfernt (Standard 30 Sekunden)',
        '• Manuell sperren — jederzeit über den Sperren-Knopf',
        'Kryptografie: Argon2id als Schlüsselableitung, AES-256-GCM für die Daten. Format und Verfahren sind dokumentiert (FORMAT.md im Repo).',
        'Alpha-Hinweis: Die Krypto ist dokumentiert, aber noch nicht extern auditiert — für produktive Passwörter bitte den Beta-Start abwarten.',
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      body: [
        'keypile prüft beim Start automatisch auf neue Versionen. Liegt eine bereit, öffnet sich der Update-Dialog mit dem Changelog — installiert wird erst nach deinem Klick.',
        'Manuell prüfen: in den Einstellungen.',
        'Updates kommen signiert von GitHub (LAN-SOLO/keypile): Die App prüft die Signatur vor jeder Installation. Tresor-Dateien und Einstellungen bleiben unangetastet.',
      ],
    },
    {
      id: 'plans',
      title: 'Free & unlocked',
      body: [
        'keypile Free bleibt kostenlos — der lokale Tresor ist keine Testversion: Einträge, Ordner, Generator, Passwort-Check, Import/Export und Sync über deinen Cloud-Ordner.',
        'keypile unlocked (12 € im Jahr, 1 € im Monat) bündelt später TOTP, Anhänge und weitere Extras — in der Alpha ist alles davon frei testbar.',
      ],
    },
  ],
};

const en: Content = {
  labels: {
    fab: 'Help & manual',
    tutorial: 'Tutorial',
    manual: 'Manual',
    search: 'Search the manual …',
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    done: 'Let’s go',
    stepOf: (n, total) => `Step ${n} of ${total}`,
    noResults: 'No matches',
  },
  tutorial: [
    {
      title: 'Welcome to keypile.',
      body: [
        'keypile is a password manager without cloud lock-in: your vault is a single encrypted file on your device.',
        'No account, no server — the master password never leaves this device and cannot be recovered.',
        'This tutorial takes two minutes. Reopen it anytime via the ? button in the bottom right.',
      ],
    },
    {
      title: 'Creating a vault',
      body: [
        '“Create new vault”, pick a location, set a master password — done.',
        'Choose a long, unique master password (ideally a passphrase of several words). It is the only key to everything.',
        'Optional: a key file as a second factor — without that file the vault won’t open even with the password. Keep it somewhere separate.',
      ],
    },
    {
      title: 'Entries & categories',
      body: [
        '“New entry” opens the template picker: login, card, note and more — each template brings the right fields.',
        'Custom fields can be added anytime — typed (text, password, PIN, date, URL …), reorderable via drag & drop and groupable into sections; sensitive fields are masked.',
        'Stay organized: folders in the sidebar, favorites, tags and the search on top.',
      ],
    },
    {
      title: 'Generator & password check',
      body: [
        'The generator creates strong passwords (length, digits, symbols) or memorable passphrases.',
        'The password check X-rays your vault: weak, reused, identical and old passwords — plus a breach check against known leaks (k-anonymous, your password never leaves the device).',
      ],
    },
    {
      title: 'TOTP, attachments & more',
      body: [
        'One-time codes (TOTP): store the 2FA secret in an entry — keypile shows the running 6-digit code right there.',
        'File attachments: keep documents with the entry, encrypted inside the vault.',
        'Both will belong to keypile unlocked — free to test during the alpha.',
      ],
    },
    {
      title: 'Sync without cloud lock-in',
      body: [
        'Just put the vault file into your cloud folder (iCloud, Dropbox, Nextcloud …) — keypile detects external changes and merges them.',
        'Your cloud provider only ever sees encrypted bytes. A copy of the file on a USB stick is already a complete backup.',
      ],
    },
    {
      title: 'Locking & updates',
      body: [
        'keypile locks itself after inactivity (configurable) and optionally when the window loses focus. Copied passwords are cleared from the clipboard after a short time.',
        'Updates arrive signed, right in the app — changelog first, installing needs your click.',
      ],
    },
  ],
  sections: [
    {
      id: 'vault',
      title: 'Vault',
      body: [
        'Your vault is a single encrypted file (Argon2id + AES-256-GCM). You decide where it lives.',
        '• Create — “Create new vault”: location, name, master password',
        '• Open — “Open vault” or an entry under “Recently opened”',
        '• Change master password — in Settings; the file is re-encrypted completely',
        'The master password never leaves the device and cannot be recovered — without it (and the key file, if set) there is no access, not even for us.',
        'Key file (optional): a second factor chosen at creation. Opening then requires password AND file — ideal on a USB stick kept separate from the machine.',
      ],
    },
    {
      id: 'entries',
      title: 'Entries',
      body: [
        '“New entry” starts from a template (login, card, identity, note …) — each brings suitable fields.',
        '• Fields — username, password, URL, notes; custom fields can be added (pick a type via ⚙︎: text, multiline, password, PIN, number, date, email, URL, phone), reordered via the ≡ handle, sections act as sub-headings; sensitive fields are masked',
        '• Copy — the icon next to a field copies its value; passwords never pass through the UI but go straight from the vault to the clipboard',
        '• Open URL — launches the stored website in your browser',
        '• History — changed passwords stay traceable in the entry history',
        '• Archive & trash — retired entries leave the lists but stay restorable; permanent deletion happens via the trash',
      ],
    },
    {
      id: 'organize',
      title: 'Folders, favorites & search',
      body: [
        '• Folders — your own structure in the sidebar; assign entries as you like',
        '• Favorites — the star marks what matters, the favorites view collects it',
        '• Tags — keywords per entry, independent of folders',
        '• Search — matches titles, usernames, URLs and tags in real time',
      ],
    },
    {
      id: 'generator',
      title: 'Generator',
      body: [
        'The generator creates random passwords and passphrases:',
        '• Password — configurable length and character classes (upper/lower, digits, symbols); ambiguous characters (l/1/O/0) can be excluded',
        '• Passphrase — several random words with a chosen separator; easier to remember, just as strong',
        'The strength meter rates the result live. “Regenerate” produces variants until one fits.',
      ],
    },
    {
      id: 'audit',
      title: 'Password check',
      body: [
        'The password check analyzes the whole vault and sorts findings into tiles:',
        '• Weak — short or simple passwords',
        '• Reused / identical — the same password across multiple entries',
        '• Old — passwords unchanged for a long time',
        '• No 2FA — entries without a one-time code',
        '• Compromised — checked against known breaches (Have I Been Pwned)',
        'The breach check is k-anonymous: only the first 5 characters of the password hash leave the device — never the password, never the full hash.',
      ],
    },
    {
      id: 'totp',
      title: 'One-time codes (TOTP)',
      body: [
        'Store the 2FA secret (the “secret” behind the QR code) in an entry — keypile shows the running 6-digit code with an expiry indicator.',
        'Copy the code with one click. Password and second factor live together — convenient; if you want maximum separation, keep using a separate authenticator app.',
        'TOTP launches as part of keypile unlocked and is free to test in the alpha.',
      ],
    },
    {
      id: 'attachments',
      title: 'Attachments',
      body: [
        'Files (recovery codes, contracts, scans) can be stored right on an entry — encrypted inside the vault, not next to it.',
        'Attachments can be saved back to disk or removed from the entry anytime.',
        'Attachments launch as part of keypile unlocked and are free to test in the alpha.',
      ],
    },
    {
      id: 'importexport',
      title: 'Import & export',
      body: [
        '• Import — read CSV exports of common password managers and browsers; keypile maps the columns',
        '• Export — export the vault as CSV, e.g. for a migration',
        'Careful with exports: the CSV is unencrypted plain text. Keep it on safe media only and delete it afterwards.',
      ],
    },
    {
      id: 'sync',
      title: 'Sync via your own cloud storage',
      body: [
        'keypile needs no server of its own: put the vault file into a synced folder (iCloud Drive, Dropbox, Google Drive, Nextcloud …) and open it on any device.',
        'When another device changes the file, keypile notices and merges the states; on real conflicts nothing is discarded — a conflict entry is created instead.',
        'Zero-knowledge holds: your cloud provider only ever sees encrypted bytes.',
      ],
    },
    {
      id: 'security',
      title: 'Security & locking',
      body: [
        '• Auto-lock — the vault locks after configurable inactivity (default 10 minutes)',
        '• Lock on blur — optionally the moment the window loses focus',
        '• Clipboard — copied secrets are cleared automatically after a configurable time (default 30 seconds)',
        '• Manual lock — anytime via the lock button',
        'Cryptography: Argon2id for key derivation, AES-256-GCM for the data. Format and procedures are documented (FORMAT.md in the repo).',
        'Alpha note: the crypto is documented but not externally audited yet — please wait for the beta before trusting it with production passwords.',
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      body: [
        'keypile checks for new versions automatically on launch. When one is available, the update dialog opens with the changelog — installing needs your click.',
        'Check manually: in Settings.',
        'Updates come signed from GitHub (LAN-SOLO/keypile): the app verifies the signature before every install. Vault files and settings stay untouched.',
      ],
    },
    {
      id: 'plans',
      title: 'Free & unlocked',
      body: [
        'keypile Free stays free — the local vault is not a trial: entries, folders, generator, password check, import/export and sync via your cloud folder.',
        'keypile unlocked (€12 a year, €1 a month) will later bundle TOTP, attachments and further extras — during the alpha all of it is free to test.',
      ],
    },
  ],
};

const SEEN_KEY = 'keypile.tutorialSeen';

export default function Help({ lang }: { lang: string }) {
  const c = lang === 'de' ? de : en;
  const [mode, setMode] = useState<'closed' | 'tutorial' | 'manual'>(() =>
    localStorage.getItem(SEEN_KEY) ? 'closed' : 'tutorial'
  );
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(c.sections[0].id);
  const [q, setQ] = useState('');

  const close = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setMode('closed');
    setStep(0);
  };

  const query = q.trim().toLowerCase();
  const filtered = query
    ? c.sections.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.body.some((p) => p.toLowerCase().includes(query))
      )
    : c.sections;
  const current = filtered.find((s) => s.id === sel) ?? filtered[0] ?? null;

  return (
    <>
      <button className="hlp-fab" title={c.labels.fab} onClick={() => setMode('manual')}>
        ?
      </button>
      {mode !== 'closed' && (
        <div className="hlp-overlay" onClick={close}>
          <div className="hlp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hlp-head">
              <span className="hlp-brand">
                <span className="hlp-name">keypile</span>
                <span className="hlp-dot">.</span>
              </span>
              <button
                className={`hlp-tab ${mode === 'tutorial' ? 'active' : ''}`}
                onClick={() => {
                  setMode('tutorial');
                  setStep(0);
                }}
              >
                {c.labels.tutorial}
              </button>
              <button
                className={`hlp-tab ${mode === 'manual' ? 'active' : ''}`}
                onClick={() => setMode('manual')}
              >
                {c.labels.manual}
              </button>
              <span className="hlp-spacer" />
              <button className="hlp-close" onClick={close}>
                ✕
              </button>
            </div>

            {mode === 'tutorial' && (
              <div className="hlp-tut">
                <div className="hlp-step-count">
                  {c.labels.stepOf(step + 1, c.tutorial.length)}
                </div>
                <h2>{c.tutorial[step].title}</h2>
                {c.tutorial[step].body.map((p, i) =>
                  p.startsWith('• ') ? (
                    <div key={i} className="hlp-li">
                      {p.slice(2)}
                    </div>
                  ) : (
                    <p key={i}>{p}</p>
                  )
                )}
                <div className="hlp-tut-nav">
                  <button className="hlp-ghost" onClick={close}>
                    {c.labels.skip}
                  </button>
                  <span className="hlp-dots">
                    {c.tutorial.map((_, i) => (
                      <span key={i} className={i === step ? 'on' : ''} />
                    ))}
                  </span>
                  {step > 0 && (
                    <button onClick={() => setStep(step - 1)}>{c.labels.back}</button>
                  )}
                  {step < c.tutorial.length - 1 ? (
                    <button className="hlp-primary" onClick={() => setStep(step + 1)}>
                      {c.labels.next}
                    </button>
                  ) : (
                    <button className="hlp-primary" onClick={close}>
                      {c.labels.done}
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === 'manual' && (
              <div className="hlp-body">
                <div className="hlp-toc">
                  <input
                    type="text"
                    placeholder={c.labels.search}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {filtered.length === 0 && (
                    <div className="hlp-empty">{c.labels.noResults}</div>
                  )}
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      className={`hlp-toc-item ${current?.id === s.id ? 'active' : ''}`}
                      onClick={() => setSel(s.id)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
                <div className="hlp-content">
                  {current && (
                    <>
                      <h2>{current.title}</h2>
                      {current.body.map((p, i) =>
                        p.startsWith('• ') ? (
                          <div key={i} className="hlp-li">
                            {p.slice(2)}
                          </div>
                        ) : (
                          <p key={i}>{p}</p>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
