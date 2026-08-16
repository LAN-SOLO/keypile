# keypile

Passwortmanager, der KeePassXC (lokaler, dateibasierter Tresor) und Vaultwarden
(Sync/Autofill auf allen Geräten) in einem Tool vereint. Free-Tier: kompletter
lokaler Tresor inklusive Sync über den eigenen Cloud-Speicher (Dropbox, Google
Drive, iCloud Drive, WebDAV) — kein Konto, kein Server nötig. **unlocked**
(coming soon): Browser-Plugin mit Autofill, Ende-zu-Ende-verschlüsselter
Geräte-Sync ohne eigenes Cloud-Laufwerk, sicheres Teilen.

Produktseite: https://lan-solo.com/de/tools/keypile/ · Plan: `KEYPILE_PLAN.md`
(Produktdefinition, Architektur, Sicherheitskonzept, Roadmap).

## Status

**Planungsphase.** Noch kein Code — `KEYPILE_PLAN.md` legt Format, Kryptografie
und Architektur fest, bevor implementiert wird. Ein Passwortmanager bekommt
keine halben Sachen: Tresor-Format und Verschlüsselung werden dokumentiert und
extern geprüft, bevor es eine Beta gibt (siehe Disclaimer auf der Produktseite).

## Verwandte Repositories

- [webpage](https://github.com/LAN-SOLO/webpage) — lan-solo.com inkl. Landing Page (`/[lang]/tools/keypile/`)
- [browse](https://github.com/LAN-SOLO/browse) — eigener Browser, keypile-Plugin dort später fest eingebaut
- [all-backed](https://github.com/LAN-SOLO/all-backed) — Backup-Tool, gleiches Zero-Knowledge-Prinzip
- [secrets](https://github.com/LAN-SOLO/secrets) — Zero-Knowledge-Secret-Sharing
