# keypile 1.0 — Funktions- und Sicherheits-Audit

Stand: 2026-10-19 · Basis-Commit `28fd8d2` (v0.3.2) · Ziel: 1.0.0-Test-Build für macOS und Windows.

Dieses Dokument hält fest, was für 1.0 geprüft wurde, **wie** es geprüft wurde und was noch ein
Mensch an echter Hardware testen muss. „Getestet“ heißt hier: tatsächlich ausgeführt
(Rust-Unit-/Integrationstest oder automatisierter UI-Durchlauf). „Statisch geprüft“ heißt:
Code gelesen und Aufrufpfade nachvollzogen, aber nicht ausgeführt.

## 1. Prüfmethoden

| Methode | Umfang | Ergebnis |
|---|---|---|
| `cargo test --workspace` | 42 Core-Tests (`core/`) + 7 App-Tests (`src-tauri/src/state.rs`) | alle grün |
| `cargo clippy` | Core + App | 2 Stil-Hinweise, keine Fehler |
| `pnpm build` (`tsc` strict + Vite) | gesamtes Frontend | fehlerfrei |
| `pnpm audit` | npm-Abhängigkeiten | nach Update von `source-map-js` 0 Befunde |
| UI-Durchlauf (headless Chrome via CDP) | Frontend gegen einen In-Memory-Mock der Rust-Commands (`mockIPC`, temporärer Harness, nicht im Repo), 63 Prüfschritte DE/EN, hell/dunkel | alle grün |
| Statische Prüfung | IPC-Namen/Argumente Frontend ↔ Rust, Capabilities, CSP, Updater, `cfg(target_os)`, Pfade, CI | siehe unten |

Der UI-Mock ersetzt nur die Rust-Seite; Kryptografie, Speichern und Merge sind über die
Rust-Tests abgedeckt. Native Dialoge, Zwischenablage des Betriebssystems, Updater und
Fensterverhalten wurden **nicht** ausgeführt — dafür gibt es die Checklisten in Abschnitt 5.

## 2. Funktionsinventar

Legende: **T** = automatisiert getestet · **U** = im UI-Durchlauf getestet · **S** = nur statisch geprüft · **M** = manuell auf macOS/Windows zu testen

### Tresor

| Funktion | Status |
|---|---|
| Tresor anlegen (Name, Master-Passwort ≥ 8, Wiederholung, optional Schlüsseldatei) | T (Format) · U (Validierung, `.keypile`-Endung wird ergänzt) · M |
| Tresor öffnen, „Zuletzt geöffnet“, Eintrag aus Liste entfernen | U · M |
| Falsches Passwort / falsche Schlüsseldatei / fremde Datei / neueres Format | T · U (lokalisierte Meldung) |
| Sperren (Knopf, ⌘/Strg+L), Auto-Sperre, Sperren bei Fokusverlust | U (inkl. Ruhezustand-Simulation, Dialog-Ausnahme) · M |
| Master-Passwort ändern (mit/ohne Schlüsseldatei, Datei tauschen/entfernen) | T (`rekey`) · U · M |
| Atomisches Speichern, `.bak`, Konflikt-Kopie bei fremdem Schlüssel, Schutz bei beschädigter Datei | T |
| Sync-Merge über Cloud-Ordner (Einträge, Tombstones, Konflikte, Ordner) | T |

### Einträge

| Funktion | Status |
|---|---|
| 10 Kategorien/Vorlagen, Vorlagen-Auswahl (⌘/Strg+N) | U |
| Titel, Benutzername, Passwort (anzeigen/verbergen, Generator ⚙︎, Stärke), mehrere URLs, Notizen, Tags, Ordner, Kategorie, Favorit | U |
| Eigene Felder: 11 Typen, Feld-Optionen, sensibel/maskiert, Abschnitte | U |
| Drag-&-Drop-Reihenfolge eigener Felder (≡-Griff) | S · M (HTML5-DnD im WebView) |
| Passwort-Verlauf (max. 10), `password_changed` | T (Merge/Core) · U |
| TOTP: Base32 und otpauth-URI, 4–10 Stellen, SHA-1/256/512, Live-Code | T (RFC-6238-Vektoren) · U |
| Anhänge: hinzufügen (≤ 10 MB), speichern unter, entfernen | U · M (native Dialoge) |
| Archivieren / aus Archiv holen | U |
| Papierkorb: löschen, wiederherstellen, endgültig löschen, leeren | U |
| Kopieren (Benutzer/Passwort/TOTP über Rust, ohne UI-Umweg), Auto-Clear | U (Mock) · M (echte Zwischenablage) |
| URL öffnen (⌘/Strg+U, Link) — `https://` wird ergänzt | U · M |

### Organisation, Suche, Kürzel

| Funktion | Status |
|---|---|
| Ordner anlegen, Unterordner per „/“, Baum auf-/zuklappen, löschen (mit Rückfrage) | U |
| Filter: Alle, Favoriten, Kategorien, Einmalcodes, Anhänge, Archiv, Papierkorb | U |
| Suche (Titel, Benutzer, URL, Tags; ⌘/Strg+F), ↑/↓ | U |
| Kürzel ⌘/Strg+C/B/T/U/E/N/F/G/,/L | U (C, B, T, U, E, N, G, „,“, L) · M (Strg auf Windows) |

### Audit, Generator, Import/Export, Einstellungen, Updates

| Funktion | Status |
|---|---|
| Audit-Kacheln (geleakt, identisch, schwach, Alters-Buckets, 2FA, Passkeys, Anhänge), Drill-down | U (Mock) · S (Rust-Logik) |
| HIBP-Abgleich (k-Anonymität, Padding, Timeout) | S · M (Netzwerk) |
| Generator: Passwort (Länge, Klassen, Mehrdeutige) und Passphrase (EFF-Liste) | T · U |
| Import CSV (Chrome, KeePassXC, LastPass, Bitwarden, 1Password, BOM) und Bitwarden-JSON | T · U (Fehlerpfade) |
| Export CSV (mit Warnung), Quoting von Kommas/Zeilenumbrüchen | T · U |
| Einstellungen: Auto-Sperre, Zwischenablage, Fokus-Sperre, Sprache, Hell/Dunkel | U |
| Sprache beim ersten Start aus dem System | U |
| Update-Prüfung beim Start, Changelog-Dialog, Installation | S · M |
| Hilfe: Tutorial, durchsuchbares Handbuch, DE/EN-Umschalter | U (Tutorial) · S (Inhalte aktualisiert) |

## 3. Sicherheitsbefunde

