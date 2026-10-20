import { useEffect, useState } from 'react';
import { localizeShortcuts } from '../keys';

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
        'Schnell kopieren per Tastatur: ⌘C Passwort, ⌘B Benutzername, ⌘T Einmalcode — alle Kürzel stehen im Handbuch.',
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
        'Beides gehört später zu keypile unlocked — in der Testphase ist es frei testbar.',
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
        '• Master-Passwort ändern — in den Einstellungen; die Datei wird komplett neu verschlüsselt (inkl. der .bak-Sicherung daneben). Nutzt der Tresor eine Schlüsseldatei, wird sie dabei mit abgefragt; sie bleibt erhalten, lässt sich aber auch tauschen oder entfernen',
        'Speichern: Jede Änderung wird sofort atomar geschrieben (erst eine Temp-Datei, dann Umbenennen; die vorige Version bleibt als .bak daneben). Schlägt das fehl — Ordner schreibgeschützt, Datenträger voll, Datei gesperrt —, meldet keypile „Speichern fehlgeschlagen“: Die letzte gültige Version bleibt unverändert auf der Platte, und die Aktion wird auch im geöffneten Tresor nicht übernommen. Ein bearbeiteter Eintrag bleibt im Bearbeiten-Formular stehen — Ursache beheben und erneut speichern; auch ein wiederholter Import legt nichts doppelt an.',
        'Das Master-Passwort verlässt das Gerät nie und ist nicht wiederherstellbar — ohne Passwort (und ggf. Schlüsseldatei) gibt es keinen Zugang, auch für uns nicht.',
        'Schlüsseldatei (optional): ein zweiter Faktor beim Anlegen. Tresor öffnen geht dann nur mit Passwort UND Datei — ideal auf einem USB-Stick getrennt vom Rechner.',
      ],
    },
    {
      id: 'entries',
      title: 'Einträge',
      body: [
        '„Neuer Eintrag“ startet mit einer Vorlage (Login, Karte, Identität, Notiz …) — jede bringt passende Felder mit.',
        '• Felder — Benutzername, Passwort, URL, Notizen; eigene Felder beliebig ergänzbar (Typ über ⚙︎ wählbar: Text, Mehrzeilig, Passwort, PIN, Zahl, Datum, E-Mail, URL, Telefon, Benutzername), per ≡-Griff neu anordenbar, Abschnitte als Zwischenüberschriften; als geschützt markierte Felder werden verdeckt dargestellt',
        '• Kopieren — Symbol am Feld kopiert den Wert. Benutzername, Passwort und Einmalcode liest keypile dafür direkt aus dem Tresor; eigene Felder und Generator-Ergebnisse kommen aus der Ansicht. Alles Kopierte wird als Geheimnis markiert und automatisch wieder geleert (siehe „Sicherheit & Sperren“)',
        '• URL öffnen — startet die hinterlegte Website im Browser',
        '• Verlauf — geänderte Passwörter bleiben in der Eintrags-Historie nachvollziehbar (die letzten 10 je Eintrag)',
        '• Archiv & Papierkorb — Ausgemustertes verschwindet aus den Listen, bleibt aber wiederherstellbar; endgültig löschen geht über den Papierkorb',
      ],
    },
    {
      id: 'organize',
      title: 'Ordner, Favoriten & Suche',
      body: [
        '• Ordner — eigene Struktur in der Seitenleiste; Einträge per Auswahl zuordnen. Ein „/“ im Namen erzeugt Unterordner („Arbeit/Kunden“). Beim Löschen eines Ordners bleiben die Einträge erhalten (ohne Ordner)',
        '• Favoriten — der Stern markiert Wichtiges, die Favoriten-Ansicht sammelt es',
        '• Tags — Schlagworte pro Eintrag, unabhängig von Ordnern',
        '• Suche — durchsucht Titel, Benutzernamen, alle URLs und Tags in Echtzeit; dabei werden auch archivierte Einträge gefunden',
      ],
    },
    {
      id: 'generator',
      title: 'Generator',
      body: [
        'Der Generator erzeugt Zufallspasswörter und Passphrasen:',
        '• Passwort — Länge (8–64) und Zeichenklassen (Groß/klein, Ziffern, Symbole) wählbar; verwechselbare Zeichen (I/l/1, O/0/o, 5/S) lassen sich ausschließen',
        '• Passphrase — 3 bis 10 zufällige Wörter aus der EFF-Liste (7776 Wörter, je rund 12,9 Bit) mit wählbarem Trenner, optional mit Großschreibung und Ziffer; leichter zu merken. Zum Vergleich: 5 Wörter ≈ 65 Bit, ein 20-stelliges Passwort aus allen Zeichenklassen ≈ 125 Bit — für vergleichbare Stärke mehr Wörter wählen',
        'Die Stärke-Anzeige bewertet das Ergebnis live. ↻ („Neu generieren“) erzeugt Varianten, bis eine gefällt.',
      ],
    },
    {
      id: 'audit',
      title: 'Passwort-Check',
      body: [
        'Der Passwort-Check analysiert den ganzen Tresor und sortiert Funde in Kacheln:',
        '• Schwach — kurze oder simple Passwörter',
        '• Wiederverwendet / Identisch — dasselbe Passwort bei mehreren Einträgen',
        '• Alt — lange nicht geänderte Passwörter, gestaffelt nach Alter (3–6 Monate, 6–12 Monate, 1–3 Jahre, über 3 Jahre)',
        '• Geleakt — Abgleich gegen bekannte Datenlecks (Have-I-Been-Pwned), startet erst per Klick auf „Leak-Abgleich starten“',
        'Archivierte Einträge und der Papierkorb zählen nicht mit. Dazu Zähl-Kacheln für Einträge mit 2FA-Code, mit Anhängen und mit Passkeys. Die Passkey-Verwaltung selbst ist in Arbeit — der Seitenleisten-Eintrag trägt deshalb noch das „bald“-Badge.',
        'Der Leck-Abgleich ist k-anonym: Es verlassen nur die ersten 5 Zeichen des Passwort-Hashes das Gerät — nie das Passwort, nie der volle Hash.',
      ],
    },
    {
      id: 'totp',
      title: 'Einmalcodes (TOTP)',
      body: [
        'Hinterlege den 2FA-Schlüssel (das „Secret“ aus dem QR-Code) im Eintrag — als Base32 oder komplette otpauth://-URI. keypile zeigt den laufenden Code (meist 6-stellig; Stellen, Periode und SHA-1/256/512 übernimmt es aus der URI) mit Ablauf-Anzeige.',
        'Code kopieren: ein Klick. So liegen Passwort und zweiter Faktor beisammen — praktisch; wer maximale Trennung will, nutzt weiterhin eine separate Authenticator-App.',
        'Unterstützt werden zeitbasierte Codes (otpauth://totp/, auch mit prozent-kodierten Werten wie %3D). Zählerbasierte HOTP-URIs lehnt keypile mit einer Meldung ab, statt falsche Codes anzuzeigen.',
        'TOTP startet als Teil von keypile unlocked und ist in der Testphase frei testbar.',
      ],
    },
    {
      id: 'attachments',
      title: 'Anhänge',
      body: [
        'Dateien (Recovery-Codes, Verträge, Scans) lassen sich direkt am Eintrag ablegen — verschlüsselt im Tresor, nicht daneben. Bis 10 MB pro Datei.',
        'Anhänge lassen sich jederzeit wieder als Datei speichern oder vom Eintrag entfernen.',
        'Anhänge starten als Teil von keypile unlocked und sind in der Testphase frei testbar.',
      ],
    },
    {
      id: 'importexport',
      title: 'Import & Export',
      body: [
        '• Import — CSV-Exporte gängiger Passwortmanager und Browser einlesen, ebenso unverschlüsselte JSON-Exporte im Bitwarden-Format; keypile ordnet die Felder zu. Die Datei muss UTF-8-kodiert sein (mit oder ohne BOM). Passwörter werden exakt übernommen, auch mit Leerzeichen am Anfang oder Ende',
        '• Export — den Tresor als CSV exportieren, etwa für einen Umzug. Die Datei ist UTF-8 mit BOM, damit Excel unter Windows Umlaute richtig anzeigt',
        '• Inhalt des Exports — Ordner, Titel, Benutzername, Passwort, erste URL, Notizen und TOTP aller Einträge außer dem Papierkorb (archivierte inklusive). Eigene Felder (z. B. Kartennummern), weitere URLs, Tags, Anhänge und der Passwort-Verlauf sind nicht enthalten — dafür die Tresor-Datei selbst kopieren',
        '• Formel-Schutz — beginnt ein Text (Ordner, Titel, Benutzername, URL, Notizen) mit =, +, -, @, Tabulator oder Wagenrücklauf, stellt keypile ein Hochkomma (\') voran, damit Tabellenprogramme ihn nicht als Formel ausführen. Passwort und TOTP bleiben unverändert, damit beim Umzug keine falschen Geheimnisse importiert werden — die Datei deshalb nicht in einer Tabellenkalkulation öffnen. Der keypile-Import entfernt das Hochkomma wieder',
        'Achtung beim Export: Die CSV ist unverschlüsselter Klartext. Nur auf sicheren Datenträgern ablegen und danach löschen. Bricht das Schreiben ab (z. B. Datenträger voll), entfernt keypile die unvollständige Datei.',
      ],
    },
    {
      id: 'sync',
      title: 'Sync über deinen Cloud-Speicher',
      body: [
        'keypile braucht keinen eigenen Server: Lege die Tresor-Datei in einen synchronisierten Ordner (iCloud Drive, Dropbox, Google Drive, Nextcloud …) und öffne sie auf jedem Gerät.',
        'Ändert ein anderes Gerät die Datei, erkennt keypile das und führt die Stände zusammen; bei echten Konflikten wird nichts verworfen, sondern ein Konflikt-Eintrag angelegt.',
        'Endgültig Gelöschtes (Papierkorb leeren, „Endgültig löschen“) bleibt als inhaltsleere Markierung im Tresor. So erreicht die Löschung auch die anderen Geräte, und der Eintrag kehrt beim nächsten Abgleich nicht zurück. Hat ein anderes Gerät den Eintrag in der Zwischenzeit bearbeitet, geht diese Bearbeitung nicht verloren.',
        'Ältere keypile-Versionen (vor 1.0) kennen diese Markierung nicht: Dort erscheinen endgültig gelöschte Einträge als leere Einträge im Papierkorb. Leert man dort den Papierkorb, verschwindet die Markierung, und ein Gerät mit einer älteren Kopie kann den Eintrag zurückbringen — deshalb alle Geräte, die denselben Tresor nutzen, auf 1.0 aktualisieren.',
        'Zero-Knowledge bleibt gewahrt: Der Cloud-Anbieter sieht nur verschlüsselte Bytes.',
      ],
    },
    {
      id: 'security',
      title: 'Sicherheit & Sperren',
      body: [
        '• Auto-Sperre — der Tresor sperrt sich nach einstellbarer Inaktivität (Standard 10 Minuten, 0 = nie)',
        '• Sperren bei Fokusverlust — optional sofort beim Verlassen des Fensters (Datei- und Bestätigungsdialoge von keypile selbst lösen es nicht aus)',
        '• Zwischenablage — kopierte Geheimnisse werden nach einstellbarer Zeit automatisch entfernt (Standard 30 Sekunden, 0 = kein Timer) und spätestens beim Sperren oder Beenden von keypile',
        'Die Auto-Sperre greift auch nach Ruhezustand: Beim Aufwachen prüft keypile sofort, ob die Inaktivitätszeit überschritten ist.',
        'Zwischenablage-Verlauf: keypile markiert kopierte Geheimnisse als „nicht in den Verlauf“. Windows nimmt sie dann weder in den Verlauf (Win+V) noch in die geräteübergreifende Zwischenablage auf; unter macOS gilt das für Zwischenablage-Manager, die den nspasteboard-Standard beachten. Andere Verlaufs-Tools können Kopien trotzdem behalten.',
        '• Manuell sperren — jederzeit über den Sperren-Knopf',
        'Kryptografie: Argon2id als Schlüsselableitung, AES-256-GCM für die Daten. Format und Verfahren sind dokumentiert (FORMAT.md im Repo).',
        'Hinweis: Die Krypto ist offen dokumentiert und intern auditiert (AUDIT-1.0.md), aber noch nicht von einer externen Stelle geprüft.',
      ],
    },
    {
      id: 'appearance',
      title: 'Oberfläche & Sprache',
      body: [
        '• Sprache — Deutsch oder Englisch, in den Einstellungen umschaltbar; das Handbuch folgt der Auswahl',
        '• Modus — Dunkel (Standard) oder Hell; die Wahl gilt sofort für die gesamte App inklusive Entsperr-Bildschirm und wird gespeichert',
      ],
    },
    {
      id: 'shortcuts',
      title: 'Tastaturkürzel',
      body: [
        'Mit ausgewähltem Eintrag (⌘ am Mac, Strg unter Windows/Linux):',
        '• ⌘C — Passwort kopieren (greift nur, wenn kein Text markiert ist)',
        '• ⌘B — Benutzernamen kopieren',
        '• ⌘T — Einmalcode (TOTP) kopieren',
        '• ⌘U — hinterlegte URL im Browser öffnen',
        '• ⌘E — Eintrag bearbeiten',
        'Allgemein:',
        '• ↑ / ↓ — durch die Eintragsliste gehen (auch aus dem Suchfeld heraus)',
        '• ⌘F — Suche fokussieren · ⌘N — neuer Eintrag · ⌘G — Generator',
        '• ⌘, — Einstellungen · ⌘L — Tresor sperren',
        'Kopierte Geheimnisse verschwinden wie gewohnt nach der eingestellten Zeit aus der Zwischenablage.',
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
        'keypile unlocked (12 € im Jahr, 1 € im Monat) bündelt später TOTP, Anhänge und weitere Extras — in der Testphase ist alles davon frei testbar.',
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
        'Copy fast from the keyboard: ⌘C password, ⌘B username, ⌘T one-time code — the full list is in the manual.',
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
        'Both will belong to keypile unlocked — free to test during the trial phase.',
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
        '• Change master password — in Settings; the file is re-encrypted completely (including the .bak backup next to it). If the vault uses a key file, it is asked for as well; it stays in use but can also be replaced or removed',
        'Saving: every change is written immediately and atomically (a temp file first, then a rename; the previous version stays next to it as .bak). If that fails — read-only folder, disk full, locked file — keypile reports “Saving failed”: the last good version stays untouched on disk, and the action is not applied to the open vault either. An edited entry stays in the edit form — fix the cause and save again; repeating an import doesn’t create duplicates either.',
        'The master password never leaves the device and cannot be recovered — without it (and the key file, if set) there is no access, not even for us.',
        'Key file (optional): a second factor chosen at creation. Opening then requires password AND file — ideal on a USB stick kept separate from the machine.',
      ],
    },
    {
      id: 'entries',
      title: 'Entries',
      body: [
        '“New entry” starts from a template (login, card, identity, note …) — each brings suitable fields.',
        '• Fields — username, password, URL, notes; custom fields can be added (pick a type via ⚙︎: text, multiline, password, PIN, number, date, email, URL, phone, username), reordered via the ≡ handle, sections act as sub-headings; fields marked as protected are masked',
        '• Copy — the icon next to a field copies its value. Username, password and one-time code are read straight from the vault; custom fields and generator output come from the view. Everything copied is flagged as a secret and cleared automatically (see “Security & locking”)',
        '• Open URL — launches the stored website in your browser',
        '• History — changed passwords stay traceable in the entry history (the last 10 per entry)',
        '• Archive & trash — retired entries leave the lists but stay restorable; permanent deletion happens via the trash',
      ],
    },
    {
      id: 'organize',
      title: 'Folders, favorites & search',
      body: [
        '• Folders — your own structure in the sidebar; assign entries as you like. A “/” in the name creates subfolders (“Work/Clients”). Deleting a folder keeps its entries (without a folder)',
        '• Favorites — the star marks what matters, the favorites view collects it',
        '• Tags — keywords per entry, independent of folders',
        '• Search — matches titles, usernames, all URLs and tags in real time; archived entries are found too',
      ],
    },
    {
      id: 'generator',
      title: 'Generator',
      body: [
        'The generator creates random passwords and passphrases:',
        '• Password — configurable length (8–64) and character classes (upper/lower, digits, symbols); look-alike characters (I/l/1, O/0/o, 5/S) can be excluded',
        '• Passphrase — 3 to 10 random words from the EFF list (7776 words, about 12.9 bits each) with a chosen separator, optionally capitalized and with a digit; easier to remember. For comparison: 5 words ≈ 65 bits, a 20-character password using all character classes ≈ 125 bits — pick more words for comparable strength',
        'The strength meter rates the result live. ↻ (“Regenerate”) produces variants until one fits.',
      ],
    },
    {
      id: 'audit',
      title: 'Password check',
      body: [
        'The password check analyzes the whole vault and sorts findings into tiles:',
        '• Weak — short or simple passwords',
        '• Reused / identical — the same password across multiple entries',
        '• Old — passwords unchanged for a long time, bucketed by age (3–6 months, 6–12 months, 1–3 years, over 3 years)',
        '• Breached — checked against known breaches (Have I Been Pwned), only after clicking “Run breach check”',
        'Archived entries and the trash are not counted. Plus counting tiles for entries with a 2FA code, with attachments and with passkeys. Passkey management itself is in the works — that’s why the sidebar entry still wears the “soon” badge.',
        'The breach check is k-anonymous: only the first 5 characters of the password hash leave the device — never the password, never the full hash.',
      ],
    },
    {
      id: 'totp',
      title: 'One-time codes (TOTP)',
      body: [
        'Store the 2FA secret (the “secret” behind the QR code) in an entry — as Base32 or a full otpauth:// URI. keypile shows the running code (usually 6 digits; digits, period and SHA-1/256/512 are taken from the URI) with an expiry indicator.',
        'Copy the code with one click. Password and second factor live together — convenient; if you want maximum separation, keep using a separate authenticator app.',
        'Time-based codes are supported (otpauth://totp/, including percent-encoded values such as %3D). Counter-based HOTP URIs are rejected with a message instead of showing wrong codes.',
        'TOTP launches as part of keypile unlocked and is free to test during the trial phase.',
      ],
    },
    {
      id: 'attachments',
      title: 'Attachments',
      body: [
        'Files (recovery codes, contracts, scans) can be stored right on an entry — encrypted inside the vault, not next to it. Up to 10 MB per file.',
        'Attachments can be saved back to disk or removed from the entry anytime.',
        'Attachments launch as part of keypile unlocked and are free to test during the trial phase.',
      ],
    },
    {
      id: 'importexport',
      title: 'Import & export',
      body: [
        '• Import — read CSV exports of common password managers and browsers, plus unencrypted JSON exports in Bitwarden format; keypile maps the fields. The file must be UTF-8 encoded (with or without BOM). Passwords are taken over exactly, including leading or trailing spaces',
        '• Export — export the vault as CSV, e.g. for a migration. The file is UTF-8 with a BOM so Excel on Windows shows umlauts correctly',
        '• What the export contains — folder, title, username, password, first URL, notes and TOTP of all entries except the trash (archived ones included). Custom fields (e.g. card numbers), further URLs, tags, attachments and the password history are not included — copy the vault file itself for those',
        '• Formula guard — if a text (folder, title, username, URL, notes) starts with =, +, -, @, a tab or a carriage return, keypile puts a single quote (\') in front so spreadsheet programs don’t run it as a formula. Password and TOTP stay unchanged so a migration never imports wrong secrets — so don’t open the file in a spreadsheet. keypile’s own import removes the quote again',
        'Careful with exports: the CSV is unencrypted plain text. Keep it on safe media only and delete it afterwards. If writing breaks off (e.g. disk full), keypile removes the incomplete file.',
      ],
    },
    {
      id: 'sync',
      title: 'Sync via your own cloud storage',
      body: [
        'keypile needs no server of its own: put the vault file into a synced folder (iCloud Drive, Dropbox, Google Drive, Nextcloud …) and open it on any device.',
        'When another device changes the file, keypile notices and merges the states; on real conflicts nothing is discarded — a conflict entry is created instead.',
        'Permanently deleted entries (empty trash, “Delete permanently”) stay in the vault as a content-free marker. That way the deletion reaches your other devices too, and the entry does not come back on the next merge. If another device edited the entry in the meantime, that edit is not lost.',
        'Older keypile versions (before 1.0) don’t know this marker: there, permanently deleted entries show up as empty entries in the trash. Emptying the trash there removes the marker, and a device holding an older copy can bring the entry back — so update every device that uses the same vault to 1.0.',
        'Zero-knowledge holds: your cloud provider only ever sees encrypted bytes.',
      ],
    },
    {
      id: 'security',
      title: 'Security & locking',
      body: [
        '• Auto-lock — the vault locks after configurable inactivity (default 10 minutes, 0 = never)',
        '• Lock on blur — optionally the moment the window loses focus (keypile’s own file and confirmation dialogs don’t trigger it)',
        '• Clipboard — copied secrets are cleared automatically after a configurable time (default 30 seconds, 0 = no timer) and at the latest when locking or quitting keypile',
        'Auto-lock also covers sleep: on wake-up keypile immediately checks whether the inactivity time has passed.',
        'Clipboard history: keypile flags copied secrets as “not for history”. Windows then keeps them out of the clipboard history (Win+V) and out of the cross-device clipboard; on macOS the same applies to clipboard managers that honour the nspasteboard convention. Other history tools may still keep copies.',
        '• Manual lock — anytime via the lock button',
        'Cryptography: Argon2id for key derivation, AES-256-GCM for the data. Format and procedures are documented (FORMAT.md in the repo).',
        'Note: the crypto is openly documented and internally audited (AUDIT-1.0.md), but has not yet been reviewed by an external party.',
      ],
    },
    {
      id: 'appearance',
      title: 'Interface & language',
      body: [
        '• Language — German or English, switchable in Settings; the handbook follows the selection',
        '• Mode — Dark (default) or Light; the choice applies immediately to the whole app including the unlock screen and is saved',
      ],
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      body: [
        'With an entry selected (⌘ on Mac, Ctrl on Windows/Linux):',
        '• ⌘C — copy password (only when no text is selected)',
        '• ⌘B — copy username',
        '• ⌘T — copy one-time code (TOTP)',
        '• ⌘U — open the stored URL in your browser',
        '• ⌘E — edit the entry',
        'General:',
        '• ↑ / ↓ — walk the entry list (works from the search box too)',
        '• ⌘F — focus search · ⌘N — new entry · ⌘G — generator',
        '• ⌘, — settings · ⌘L — lock the vault',
        'Copied secrets clear from the clipboard after the configured time, as usual.',
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
        'keypile unlocked (€12 a year, €1 a month) will later bundle TOTP, attachments and further extras — during the trial phase all of it is free to test.',
      ],
    },
  ],
};

