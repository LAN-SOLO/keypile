# keypile

Passwortmanager, der KeePassXC (lokaler, dateibasierter Tresor) und Vaultwarden
(Sync/Autofill auf allen Geräten) in einem Tool vereint. Free-Tier: kompletter
lokaler Tresor inklusive Sync über den eigenen Cloud-Speicher (Dropbox, Google
Drive, iCloud Drive, WebDAV) — kein Konto, kein Server nötig. **unlocked**
(coming soon): Browser-Plugin mit Autofill, Ende-zu-Ende-verschlüsselter
Geräte-Sync ohne eigenes Cloud-Laufwerk, sicheres Teilen.

Produktseite: https://lan-solo.com/de/tools/keypile/ · Plan: `KEYPILE_PLAN.md`
· Tresorformat: `FORMAT.md`

## Status

**Phase 1 — Desktop Free (Alpha).** Rust-Core (`core/`) mit vollständiger
Testabdeckung für Format, Krypto, Merge und TOTP; Tauri-Desktop-App
(`src-tauri/` + `src/`) mit Tresor-UI, Generator, Passwort-Check und
Import/Export. **Noch kein externer Audit — nicht für echte Passwörter
verwenden**, siehe Disclaimer auf der Produktseite.

### Features (implementiert, Stand v0.2)

- Verschlüsselter Datei-Tresor: Argon2id (64 MiB, t=3, p=4) + AES-256-GCM,
  authentifizierter Header, optionale Schlüsseldatei als zweiter Faktor
- 10 Kategorien mit Vorlagen (Login, Kreditkarte, Identität, Notiz, Finanzen,
  Lizenz, Reise, Computer …), eigene Felder, Passwort-Historie, Favoriten,
  Archiv, Papierkorb
- TOTP-Generator (RFC 6238, Base32 oder otpauth://-URIs) — unlocked-Feature,
  in der Alpha frei
- Verschlüsselte Datei-Anhänge im Tresor (max. 10 MB) — unlocked-Feature
- Audit-Dashboard: geleakt (HIBP), schwach, identisch, Passwort-Alter,
  2FA-Abdeckung — Basis-Checks in Free, volles Audit unlocked
- In-App-Updater: signierte Updates von GitHub Releases, Installation per
  Klick, Tresor bleibt unberührt
- Passwort-/Passphrasen-Generator (EFF-Wortliste, 7776 Wörter)
- Passwort-Check: schwach (zxcvbn), wiederverwendet, alt, geleakt
  (Have-I-Been-Pwned per k-Anonymity — nur 5 Hash-Zeichen verlassen das Gerät)
- Import: CSV (Chrome, KeePassXC, LastPass, Bitwarden, 1Password) und
  Bitwarden-JSON; Export: CSV (mit Warnung)
- Cloud-Sync über beliebige Sync-Ordner: externe Änderungen an der
  Tresor-Datei werden per Versionsvektor-Merge zusammengeführt — Konflikte
  landen als Kopien im Tresor, nie stiller Datenverlust
- Auto-Lock, Sperren bei Fokusverlust, Zwischenablage-Auto-Clear,
  Master-Passwort-Wechsel, DE/EN

## Entwicklung

Voraussetzungen: Rust (stable), Node 22, pnpm.

```sh
pnpm install
pnpm exec tauri dev      # Dev-App
cargo test -p keypile-core   # Core-Tests (Format/Krypto/Merge/TOTP/Import)
pnpm exec tauri build    # Release-Bundles (macOS: .app + .dmg)
```

Windows (`.msi`/`.exe`) und Linux (`.deb`/`.rpm`/`.AppImage`) baut die CI:
`.github/workflows/build.yml` läuft bei Tags (`v*`) und manuell
(workflow_dispatch) und lädt die Bundles als Artefakte hoch; bei Tags entsteht
ein Draft-Release.

## Architektur

- `core/` — **keypile-core**: Tresorformat, Krypto, Merge, TOTP, Generator,
  Import/Export. Kein Netzwerkzugriff, keine UI-Abhängigkeiten; kompiliert
  nativ und (später) zu WASM. Die einzige Format-Implementierung.
- `src-tauri/` — Desktop-App-Schicht: Sitzung/Schlüssel-Handling (zeroized),
  atomares Speichern mit externem Change-Merge, HIBP-Abfrage, Zwischenablage,
  Einstellungen.
- `src/` — React-UI (Vite, TypeScript), dunkles LAN-SOLO-Theme, DE/EN.

## Verwandte Repositories

- [webpage](https://github.com/LAN-SOLO/webpage) — lan-solo.com inkl. Landing Page (`/[lang]/tools/keypile/`)
- [browse](https://github.com/LAN-SOLO/browse) — eigener Browser, keypile-Plugin dort später fest eingebaut
- [all-backed](https://github.com/LAN-SOLO/all-backed) — Backup-Tool, gleiches Zero-Knowledge-Prinzip
- [secrets](https://github.com/LAN-SOLO/secrets) — Zero-Knowledge-Secret-Sharing
