# keypile — Produkt- und Implementierungsplan

Passwortmanager ohne Entweder-oder: der lokale, dateibasierte Tresor von
KeePassXC plus der Überall-Zugriff von Vaultwarden — ohne dass Nutzer:innen
selbst einen Server betreiben müssen. Free bleibt dauerhaft kostenlos und
komplett offline nutzbar; **unlocked** (Preis/Start folgt zur Beta) ergänzt
Browser-Autofill, Geräte-Sync ohne Cloud-Laufwerk und sicheres Teilen.

Produktseite: https://lan-solo.com/de/tools/keypile/

## 1. Produktdefinition

### Pläne & Preise (fixiert, siehe Landing Page)

| | Free | unlocked (coming soon) |
|---|---|---|
| Preis | 0 € (dauerhaft) | noch offen, zur Beta |
| Tresor | lokal, unbegrenzte Einträge | alles aus Free |
| Sync | über eigenen Cloud-Speicher (Dropbox, Google Drive, iCloud Drive, WebDAV) | zusätzlich: E2E-Geräte-Sync ohne Cloud-Laufwerk |
| Autofill | — (manuelles Kopieren / Auto-Type) | Browser-Plugin (Chrome, Firefox, browse) |
| Teilen | — | einzelne Einträge, widerrufbar |
| Krypto | AES-256 + Argon2id, optional Schlüsseldatei/Hardware-Key | gleich |
| TOTP, Passkeys, Passwort-Check, Import/Export | ✓ | ✓ |

### Harte Randbedingungen (ehrlich einplanen!)

- **Vault-Format zuerst, Code danach.** Das Format ist das Produkt — einmal
  Nutzer:innen-Daten drin, ist Migration teuer und riskant. Es wird
  spezifiziert, dokumentiert und extern geprüft, bevor eine Beta öffentlich
  wird (siehe Disclaimer auf der Produktseite).
- **Free-Sync über fremde Clouds heißt: kein eigener Server, aber auch keine
  Kontrolle über Konsistenz.** Merge-Konflikte (zwei Geräte ändern denselben
  Eintrag offline) müssen im Client gelöst werden — klassisches CRDT- oder
  Versionsvektor-Problem, nicht wegdiskutierbar.
- **Autofill ist der gefährlichste Teil der Angriffsfläche.** Phishing-Schutz
  (Origin-Bindung, keine URL-Substring-Matches) ist nicht optional, auch wenn
  er UX kostet.
- **Free ist keine Testversion.** Der lokale Tresor bleibt für immer
  vollständig nutzbar — das schließt Feature-Verstümmelung zur
  Kaufmotivation aus, unlocked muss über echten Zusatznutzen verkaufen
  (Autofill, Sync-Komfort, Teilen), nicht über künstliche Limits in Free.

## 2. Feature-Parität — was von KeePassXC und Vaultwarden übernommen wird

### Von KeePassXC (lokaler Tresor, Power-User-Werkzeuge)

- Ein Tresor = eine verschlüsselte Datei; keine Server-Abhängigkeit für die
  Grundfunktion
- Auto-Type (Zugangsdaten per simuliertem Tastatur-Input in Fremdanwendungen)
- TOTP-Generierung direkt aus dem Eintrag
- Anhänge (Notizen, Dateien) pro Eintrag
- SSH-Agent-Integration
- CLI für Skripte/Automatisierung
- Import: KeePass (`.kdbx`), CSV

### Von Vaultwarden (Überall-Zugriff, ohne den Server-Betrieb, den Vaultwarden voraussetzt)

- Ein Tresor-Stand auf allen Geräten
- Browser-Autofill (Login erkennen, ausfüllen, neue Logins anbieten zu
  speichern)
- Geteilte Einträge (Familie/Team), mit Widerruf
- Passkey-Speicherung
- Import: Bitwarden/Vaultwarden-Export

### Bewusst nicht übernommen

- Kein Server, den Nutzer:innen selbst hosten und patchen müssen (das ist der
  Vaultwarden-Kompromiss, den keypile auflöst)
- Keine Organisations-/Admin-Konsole in Free — das ist ein Enterprise-Problem,
  kein Privatnutzer-Problem

## 3. Architektur

### Tresor-Format (`.keypile`)

- Container-Format analog KDBX: verschlüsselter Blob + unverschlüsselter
  Header (Format-Version, KDF-Parameter, Salt) — Format-Version von Anfang an
  im Header, damit spätere Migrationen möglich sind, ohne alte Tresore zu
  brechen
- Schlüsselableitung: **Argon2id** aus dem Master-Passwort (+ optional
  Schlüsseldatei/Hardware-Key als zweiter Faktor der Ableitung, nicht nur als
  Login-Gate)
- Verschlüsselung: **AES-256-GCM** (authentifiziert — verhindert stille
  Manipulation am Tresor)
- Eintragsstruktur inklusive Metadaten (Icons, Tags, Ordner, Anhänge,
  TOTP-Secrets, Passkeys) in einem dokumentierten Schema, nicht proprietär
  verschleiert — Grundlage für den externen Format-Audit

### Komponenten