const SEEN_KEY = 'keypile.tutorialSeen';

export default function Help({ lang }: { lang: string }) {
  // Sprache der Hilfe: folgt der App-Sprache, lässt sich aber im Kopf der
  // Hilfe jederzeit zwischen DE und EN umschalten
  const [helpLang, setHelpLang] = useState<'de' | 'en'>(lang === 'de' ? 'de' : 'en');
  useEffect(() => {
    setHelpLang(lang === 'de' ? 'de' : 'en');
  }, [lang]);
  const c = helpLang === 'de' ? de : en;
  const [mode, setMode] = useState<'closed' | 'tutorial' | 'manual'>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) ? 'closed' : 'tutorial';
    } catch {
      return 'tutorial';
    }
  });
  // "⌘C" in the texts becomes "Strg+C" / "Ctrl+C" on Windows and Linux
  const fx = (p: string) => localizeShortcuts(p, helpLang);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(c.sections[0].id);
  const [q, setQ] = useState('');

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setMode('closed');
    setStep(0);
  };

  const query = q.trim().toLowerCase();
  const filtered = query
    ? c.sections.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.body.some((p) => fx(p).toLowerCase().includes(query))
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
              <span className="hlp-lang" role="group" aria-label="Sprache / Language">
                <button className={`hlp-lang-btn ${helpLang === 'de' ? 'active' : ''}`} onClick={() => setHelpLang('de')}>
                  DE
                </button>
                <button className={`hlp-lang-btn ${helpLang === 'en' ? 'active' : ''}`} onClick={() => setHelpLang('en')}>
                  EN
                </button>
              </span>
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
                      {fx(p.slice(2))}
                    </div>
                  ) : (
                    <p key={i}>{fx(p)}</p>
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
                            {fx(p.slice(2))}
                          </div>
                        ) : (
                          <p key={i}>{fx(p)}</p>
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
