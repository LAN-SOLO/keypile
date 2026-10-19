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
- Papierkorb leeren / endgültig löschen entfernt den Tombstone. Hat ein anderes Gerät den Eintrag
  noch, taucht er beim nächsten Sync wieder auf (kein Datenverlust, aber keine Lösch-Synchronisation).
- CSV-Export ist Klartext und wird nicht gegen Formel-Injection in Tabellenprogrammen entschärft
  (ein Präfix würde Passwörter verfälschen, die mit `=`, `+`, `-` oder `@` beginnen).
- Import erwartet UTF-8; UTF-16- oder ANSI-CSV wird mit klarer Meldung abgelehnt.
- Schlüsseldateien werden vollständig eingelesen (keine Größenbegrenzung, wie KeePassXC).
- Zeroize ist best effort: Kopien in WebView/JS-Heap (z. B. angezeigte Passwörter) kontrolliert die App nicht.
- Beendet man die App vor Ablauf des Zwischenablage-Timers, bleibt das Secret in der Zwischenablage.
- Native Bestätigungsdialoge zeigen die Knopfbeschriftung des Betriebssystems.

## 6. Manuelle Testliste

### macOS (arm64 und Intel, DMG aus CI)

- [ ] DMG öffnet ohne Gatekeeper-Warnung (signiert + notarisiert), App startet, Version in Einstellungen = 1.0.0
- [ ] Erster Start: Tutorial erscheint, Sprache entspricht der Systemsprache
- [ ] Tresor anlegen in iCloud Drive; mit Schlüsseldatei anlegen; schließen, erneut öffnen
- [ ] Falsches Passwort → verständliche Meldung; Schlüsseldatei vergessen → gleiche Meldung
- [ ] Login-Eintrag mit TOTP; Code stimmt mit einer Authenticator-App überein
- [ ] ⌘C/⌘B/⌘T kopieren; nach 30 s ist die Zwischenablage leer; Sperren (⌘L) leert sie sofort
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
- [ ] Zwischenablage-Auto-Clear und Löschen beim Sperren (Win+V-Verlauf beachten)
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