| # | Schwere | Befund | Status |
|---|---|---|---|
| 1 | Mittel | KDF-Parameter im (vor der Entschlüsselung nicht authentifizierten) Header unbegrenzt: eine präparierte Datei konnte viele GiB RAM oder stundenlange Argon2-Läufe erzwingen. | behoben — Grenzen 8 MiB–1 GiB, t ≤ 64, p ≤ 16 (`KdfParams::validate`, FORMAT.md) |
| 2 | Mittel | Nach dem Wechsel des Master-Passworts blieb die `.keypile.bak` mit dem **alten** Passwort lesbar liegen. | behoben — `.bak` wird mit neuem Schlüssel neu geschrieben |
| 3 | Mittel | Passwortwechsel bei extern geänderter Datei: der neue Schlüssel konnte die Fremdänderung nicht entschlüsseln → Konflikt-Kopie statt Merge; bei Schreibfehler stimmten Speicher und Datei nicht mehr überein. | behoben — erst Merge mit altem Schlüssel, dann Rekey mit Rollback |
| 4 | Mittel | Webview hatte `clipboard-manager:allow-read-text`/`write-text`, obwohl nur Rust die Zwischenablage nutzt (Least Privilege). | behoben — aus der Capability entfernt |
| 5 | Niedrig | Kopierte Secrets blieben nach dem Sperren in der Zwischenablage, bis der Timer ablief. | behoben — Sperren löscht ein von keypile kopiertes Secret (Hash-Vergleich, das Secret selbst wird nicht gespeichert) |
| 6 | Niedrig | Auto-Sperre über einen langen `setTimeout` — pausiert im Ruhezustand, Tresor blieb nach dem Aufwachen bis zu einer vollen Periode offen. | behoben — Zeitstempel-Prüfung alle 5 s und bei Fokus/Sichtbarkeit |
| 7 | Niedrig | Schlüsselvergleich beim Passwortwechsel mit `!=` (früher Abbruch). | behoben — `ct_eq` |
| 8 | Niedrig | Master-Passwort wurde auf einigen Fehlerpfaden (Schlüsseldatei unlesbar, Datei fehlt) nicht zeroized; entschlüsselte Secrets blieben nach dem Sperren im Speicher. | behoben — Zeroize auf allen Pfaden, `Session::drop` überschreibt Secrets (best effort) |
| 9 | Niedrig | `save_entry` lieferte Anhang-Bytes ans UI. | behoben |
| 10 | Niedrig | Vite-Abhängigkeit `source-map-js` < 1.2.2 (GHSA-68fv-2mgg-jv7q, nur Build-Zeit). | behoben — Lockfile-Update, keine neue Abhängigkeit |
| 11 | Info | CSP `default-src 'self'`, kein `dangerouslySetInnerHTML`/`innerHTML`, React escaped alle Tresorinhalte; Opener nur Standard-Schemata (http/https/mailto/tel). | in Ordnung |
| 12 | Info | Updater: Minisign-Pubkey gesetzt, Endpoint `https://github.com/...`; TLS über rustls, nirgends deaktiviert. | in Ordnung |
| 13 | Info | AES-256-GCM mit frischer Zufalls-Nonce pro Speichern, AAD über den kompletten Header, Argon2id 64 MiB/t=3/p=4. | in Ordnung (Tests vorhanden) |
| 14 | Info | IPC-Commands nehmen beliebige Pfade an (Import, Anhang, Export, Schlüsseldatei). Die Pfade stammen aus nativen Dialogen; ausnutzbar wäre das nur mit Code-Ausführung im Webview, die CSP + fehlendes HTML-Rendering verhindern. | akzeptiert, dokumentiert |
| 15 | Info | `glib` 0.18 (RUSTSEC-2024-0429) kommt transitiv über Tauri/GTK — nur Linux, nicht von uns behebbar. `cargo audit` war lokal nicht installiert; die Versionen von ring, rustls, tokio, idna, crossbeam-channel, url wurden manuell gegen bekannte Advisories geprüft. | offen (upstream) |

## 4. Behobene Funktionsfehler (Auswahl)

- **Master-Passwort ändern war bei Tresoren mit Schlüsseldatei unmöglich** (UI schickte nie eine Schlüsseldatei → immer „Passwort falsch“). Jetzt: aktuelle Datei abfragen, behalten, tauschen oder entfernen.
- **„Zuletzt geöffnet“ ging verloren**, sobald danach eine Einstellung geändert wurde (veralteter UI-Stand überschrieb die Liste). Backend besitzt jetzt `recent_vaults`/`device_id`.
- **Detailansicht nach dem Bearbeiten veraltet** (Verlauf, eigene Felder, Datum erst nach Neuauswahl sichtbar).
- **Sperren bei Fokusverlust sperrte beim Öffnen eigener Dateidialoge** → „Anhang hinzufügen“, Import usw. scheiterten.
- **Windows:** Dateinamen wurden als kompletter Pfad angezeigt (Backslash), Sprache startete immer Englisch, `rename` scheiterte bei kurz gesperrten Dateien (OneDrive/Dropbox/Virenscanner) — jetzt mit Wiederholung; `fsync` vor dem Umbenennen.
- TOTP mit 10 Stellen lief über (u32), leere Secrets wurden akzeptiert.
- CSV/JSON mit UTF-8-BOM (Excel, 1Password) verloren die erste Spalte.
- Ordner-Umbenennen/-Löschen synchronisierte nicht über den Cloud-Ordner.
- Englische UI zeigte deutsche Backend-Fehler (und umgekehrt) — `src/errors.ts` übersetzt.
- Fehlende Fehlerbehandlung bei Löschen/Wiederherstellen/Archivieren/Papierkorb; „AKTIV“ und Standard-Tresorname hart kodiert; Ordner löschen ohne Rückfrage.

## 5. Bekannte Einschränkungen

- **Kein externer Krypto-Audit.** Die In-App-Texte (Hilfe, Plan) sprechen weiterhin von „Alpha“ —
  ob 1.0 diese Hinweise behält, ist eine Produktentscheidung.
- ~~Papierkorb leeren / endgültig löschen entfernt den Tombstone~~ — behoben in Runde 2 (Purge-Tombstone, §9).
- ~~CSV-Export wird nicht gegen Formel-Injection entschärft~~ — Textspalten entschärft in Runde 3 (§11);
  Passwort und TOTP bleiben bewusst byte-genau (Tabellenprogramm deshalb nicht zum Öffnen verwenden).
- Import erwartet UTF-8; UTF-16- oder ANSI-CSV wird mit klarer Meldung abgelehnt.
- Schlüsseldateien werden vollständig eingelesen (keine Größenbegrenzung, wie KeePassXC).
- Zeroize ist best effort: Kopien in WebView/JS-Heap (z. B. angezeigte Passwörter) kontrolliert die App nicht.
- ~~Beendet man die App vor Ablauf des Zwischenablage-Timers, bleibt das Secret in der Zwischenablage~~ — behoben in Runde 2.
- ~~Native Bestätigungsdialoge zeigen die Knopfbeschriftung des Betriebssystems~~ — behoben in Runde 2 (Beschriftung in UI-Sprache).
- Ein hart beendeter Prozess (Absturz, Task-Manager „Task beenden“) kann ein kopiertes Secret nicht mehr entfernen.

## 6. Manuelle Testliste

### macOS (arm64 und Intel, DMG aus CI)