- **Core (Rust):** Tresor-Engine (Format, Krypto, Merge-Logik), als Bibliothek
  gebaut — eine Implementierung, kein Format-Drift zwischen Plattformen.
  Kompiliert nativ für Desktop-Apps und zu WASM für Browser-Erweiterung/Web.
- **Desktop-Apps (macOS, Windows, Linux):** Tauri (Rust-Core + Web-UI) — kleine
  Binaries, kein Electron-Overhead, Core wird direkt eingebunden statt über
  IPC dupliziert
- **Browser-Plugin (unlocked):** Core als WASM, Autofill-Content-Script mit
  strikter Origin-Bindung; in `browse` läuft dasselbe Plugin ohne
  Extension-Speichergrenzen (siehe [[browse]])
- **Sync-Adapter:**
  - Free: Cloud-Speicher-Adapter (Dropbox/Google Drive/iCloud Drive/WebDAV-
    API), lädt/lädt hoch nur den verschlüsselten Blob — der Anbieter sieht
    ausschließlich Chiffretext
  - unlocked: eigener Relay-Dienst (kein Vault-Klartext, nur verschlüsselte
    Deltas — gleiches Zero-Knowledge-Prinzip wie [[secrets]])
- **Merge-Strategie:** Versionsvektor pro Eintrag; Konflikte (paralleles
  Editieren offline) landen als beide Versionen im Tresor zur manuellen
  Auflösung — nie stilles Datenverlust-Overwrite

### Warum Rust-Core statt Sprache pro Plattform

Ein Tresor-Format mit mehreren unabhängigen Implementierungen (Swift für
macOS, C# für Windows, TS für den Browser …) driftet garantiert auseinander —
genau das Risiko, das ein Format-Audit eigentlich ausschließen soll. Ein
Rust-Core, der nativ UND zu WASM kompiliert, hält Format und Krypto an exakt
einer Stelle.

## 4. Sicherheitskonzept

- **Zero-Knowledge wie bei [[secrets]] und [[all-backed]]:** Ver-/Entschlüsselung
  passiert ausschließlich lokal; weder ein Cloud-Anbieter noch ein eigener
  Relay-Server sehen jemals Klartext oder das Master-Passwort
- **Master-Passwort verlässt das Gerät nie** — auch nicht gehasht; nur
  abgeleitete Schlüssel existieren im Speicher, und auch nur während einer
  entsperrten Sitzung
- **Passwort-Check/Leak-Abgleich mit k-Anonymity** (wie Have I Been Pwned):
  nur ein Hash-Präfix verlässt das Gerät, nie das volle Passwort oder dessen
  vollständiger Hash
- **Autofill-Phishing-Schutz:** Zugangsdaten werden ausschließlich für die
  exakte, gespeicherte Origin angeboten — keine Subdomain-/Substring-Heuristik
  ohne explizite Nutzerfreigabe
- **Kein Beta-Start vor externem Audit** von Tresor-Format und
  Kryptografie-Implementierung — steht so auch auf der Produktseite und ist
  bindend für den Zeitplan, nicht nur Marketing-Text

## 5. Roadmap

- **Phase 0 — Format & Core: ✅ umgesetzt (08/2026).** `.keypile`-Spezifikation
  in `FORMAT.md`, Rust-Core in `core/` (Argon2id, AES-256-GCM mit
  authentifiziertem Header, Versionsvektor-Merge, TOTP inkl. RFC-6238-
  Testvektoren, Generator, Import/Export) mit Testabdeckung
- **Phase 1 — Desktop Free: ✅ Alpha umgesetzt (08/2026).** Tauri-App mit
  Tresor-UI, TOTP, Passwort-Check (zxcvbn + HIBP-k-Anonymity), Import
  (CSV/Bitwarden-JSON), Sync über beliebige Cloud-Sync-Ordner mit
  automatischem Merge externer Änderungen. CI baut macOS/Windows/Linux-
  Bundles. Noch offen aus Phase 1: Auto-Type, KDBX-Direktimport,
  dedizierte Cloud-API-Adapter (WebDAV & Co.), SSH-Agent, CLI
- **Phase 2 — Externer Audit & Beta:** unabhängiges Audit von Format +
  Kryptografie, öffentliche Spezifikation, öffentliche Beta von Free
- **Phase 3 — unlocked:** Browser-Plugin (Autofill, WASM-Core), E2E-Relay-Sync
  ohne Cloud-Laufwerk, sicheres Teilen einzelner Einträge, mobile Apps
  (iOS/Android)
- **Phase 4 — browse-Integration:** keypile-Plugin fest in `browse` eingebaut
  statt als normale Extension (kein Storage-Limit, Autofill mit
  Browserprofil-Entsperrung), analog zur all-backed-Integration

## 6. Bezug zur Website (dieses Repo)

Die Produktseite (`webpage`-Repo, `app/[lang]/tools/keypile/`) beschreibt
Features und Preise verbindlich — Architekturentscheidungen hier müssen dazu
passen, nicht umgekehrt. Wortmarke `keypile.` folgt `STYLEGUIDE.md` im
Website-Repo.
