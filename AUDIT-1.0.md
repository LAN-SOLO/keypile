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
- CSV-Export ist Klartext und wird nicht gegen Formel-Injection in Tabellenprogrammen entschärft
  (ein Präfix würde Passwörter verfälschen, die mit `=`, `+`, `-` oder `@` beginnen).
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