- [ ] DMG öffnet ohne Gatekeeper-Warnung (signiert + notarisiert), App startet, Version in Einstellungen = 1.0.0
- [ ] Erster Start: Tutorial erscheint, Sprache entspricht der Systemsprache
- [ ] Tresor anlegen in iCloud Drive; mit Schlüsseldatei anlegen; schließen, erneut öffnen
- [ ] Falsches Passwort → verständliche Meldung; Schlüsseldatei vergessen → gleiche Meldung
- [ ] Login-Eintrag mit TOTP; Code stimmt mit einer Authenticator-App überein
- [ ] ⌘C/⌘B/⌘T kopieren; nach 30 s ist die Zwischenablage leer; Sperren (⌘L) und Beenden (⌘Q) leeren sie sofort
- [ ] Mit einem Clipboard-Manager (z. B. Maccy, Raycast): kopierte Passwörter landen nicht im Verlauf
- [ ] Entsperren mit Standard-Parametern: Fenster bleibt während Argon2 bedienbar (Spinner „…“), „Zurück“ ist währenddessen gesperrt
- [ ] Bestätigungsdialoge: Knöpfe in UI-Sprache, Abbrechen ändert nichts
- [ ] Zwei Geräte: auf A Papierkorb leeren, B speichert danach — der Eintrag kommt auf A **nicht** zurück; auf B gleichzeitig bearbeitet → Bearbeitung bleibt erhalten
- [ ] Eigene Felder per ≡ ziehen und neu anordnen
- [ ] Anhang hinzufügen (PDF), „Speichern unter“, Datei öffnet korrekt; > 10 MB wird abgelehnt
- [ ] „Sperren bei Fokusverlust“ an: Anhang-Dialog sperrt nicht, Wechsel zu anderer App sperrt
- [ ] Auto-Sperre 1 min, Mac in den Ruhezustand, nach > 1 min aufwecken → gesperrt
- [ ] Master-Passwort ändern mit Schlüsseldatei (behalten / neue / entfernen); danach neu öffnen; `.keypile.bak` öffnet nur mit neuem Passwort
- [ ] Zwei Macs (oder zwei Kopien) über denselben Cloud-Ordner: Einträge auf beiden ändern → Merge, Konflikt-Kopie bei gleichzeitiger Änderung
- [ ] Import: Chrome-CSV, 1Password-CSV (mit BOM), Bitwarden-JSON; Export CSV
- [ ] HIBP-Abgleich mit Netz, ohne Netz (Fehlermeldung)
- [ ] Update-Prüfung (bei vorhandener höherer Version: Changelog, Installation, Neustart)
- [ ] Hell/Dunkel, DE/EN umschalten; Hilfe-Sprachumschalter

### Windows 10/11 (NSIS-Installer und MSI)

- [ ] Installation ohne Admin (NSIS, currentUser), SmartScreen-Verhalten notieren, App-Icon ohne weiße Ecken
- [ ] Erster Start auf deutschem Windows → deutsche Oberfläche
- [ ] Tresor in `C:\Users\…\OneDrive\…` anlegen; Dateiname in „Zuletzt geöffnet“ ohne kompletten Pfad
- [ ] Speichern dauerhaft mehrmals hintereinander, während OneDrive synchronisiert (kein „Zugriff verweigert“)
- [ ] Laufwerksbuchstaben/UNC: Tresor auf USB-Stick (`E:\`) und Netzlaufwerk öffnen
- [ ] Strg+C/B/T/U/E/N/F/G/,/L; Strg+C in einem Textfeld kopiert weiterhin markierten Text
- [ ] Zwischenablage-Auto-Clear und Löschen beim Sperren und beim Beenden
- [ ] Win+V-Verlauf und geräteübergreifende Zwischenablage aktiv: kopiertes Passwort erscheint **nicht** im Verlauf (Runde 2), normaler Text aus anderen Apps weiterhin schon
- [ ] Bestätigungsdialoge (Löschen, Papierkorb leeren, Ordner löschen, Anhang entfernen, CSV-Export): deutsche Knöpfe, **Abbrechen/Esc/Schließen-X lässt alles unverändert**
- [ ] Tooltips/Handbuch zeigen „Strg+…“ (deutsch) bzw. „Ctrl+…“ (englisch); AltGr+Q (@) in einem Feld löst kein Kürzel aus
- [ ] Anhang-/Import-/Export-Dialoge, Dateifilter `.keypile`, `.csv`, `.json`
- [ ] Drag & Drop eigener Felder in WebView2
- [ ] „Sperren bei Fokusverlust“ mit Dateidialogen und Alt+Tab
- [ ] Energiesparmodus/Ruhezustand mit Auto-Sperre
- [ ] Master-Passwort ändern inkl. Schlüsseldatei; `.bak` danach nur mit neuem Passwort
- [ ] Update über NSIS-Updater (App beendet sich, installiert, startet neu); Tresor unverändert
- [ ] Deinstallation lässt Tresor-Dateien und `%APPDATA%\com.lan-solo.keypile\settings.json` unberührt

## 7. CI / Release

`.github/workflows/build.yml` wurde auf 1.0.0-Tauglichkeit geprüft: Versionsnummer kommt aus
`tauri.conf.json` (MSI verlangt numerisches `x.y.z` — erfüllt), `workflow_dispatch` baut alle vier
Ziele und lädt Artefakte hoch, Signatur/Notarisierung bleiben unverändert aktiv, sobald die
Apple-Secrets gesetzt sind. Kein Änderungsbedarf.

## 8. Verifikation (unabhängige Zweitprüfung)

Stand: 2026-10-19 · geprüft: Diff `28fd8d2..ec3cbbc` vollständig (Rust, Frontend, Konfiguration, CI).

### Selbst ausgeführt

| Prüfung | Ergebnis |
|---|---|
| `cargo test --workspace` (vor eigenen Änderungen) | Core 42/42, App 7/7 grün — Angaben bestätigt |
| `cargo test --workspace` (nach eigenen Änderungen) | Core 43/43, App 8/8 grün |
| `cargo clippy --workspace` | 0 Fehler, 2 Stil-Hinweise (`sort_by_key`, `split_once`) — bestätigt |
| `pnpm build` (`tsc` strict + Vite) | fehlerfrei |
| `pnpm audit` | 0 Befunde |
| IPC-Abgleich | 34 Commands in `generate_handler!` = 34 Aufrufe in `src/api.ts`, Namen und Argumente (camelCase → snake_case) stimmen überein |
| Version | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `Cargo.lock` (Paket `keypile`) = 1.0.0; `keypile-core` bewusst 0.3.0 (internes Crate, nicht ausgeliefert) |
| `localizeError` + `baseName` | per Node-Skript mit 13 echten Backend-Meldungen und Windows-/UNC-/Umlaut-Pfaden ausgeführt |

### Neue Tests

- `format::crafted_headers_fail_cleanly` — präparierte Container (falsche Nonce-Länge, zu kurzes
  Salt, Ciphertext kürzer als das GCM-Tag, KDF-Speicherbombe `m=u32::MAX`, Header-Länge hinter
  Dateiende, Header kein JSON) enden alle mit Fehler, keiner mit Panic; die Speicherbombe wird
  vor Argon2 abgelehnt.
- `state::unicode_and_space_paths` — Speichern, `.bak` und erneutes Öffnen in
  `Jörg Müller — Tresore/Mein Tresor ä.keypile` mit Umlaut-/€-Passwort.

### Nachgebessert

- **Import-Fehler in falscher Sprache:** Core-Importfehler kommen als `import error: <deutscher Text>`.
  In der deutschen UI stand das englische Präfix davor, in der englischen UI blieb „kein gültiges
  JSON“, „CSV konnte nicht gelesen werden“ und „JSON enthält kein 'items'-Array“ deutsch.
  `src/errors.ts` entfernt das Präfix und übersetzt diese Meldungen; ebenso „Externe Vault-Datei
  ist beschädigt/unlesbar“.
- **Hilfe (DE+EN), Sicherheit & Sperren:** Hinweis ergänzt, dass der Windows-Zwischenablage-Verlauf
  (Win+V, geräteübergreifender Verlauf) kopierte Secrets unabhängig vom automatischen Leeren
  behält.

### Bestätigt / nicht widerlegt

- KDF-Grenzen greifen vor Argon2 (`derive_key` → `validate`), Default 64 MiB/t=3/p=4 liegt innerhalb.
  Bestehende Tresore nutzen ausschließlich den Default (es gibt keine UI für andere Parameter).
- `rekey`: Merge mit altem Schlüssel → neuer Schlüssel → `.bak` neu. Der Rollback-Zweig nach einem
  Fehler beim **zweiten** Schreiben ist nur statisch geprüft (nicht ohne Umbau injizierbar); er setzt
  Schlüssel und Header zurück, nur `meta.generation` bleibt erhöht (harmlos).
- Windows-Pfade: `rename_with_retry` (20 × 100 ms bei Fehler 5/32), `backup_path` über
  `with_extension`, Anzeige über `baseName` — alle ohne Unix-Annahmen. Die Tests nutzen
  `std::env::temp_dir()` und laufen damit auch unter Windows.
- Capabilities: Webview hat nur `core:default`, `dialog:default`, `opener:default`; Kopieren läuft
  ausschließlich über Rust-Commands. Opener öffnet nur http(s)/mailto/tel; Eintrags-URLs ohne Schema
  bekommen `https://` vorangestellt.
- CI (`build.yml`): `workflow_dispatch` baut macOS arm64/Intel, Windows (MSI/NSIS) und Linux;
  1.0.0 ist MSI-kompatibel; Signatur/Notarisierung unverändert. Kein Änderungsbedarf.

### Zusätzliche Einschränkungen (nicht behoben, dokumentiert)

- *(behoben in Runde 2, §9)* **Windows-Zwischenablage-Verlauf:** keypile setzt kein `ExcludeClipboardContentFromMonitorProcessing`
  (bräuchte eine neue Windows-Abhängigkeit). Kopierte Secrets landen bei aktivem Win+V-Verlauf dort
  und werden vom Auto-Clear nicht entfernt. Hinweis steht jetzt in der Hilfe.
- *(behoben in Runde 2, §9)* **Argon2 läuft im Haupt-Thread** (`open_vault`, `create_vault`, `change_master_password` sind
  synchrone Tauri-Commands). Mit Default-Parametern ~0,3–1 s Einfrieren; eine präparierte Datei an
  der Obergrenze (1 GiB, t = 64) kann das Fenster bis zu etwa einer Minute blockieren, bevor die
  Fehlermeldung kommt (begrenzt, kein Absturz).
- *(behoben in Runde 2, §9)* `otpauth://`-URIs mit URL-kodiertem Secret (`%3D`-Padding) werden als ungültig abgelehnt (Fehler
  beim Speichern, kein stiller Fehlwert).
- *(behoben in Runde 2, §9)* Die Tastenkürzel-Hilfe zeigt ⌘-Symbole mit dem Hinweis „Strg unter Windows/Linux“; die Hinweiszeile
  im Einstiegsabschnitt nennt nur ⌘.

## 9. Runde 2 (2026-10-20)

Basis: `863cb3e` (origin/main). Ziel: jede Funktion fehlerfrei auf Windows und macOS, Muster L1–L13
aus den anderen Apps gezielt gesucht. Ein unvollständiger, uncommitteter Zwischenstand einer
früheren Sitzung (Purge-Tombstone, async-Commands, Zwischenablage-Ausschluss, Settings-Sperre,
TOTP-Prozentkodierung, CSV-BOM) wurde geprüft, korrigiert (u. a. ein Panic) und übernommen.

### Behoben

| # | Befund | Lösung |
|---|---|---|
| L8 | Argon2 (Öffnen, Anlegen, Master-Passwort ändern) lief synchron im Haupt-Thread → Fenster fror ein, bei präparierter Datei bis ~1 min | `open_vault`/`create_vault`/`change_master_password` sind `async` + `spawn_blocking`; alle übrigen Commands `#[tauri::command(async)]` (Datei-IO, Import, Export, Anhänge laufen nicht mehr im Haupt-Thread). Beim Passwortwechsel laufen beide Argon2-Läufe ohne Session-Sperre; danach wird geprüft, ob der Tresor noch derselbe und entsperrt ist |
| L9 | Während des Entsperrens konnte man „Zurück“ drücken und einen anderen Tresor wählen | „Zurück“ und Schlüsseldatei-Knopf sind gesperrt, solange `busy` |
| — | Zwischenablage: Secrets landeten im Windows-Verlauf (Win+V) und in der Cloud-Zwischenablage; blieben nach dem Beenden liegen | Kopieren über `arboard` (bereits im Lockfile, kam über das Clipboard-Plugin, jetzt direkt eingebunden) mit `exclude_from_history` + `exclude_from_cloud` (Windows-Formate `CanIncludeInClipboardHistory`/`CanUploadToCloudClipboard`) bzw. `org.nspasteboard.ConcealedType` (macOS); `RunEvent::Exit` leert die Zwischenablage, wenn sie noch das Secret hält |
| — | Papierkorb leeren/endgültig löschen entfernte den Tombstone → Eintrag kam per Sync zurück | Purge-Tombstone `purged: true` (Inhalte geleert/zeroized, `vv` erhöht), unsichtbar in allen Commands; Merge erzeugt aus einem Purge keine Konflikt-Kopie. FORMAT.md §6 |
| L1/L11 | Native Bestätigungsdialoge mit englischen Knöpfen „Ok/Cancel“ in der deutschen UI | `confirmDialog(msg, {ok, cancel})` mit sprechenden Knöpfen („Löschen“/„Abbrechen“, „Papierkorb leeren“ …) und `kind: warning`. Geprüft: Plugin 2.7.2 liefert bei eigenen Knöpfen das geklickte Label (rfd `Custom`), Esc/X → `Cancel` → `false`. Kein `window.confirm/alert/prompt` im Code |
| L11 | Fehler beim Öffnen von URLs (Opener), Dateidialogen und „Aus der Liste entfernen“ wurden verschluckt | `openExternal()` mit Toast, Dialogaufrufe im try/catch, Fehler auf dem Startbildschirm sichtbar |
| L2 | Unübersetzte Backend-Meldungen: „Zwischenablage nicht verfügbar“, „Interner Fehler“, „HIBP-Fehler: HTTP …“, „Header beschädigt“, „Unbekanntes Feld“, `crypto error`, `i/o error`, `serialization error`, HOTP-Ablehnung | Regeln in `src/errors.ts`; Test prüft 25 echte Meldungen gegen deutsche Wörter in der EN-Ausgabe |
| L2 | Konflikt-Kopien hießen auch in der englischen UI „Titel (Konflikt)“, die Konfliktdatei „… (Konflikt).keypile“ | `merge_with_label` + `Session.conflict_label` aus der UI-Sprache (wird beim Sprachwechsel nachgeführt) |
| L6 | Kürzel-Hinweise zeigten unter Windows „Ctrl+“ auch in der deutschen UI, das Handbuch nur „⌘“ | `modLabel(lang)`: ⌘ / „Strg+“ / „Ctrl+“; Handbuch ersetzt `⌘X` zur Laufzeit. Als Kürzel-Taste zählt unter Windows nur Strg ohne Alt (AltGr kommt als Strg+Alt an — defensiv, damit AltGr-Eingaben nie ein Kürzel auslösen), unter macOS nur ⌘ (vorher lösten dort auch Ctrl-Kombinationen aus) |
| L10 | Datumsangaben (Erstellt/Geändert, Verlauf, Datumsfelder, Update-Datum) folgten der OS-Locale statt der UI-Sprache; das Updater-Datum (`2026-10-01 12:00:00.0 +00:00:00`) ließ sich nicht parsen und fehlte immer | `uiLocale(lang)`; Update-Datum aus `YYYY-MM-DD` als lokales Kalenderdatum |
| L4 | CSV-Export ohne BOM → Excel (Windows) zeigt Umlaute falsch; `settings.json` mit BOM (Notepad) wurde verworfen | Export mit UTF-8-BOM (alle Importer überspringen sie); Settings lesen BOM |
| L5 | Anhangsnamen aus synchronisierten Tresoren gingen ungefiltert als `defaultPath` in den Speichern-Dialog (`..\..\x`, `CON`, `a:b`) | `safeFileName()` (Trenner/`:*?"<>|`/Steuerzeichen → `_`, reservierte Namen, Punkte/Leerzeichen am Ende, Länge); Umlaute/Leerzeichen bleiben. Der Zielpfad selbst kommt immer aus dem nativen Dialog |
| L5 | Export ohne `.csv`, wenn der Windows-Dialog die Endung nicht anhängt; „Zuletzt geöffnet“ doppelt bei anderer Groß-/Kleinschreibung (NTFS) | `withExtension()`; `same_path()` vergleicht unter Windows case-insensitiv und mit `/`=`\` |
| — | `settings.json` nicht atomar geschrieben, parallele async-Commands konnten sich überschreiben; kaputte Datei → bei jedem Aufruf neue Geräte-ID | Mutex um Lesen-Ändern-Schreiben, Temp-Datei + `rename_with_retry`; kaputte/fehlende Datei wird sofort mit Defaults ersetzt |
| — | TOTP: `%3D`-Padding und `OTPAUTH://` abgelehnt; `otpauth://hotp/` lieferte still falsche Codes | Prozent-Dekodierung, Schema case-insensitiv, HOTP mit klarer Meldung abgelehnt |
| — | **Panic** im übernommenen Zwischenstand: `input[..10]` auf einem Secret mit Mehrbyte-Zeichen an Byte 10 | `input.get(..10)`; Test `multibyte_prefix_does_not_panic` |
| Layout | Bei kleinem Fenster (880 × 560, Mindestgröße) wurde der Eintragstitel auf einen Buchstaben pro Zeile gequetscht; lange Benutzernamen erzeugten eine horizontale Scrollleiste in der Liste | Kopfzeile darf umbrechen (`flex: 1 1 160px; min-width: 0`), Listen-Unterzeile mit Ellipse |
| Deps | `cargo audit`: rustls 0.23.43 (4 Advisories), quinn-proto 0.11.16 (5), chacha20 0.10.1 (yanked) | Lockfile-Patch-Updates auf rustls 0.23.46, quinn-proto 0.11.19, chacha20 0.10.2 |

### Geprüft ohne Befund

- L3 Erststart-Sprache: Rust-Default aus `$LANG`, beim ersten Start übernimmt das Frontend `navigator.language` (Runde 1).
- L7 Kein HTML-Rendering fremder Inhalte (kein `innerHTML`/`dangerouslySetInnerHTML`, Changelog als Text), CSP `default-src 'self'`.
- L12 Alle sichtbaren Texte aus `i18n.ts` (EN ist `typeof de`, fehlende Schlüssel brechen den Build); Hilfe DE+EN an alle Änderungen angepasst.
- L13 Updater: Endpoint `releases/latest/download/latest.json`, Releases werden nicht als Prerelease veröffentlicht, Pubkey gesetzt, Semver-Vergleich mit 1.0.0 durch das Plugin; Fehler mit übersetztem Präfix, Startprüfung still.

### Ausgeführt

| Prüfung | Ergebnis |
|---|---|
| `cargo test --workspace` | Core 49/49, App 11/11 |
| `cargo clippy --workspace --tests` | 0 Warnungen |
| `cargo check --target x86_64-pc-windows-msvc --workspace --tests` (vom Mac, ohne Linken) | fehlerfrei, inkl. `arboard::SetExtWindows` |
| `cargo audit` | verbleibend: `zip` 4.6.1 (3 Advisories zu `extract`/Symlinks/SUID; nur im Updater, der ausschließlich minisign-signierte Pakete entpackt; Fix erst mit zip ≥ 9 = Major-Update des Updater-Plugins), `glib` 0.18 (nur Linux/GTK), unmaintained-Hinweise (unic-*, proc-macro-error, zbus/zvariant) |
| `pnpm test` (neu, Node `--experimental-strip-types`, keine neue Abhängigkeit) | 6/6: Fehlerübersetzung DE/EN, Strg/Ctrl/⌘ inkl. simuliertem WebView2, AltGr, `safeFileName`, `withExtension` |
| `pnpm build` | fehlerfrei |
| Headless Chromium, gemockte IPC (Dialog-Plugin wie 2.7.2: Label-Rückgabe, `window.confirm` als immer-wahrer Stub), 880 × 560, DE/EN × Dunkel/Hell, je einmal als Windows (`Win32`) und macOS | 4 × 22 Schritte grün: falsches Passwort (übersetzt, „Zurück“ gesperrt), Entsperren, Detail (Kürzel-Labels, Datumsformat in UI-Sprache bei abweichender OS-Locale), Anhang speichern (bereinigter Name), Kopierfehler, Löschen **Abbrechen ändert nichts**, Löschen OK, Papierkorb leeren (Abbrechen/OK), langer Titel, HOTP-Fehler, Einstellungen, Export (Abbrechen, Endung), Update-Dialog (Datum), Update-Fehler, Audit + HIBP-Fehler, Generator, Handbuch (Kürzel), keine unbekannten Commands. Layout-Prüfung (Seitenbreite, abgeschnittene Knöpfe, horizontale Scrollleisten, gequetschte Überschriften) ohne Befund nach den Fixes; Screenshots gesichtet |

### Nur auf echter Hardware prüfbar

- Win+V-/Cloud-Zwischenablage-Ausschluss und macOS-Clipboard-Manager (ConcealedType) mit echten Tools.
- Zwischenablage leeren bei `RunEvent::Exit` (⌘Q, Fenster schließen, Updater-Neustart).
- Native Dialoge mit eigenen Knöpfen (TaskDialog unter Windows, NSAlert unter macOS), Esc/X = Abbrechen.
- Echte Tauri-IPC mit async-Commands (Fenster bleibt während Argon2 bedienbar), Ruhezustand, OneDrive/AV-Sperren, UNC/USB-Pfade, WebView2-Kürzel mit deutscher Tastatur (AltGr), Drag & Drop in WebView2/WKWebView, Updater, Signatur/Notarisierung, SmartScreen.
- Purge-Sync mit zwei echten Geräten über einen Cloud-Ordner.

## 10. Runde 2 – Verifikation (unabhängige Zweitprüfung, 2026-10-20)

Basis: `cdc82cc`. Diff `863cb3e..cdc82cc` gezielt auf Regressionen (plattformübergreifend, async/Races)
gelesen, alle Prüfungen neu ausgeführt, L1–L13 an weiteren Stellen nachgeprüft.

### Nachgebessert

| Befund | Lösung |
|---|---|
| **Windows-Updater:** Der Installer-Schritt von `tauri-plugin-updater` beendet den Prozess unter Windows per `std::process::exit` (Quelle 2.10.1 geprüft). `RunEvent::Exit` feuert dort nie — ein kopiertes Secret blieb nach dem Update in der Zwischenablage (die Hilfe verspricht „spätestens beim Beenden“) | `install_update` lädt erst herunter (`download`), leert dann die Zwischenablage, wenn sie noch das Secret hält, und installiert danach (`install`). macOS: `app.restart()` aus dem async-Command feuert `Exit` regulär (Tauri 2.11.5 geprüft) |
| **settings.json konnte verloren gehen:** `load()`/`update()` behandelten *jeden* Lesefehler wie „fehlt/kaputt“ und schrieben sofort Defaults zurück. Unter Windows (Virenscanner, OneDrive, Freigabeverletzung) hätte ein kurzer Lesefehler Geräte-ID und Zuletzt-Liste endgültig überschrieben | Unterscheidung: fehlt oder ungültiges JSON/kein UTF-8 → durch Defaults ersetzen (wie bisher); sonst (gesperrt) unter Windows 5× mit 100 ms erneut lesen, danach mit Defaults weiterarbeiten, **Datei aber nicht anfassen**. Test mit einem nicht lesbaren Pfad |
| Ordner löschen und Papierkorb leeren: schlug der native Dialog selbst fehl, ging der Fehler als unbehandelte Promise verloren (L11) | Dialogaufruf innerhalb des try/catch → Toast |

### Neue Tests

- `state::purge_survives_persist_on_other_device`: Purge-Sync über die echte Datei — Gerät A leert den Papierkorb und speichert, Gerät B hält den Eintrag noch im Speicher und speichert etwas anderes darüber; der Eintrag kommt weder in B noch in der Datei zurück, ein drittes Öffnen sieht nur den inhaltsleeren Tombstone.
- `settings::settings_file_roundtrip_with_bom_and_garbage` erweitert um „fehlt“/„kaputt“ (ersetzbar) vs. „nicht lesbar“ (nicht überschreiben).

### Ausgeführt

| Prüfung | Ergebnis |
|---|---|
| `cargo test --workspace` | Core 49/49, App 12/12 |
| `cargo clippy --workspace --tests` | 0 Warnungen |
| `cargo check --target x86_64-pc-windows-msvc --workspace --tests` (vom Mac, Header-/Tool-Stubs, ohne Linken) | fehlerfrei (App-Crate nachweislich neu geprüft) |
| `cargo audit` | unverändert gegenüber §9 (zip 4.6.1 über den Updater, glib nur Linux, unmaintained-Hinweise) |
| `pnpm build`, `pnpm test` | fehlerfrei, 6/6 |
| Headless-Chromium-Lauf aus §9 (gemockte IPC, 880 × 560, DE/EN × Dunkel/Hell × Windows/macOS) nach den Änderungen | 4 × 22 Schritte grün; Abbrechen bei Löschen/Papierkorb ändert nichts, Knopf-Labels in UI-Sprache |
| L2-Sweep: alle Meldungs-Literale aus `src-tauri/src` und `core/src` (ohne Tests) durch `localizeError(…, 'en')` | keine deutsche Meldung in der EN-Ausgabe; unübersetzt bleiben nur englische Innentexte hinter übersetzten Präfixen und „state poisoned“ (nur nach einem Panic) |

### Bestätigt / nicht widerlegt

- L1: Plugin-JS 2.7.2 `confirm()` vergleicht das Ergebnis mit `okLabel`; Rust-Seite liefert bei `OkCancelCustom` das geklickte Label (unter Linux manuell gemappt), Esc/X → `Cancel`. Alle sechs Bestätigungen werden mit `await` und eigenen Labels aufgerufen; `dialog:default` enthält `allow-message`.
- L5: rfd setzt unter Windows `SetDefaultExtension` aus dem ersten Filter und fragt beim Überschreiben nach; `withExtension()` greift damit praktisch nur unter Linux (GTK), wo ein bereits vorhandenes `name.csv` ohne Rückfrage überschrieben werden könnte — bewusst so belassen.
- L6/L13/L7: wie in §9 beschrieben; Kürzel-Handler (`isModKey`) ist der einzige globale Tastatur-Handler.
- Lockfile: `arboard` war bereits als transitive Abhängigkeit vorhanden, es kommen keine neuen Pakete hinzu.
- Passwortwechsel ohne Session-Sperre: der Abschluss prüft Pfad **und** Schlüssel der Session; zwischenzeitliche Speicherungen (auch mit Merge) gehen in den Re-Key ein.

### Weiterhin nur auf echter Hardware prüfbar

Unverändert die Liste aus §9; zusätzlich: Zwischenablage nach einem Update unter Windows (NSIS und MSI) tatsächlich leer, und `settings.json` bleibt erhalten, wenn ein Virenscanner sie beim Start kurz sperrt.

## 11. Runde 3 (2026-10-20, abschließend)

Basis: `90eb259`. Schwerpunkt: jede Aussage in Hilfe (DE+EN), README und In-App-Texten gegen den
Code geprüft, End-to-End-Journeys inkl. Fehlerfällen, offene Punkte aus Runde 2.

### Falsche oder unvollständige Aussagen — korrigiert

| Aussage | Befund | Lösung |
|---|---|---|
| Hilfe „Einträge“: „Passwörter laufen beim Kopieren nie durchs UI“ | Benutzername/Passwort/TOTP kopiert Rust direkt aus dem Tresor, eigene Felder und Generator kommen aber aus der Ansicht (`copy_secret`); das Passwort liegt zudem für „Anzeigen“ ohnehin im UI | Text präzisiert (DE+EN) |
| Hilfe „Generator“: Passphrase „genauso stark“ | 5 Wörter (Standard) ≈ 65 Bit, 20 Zeichen aus 75 Zeichen ≈ 125 Bit | Bitwerte, Wortbereich 3–10, Länge 8–64 und die echte Liste verwechselbarer Zeichen (`Il1O0o5S`) genannt |
| Hilfe „Suche“: durchsucht „URLs“ | Es wurde nur die erste URL durchsucht (Listen-DTO enthielt nur `url`) | **Code:** `EntrySummary.urls`, Suche über alle URLs; Hilfe ergänzt: Suche findet auch Archiviertes |
| Hilfe „Import & Export“: „den Tresor als CSV exportieren, etwa für einen Umzug“ | Export enthält nur Ordner/Titel/Benutzer/Passwort/erste URL/Notizen/TOTP — eigene Felder (z. B. Kartennummern), weitere URLs, Tags, Anhänge, Verlauf fehlen still | Umfang in Hilfe, README, FORMAT.md §6a und **im Bestätigungsdialog des Exports** benannt |
| Plan-Text unlocked: „…, Passkeys — plus künftig …“ | Passkeys sind nicht implementiert (Seitenleiste „bald“) | Passkeys in die „künftig“-Liste verschoben (DE+EN) |
| Mindestlänge „8 Zeichen“ | Rust zählte Bytes (`len()`), UI UTF-16-Einheiten: 4 Emoji galten als 8 Zeichen, „äöü…“ als doppelt | Beide zählen Unicode-Codepoints (`chars().count()` / `[...pw].length`) |
| Hilfe „Sicherheit“: Auto-Sperre/Zwischenablage-Zeit | „0 = nie“ fehlte | ergänzt |
| Hilfe „Sync“ | Verhalten älterer Clients (vor 1.0) mit Purge-Tombstones fehlte | ergänzt (siehe Leftover unten) |
| README: „vollständige Testabdeckung“, Sync über „WebDAV“ | keine Coverage-Messung; WebDAV nur als eingebundenes Laufwerk (keypile spricht kein WebDAV) | Formulierung korrigiert |
| Hilfe „Tresor“: Verhalten bei Speicherfehlern | fehlte | ergänzt (Rollback, Formular bleibt, siehe unten) |

Geprüft und zutreffend (Code gelesen, teils per Test/UI): Argon2id 64 MiB/t=3/p=4 + AES-256-GCM,
Schlüsseldatei-Pflicht, Master-Passwortwechsel inkl. `.bak`, 10 Kategorien, 10 Feldtypen + Abschnitt,
Verlauf max. 10, Ordner mit „/“ und Löschen ohne Eintragsverlust, Audit ohne Archiv/Papierkorb,
Alters-Buckets 90/180/365/1095 Tage, schwach = zxcvbn-Score ≤ 2, HIBP 5 Hex-Zeichen + Padding + 20 s
Timeout, TOTP-Parameter/HOTP-Ablehnung/`%3D`, Anhänge ≤ 10 MB, UTF-8-Import mit/ohne BOM, Export mit BOM,
Standards 10 min / 30 s, Fokus-Sperre mit Dialog-Ausnahme, Ruhezustand-Prüfung, Update-Prüfung beim Start,
Kürzel ⌘/Strg C/B/T/U/E/N/F/G/,/L und ↑/↓, Hell/Dunkel inkl. Entsperr-Bildschirm.

### Behoben (Code)

| Befund | Lösung |
|---|---|
| **CSV-Formel-Injection** (Leftover R2) | Textzellen (Ordner, Titel, Benutzer, URL, Notizen), die mit `=` `+` `-` `@` Tab oder CR beginnen, bekommen ein `'`. Passwort/TOTP bleiben byte-genau — ein Präfix würde beim Umzug in einen anderen Manager falsche Secrets importieren (der Generator erzeugt selbst Passwörter mit `=+-@`). Der keypile-Import entfernt genau ein `'` vor einem dieser Zeichen. Test `export_guards_formula_cells_but_keeps_secrets_exact` |
| CSV-Import trimmte Passwörter (`"  pw "` → `"pw"`) → stiller Aussperr-Fall | Passwortspalte wird unverändert übernommen (Test s. o.) |
| **Fehlgeschlagenes Speichern ließ die Änderung im Speicher** (schreibgeschützter Ordner, Datenträger voll, gesperrte Datei): Das Formular blieb offen, erneutes „Speichern“ legte einen **neuen Eintrag doppelt** an; ebenso Import, neuer Ordner, Anhang | `with_session_tx`: Bei Fehler wird der Tresor im Speicher auf den Stand vor dem Befehl zurückgesetzt (Kopie danach gewipt) — Speicher = letzte gültige Datei, Wiederholen erzeugt keine Duplikate; extern zusammengeführte Änderungen werden beim nächsten Speichern erneut gemergt. Gilt für alle elf speichernden Commands (Eintrag speichern, löschen, wiederherstellen, endgültig löschen, Papierkorb leeren, archivieren, Anhang hinzufügen/entfernen, Ordner anlegen/löschen, Import). Ausnahme: Datei wurde anderswo neu verschlüsselt — dann liegt die Änderung in der Konflikt-Kopie und bleibt im Speicher, sonst würde der nächste Versuch die Kopie ohne sie überschreiben. Tests `failed_save_rolls_back_so_retry_creates_no_duplicate`, `foreign_key_conflict_is_not_rolled_back` |
| Datenträger voll: halb geschriebene `.v.keypile.tmp` blieb liegen; ein abgebrochenes Kopieren hinterließ eine **abgeschnittene `.bak`**, die wie eine gültige Sicherung aussah | Temp-Datei wird bei Schreibfehler entfernt; `.bak` mit falscher Länge wird gelöscht (eine intakte ältere `.bak` bleibt) |
| Datenträger voll beim CSV-Export / „Anhang speichern unter“: **unvollständige Klartextdatei blieb liegen** | `write_user_file`: bei Fehler nach dem Anlegen wird die Teildatei gelöscht; lässt sich das Ziel nicht öffnen (schreibgeschützt/gesperrt), bleibt es unangetastet. CSV-Puffer und Anhang-Bytes werden danach zeroized |
| Neuer Unterordner „Arbeit/Kunden“ blieb unsichtbar (Elternknoten zugeklappt) | Elternkette wird beim Anlegen aufgeklappt |
| Schlüsseldatei-Auswahl beim Master-Passwortwechsel: Abbrechen verwarf die vorige Auswahl, Dialogfehler gingen als unbehandelte Promise verloren (L11) | vorige Auswahl bleibt, Fehler → Toast |
| Tresorname ging ungefiltert in den Speichern-Dialog („Privat/Arbeit: Test“) (L5) | `safeFileName()` wie bei Anhängen |

### Leftover dokumentiert

- **Purge-Tombstones in Clients vor 1.0:** dort leere Einträge im Papierkorb; speichert ein alter
  Client, fällt `purged` weg (1.0 zeigt den Eintrag dann ebenfalls als leeren Papierkorb-Eintrag);
  leert er den Papierkorb, kann ein Gerät mit älterer Kopie den Eintrag zurückbringen. Anhand des
  0.3.2-Modells (`28fd8d2`, kein `purged`-Feld, serde ignoriert Unbekanntes) nachvollzogen. Hilfe
  (Sync, DE+EN), README, FORMAT.md §6.

### End-to-End-Journeys (ausgeführt)

Headless Chromium gegen den gemockten IPC (Mock wie in §9: Dialog-Plugin 2.7 mit Label-Rückgabe,
`window.confirm` als async-Stub, echte Backend-Meldungen; neu: Mock persistiert `settings.json` über
einen Reload = App-Neustart und spiegelt den Rollback bei Speicherfehlern), 880 × 560,
DE/EN × Windows (`Win32`, Strg)/macOS (⌘) × Dunkel/Hell, Erststart mit leerem Profil:

1. Erststart: Tutorial in Systemsprache (Backend-Default absichtlich andere Sprache), alle 7 Schritte → „Neustart“ (Reload): kein Tutorial, Sprache bleibt
2. Tresor anlegen: 6 Zeichen und 4 Emoji abgelehnt, Wiederholung falsch → Meldung, Speichern-Dialog **abgebrochen** → nichts angelegt, Formular nicht hängend; Pfad ohne Endung → `.keypile`, Umlaut-/Leerzeichen-Pfad
3. Neuer Login per Kürzel (Strg/⌘+N), zwei URLs, Passwort mit Leerzeichen
4. Suche über die zweite URL
5. Strg/⌘+C kopiert das Passwort über Rust; Windows: Strg+Alt (AltGr) löst kein Kürzel aus
6. Ordner „Arbeit/Kunden“: verschachtelt sichtbar, Löschen **abgebrochen** → bleibt, OK → weg
7. Generator per Kürzel, Passphrase, Kopieren über `copy_secret`
8. Anhang: Dialog **abgebrochen** → nichts; > 10 MB → übersetzte Meldung
9. Import per Strg/⌘+,: **abgebrochen** → nichts; kaputtes JSON → übersetzt; CSV → „3 importiert, 1 übersprungen“
10. Export: Warnung nennt den Umfang, **Abbrechen** öffnet keinen Speichern-Dialog
11. Master-Passwort: falsches aktuelles → übersetzt, kein Rekey; richtiges → Erfolg
12. Sperren mitten in der Bearbeitung (Strg/⌘+L) → gesperrt, nichts gespeichert, Entsperren, Änderung nicht vorhanden
13. Speichern schlägt fehl → übersetzte Meldung, Formular bleibt, zweites Speichern legt den Eintrag genau einmal an
14. Handbuch: DE und EN haben je 14 Abschnitte mit identischer Absatzzahl; Suche „Formel“/„formula“ findet „Import & Export“

Ergebnis: 4 Konfigurationen × 16 Schritte grün; zusätzlich der Lauf aus §9 (4 × 23 Schritte) grün.

Dateisystem-Fehlerfälle als Rust-Tests gegen echte Dateien:

| Test | Fall |
|---|---|
| `state::read_only_folder_fails_cleanly_and_recovers` | Ordner schreibgeschützt: Fehler „Speichern fehlgeschlagen“, Datei unverändert, keine Temp-Datei, Neustart sieht letzte gültige Version, nach Freigabe klappt Speichern |
| `state::stale_temp_file_from_crash_is_harmless` | Absturz zwischen Schreiben und Umbenennen (Temp-Datei bleibt): Öffnen und nächstes Speichern unbeeinträchtigt |
| `state::disk_full_keeps_last_good_version` (`#[ignore]`, mit `KEYPILE_FULL_DIR`) | **Datenträger voll** auf einem 2-MB-HFS+-Image (`hdiutil`): Fehler, keine Temp-Datei, letzte Version öffnet, nach Platz schaffen klappt Speichern — ausgeführt, grün |
| `commands::disk_full_export_leaves_no_partial_file` (`#[ignore]`) | Export auf vollen Datenträger: keine Teildatei — ausgeführt, grün |
| `commands::user_file_untouched_when_target_not_writable` | Export auf schreibgeschützte Zieldatei: Inhalt bleibt |
| `commands::failed_save_rolls_back_so_retry_creates_no_duplicate` | Rollback + Wiederholung ohne Duplikat |
| `commands::foreign_key_conflict_is_not_rolled_back` | anderswo neu verschlüsselt: zwei Änderungen landen beide in der Konflikt-Kopie |

### Ausgeführt

| Prüfung | Ergebnis |
|---|---|
| `cargo test --workspace` | Core 50/50, App 17/17 (+ 2 Disk-voll-Tests manuell mit Image, grün) |
| `cargo clippy --workspace --tests` | 0 Warnungen |
| `cargo check --target x86_64-pc-windows-msvc --workspace --tests` | fehlerfrei |
| `pnpm test`, `pnpm build` | 6/6, fehlerfrei |
| Headless-Chromium (Journeys oben + §9-Lauf) | grün |
| `cargo audit` | unverändert gegenüber §10: zip 4.6.1 (RUSTSEC-2026-0367/68/69, nur Updater-Entpacken signierter Pakete; Fix bräuchte ein Major-Update des Updater-Plugins), unmaintained-Hinweise |

Keine neuen Abhängigkeiten. Version bleibt 1.0.0.

### Nur auf echter Hardware prüfbar (zusätzlich zu §9/§10)

- „Gesperrte Datei“ unter Windows (OneDrive/Virenscanner hält die Datei länger als 2 s): Meldung
  „Speichern fehlgeschlagen“, Formular bleibt, erneutes Speichern ohne Duplikat.
- Datenträger voll / USB-Stick abgezogen während des Speicherns unter Windows (NTFS/exFAT) und macOS (APFS).
- Export-Bestätigung: der zweizeilige Text im nativen Dialog (TaskDialog/NSAlert) gut lesbar.
- CSV-Export in Excel/Numbers öffnen: Textzellen mit `'`-Präfix werden als Text angezeigt, keine Formel ausgeführt.
- Gemischter Betrieb 0.3.x/1.0 auf zwei Geräten (Purge-Tombstone-Verhalten wie dokumentiert).
