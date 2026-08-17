# Das `.keypile`-Tresorformat (Version 1)

Diese Spezifikation ist verbindlich und vollständig — sie ist die Grundlage für
den externen Format-Audit vor der öffentlichen Beta. Die Referenz-
Implementierung liegt in `core/` (Rust); sie ist die EINZIGE Implementierung
und wird nativ (Desktop) und als WASM (Browser) gebaut.

## 1. Container-Layout

Eine `.keypile`-Datei ist ein binärer Container:

| Offset | Größe | Inhalt |
|---|---|---|
| 0 | 8 | Magic: ASCII `KEYPILEV` |
| 8 | 2 | Formatversion, u16 little-endian (aktuell `1`) |
| 10 | 4 | Header-Länge `H`, u32 little-endian |
| 14 | H | Header-JSON, UTF-8 (unverschlüsselt) |
| 14+H | Rest | AES-256-GCM-Chiffretext ‖ 16-Byte-Auth-Tag |

Apps MÜSSEN eine Datei mit unbekanntem Magic ablehnen und bei einer
Formatversion größer als der eigenen einen Update-Hinweis zeigen (niemals
"falsches Passwort" melden).

## 2. Header-JSON

```json
{
  "kdf":   { "algo": "argon2id", "m_kib": 65536, "t": 3, "p": 4 },
  "salt":  "<base64, 16 Bytes>",
  "cipher": "aes-256-gcm",
  "nonce": "<base64, 12 Bytes>",
  "keyfile": false
}
```

- `kdf`: Argon2id-Parameter. Default: m=64 MiB, t=3, p=4 (OWASP-Empfehlung,
  ~250–500 ms auf aktueller Hardware). Pro Tresor gespeichert, damit spätere
  Anhebungen alte Tresore nicht brechen.
- `salt`: KDF-Salt, einmal bei Tresor-Erstellung erzeugt (CSPRNG). Wird beim
  Ändern des Master-Passworts neu erzeugt.
- `nonce`: GCM-Nonce. **Bei JEDEM Speichern frisch aus dem CSPRNG** — Nonce-
  Wiederverwendung wäre bei GCM katastrophal (Schlüssel-Rekonstruktion).
- `keyfile`: rein informativ (UI-Hinweis, dass eine Schlüsseldatei nötig ist).

## 3. Schlüsselableitung

```
pw_hash    = SHA-256(master_passwort_utf8)
kf_hash    = SHA-256(schlüsseldatei_bytes)          # nur wenn Schlüsseldatei
composite  = SHA-256(pw_hash ‖ kf_hash)             # bzw. SHA-256(pw_hash)
key        = Argon2id(composite, salt, m, t, p) → 32 Bytes
```

Die Schlüsseldatei geht in die *Ableitung* ein, nicht in ein Login-Gate —
ohne sie ist der Tresor kryptografisch nicht zu öffnen. Das Master-Passwort
verlässt das Gerät nie; nur `key` existiert im Speicher einer entsperrten
Sitzung (zeroized beim Sperren).

## 4. Verschlüsselung

- AES-256-GCM über das serialisierte Payload-JSON.
- **AAD = Bytes 0 … 14+H** (Magic, Version, Länge, Header-JSON). Dadurch ist
  der Klartext-Header authentifiziert: Wer KDF-Parameter abschwächt oder die
  Nonce manipuliert, bricht das Auth-Tag.
- Entschlüsselungsfehler sind nicht unterscheidbar zwischen "falsches
  Passwort" und "manipulierte Datei" — beides wird als ein Fehler gemeldet.

## 5. Payload-Schema (verschlüsselt)

JSON-Objekt:

```json
{
  "meta":    { "name": "…", "created": "<RFC3339>", "modified": "<RFC3339>", "generation": 42 },
  "folders": [ { "id": "<uuid>", "name": "…", "parent": null, "deleted": false, "vv": {} } ],
  "entries": [ <Entry> ]
}
```

Entry:

```json
{
  "id": "<uuid v4>",
  "folder": "<uuid|null>",
  "category": "login | card | identity | note | password | finance | license | travel | computer | misc",
  "title": "…", "username": "…", "password": "…",
  "urls": ["https://…"], "notes": "…", "tags": ["…"],
  "totp": "<base32 | otpauth://-URI | null>",
  "custom_fields": [ { "name": "…", "value": "…", "protected": true } ],
  "passkey": null,
  "attachments": [ { "id": "<uuid>", "name": "…", "data": "<base64>", "size": 1234 } ],
  "favorite": false,
  "archived": false,
  "created": "<RFC3339>", "modified": "<RFC3339>",
  "password_changed": "<RFC3339|null>",
  "history": [ { "password": "…", "replaced": "<RFC3339>" } ],
  "deleted": false, "deleted_at": null,
  "vv": { "<device_id>": 3 }
}
```

- `category` bestimmt Vorlage/Icon in der UI; unbekannte Werte werden als
  `misc` behandelt (Vorwärtskompatibilität ohne Versionssprung).
- `passkey` ist für WebAuthn-Credentials reserviert (Schema stabil, UI folgt).
- `attachments`: Dateien liegen base64-codiert IM verschlüsselten Payload
  (Implementierungen sollten die Größe begrenzen; Referenz-App: 10 MB).
- `archived` blendet Einträge aus der Hauptliste aus, ohne sie zu löschen.
- `history` ist auf 10 Einträge begrenzt (neueste zuerst).
- Alle in Version 1 nachgereichten Felder (`category`, `attachments`,
  `archived`) haben Defaults — ältere Dateien bleiben ohne Migration lesbar.
- Unbekannte Felder MÜSSEN beim Lesen erhalten und beim Schreiben
  zurückgeschrieben werden? — Nein: Version 1 definiert das Schema
  abschließend; neue Felder erfordern einen Versionssprung mit `#[serde(default)]`-
  Migration (Formatversion bleibt 1, solange alte Leser die Datei korrekt
  lesen können).

## 6. Sync & Merge (Versionsvektoren)

Jede Änderung an einem Eintrag inkrementiert `vv[device_id]` des ändernden
Geräts. Beim Zusammenführen zweier Replikate (z. B. Cloud-Ordner-Sync) gilt
pro Eintrag:

1. Nur in einem Replikat vorhanden → übernehmen.
2. Ein Versionsvektor dominiert (alle Komponenten ≥, mindestens eine >) →
   dominierende Version gewinnt. Das schließt Tombstones ein: ein
   dominierendes `deleted: true` löscht.
3. Nebenläufig (keiner dominiert) → **beide behalten**: lokale Version bleibt,
   entfernte wird als Konflikt-Kopie (`"<Titel> (Konflikt)"`, neue UUID)
   angefügt. Die Versionsvektoren werden vereinigt, damit der Konflikt beim
   nächsten Merge nicht erneut aufschlägt. Niemals stilles Überschreiben.

Gelöschte Einträge bleiben als Tombstone (`deleted: true`) im Tresor, bis der
Papierkorb geleert wird — sonst würden Löschungen beim Sync wiederauferstehen.

## 7. Speichern (Implementierungspflichten)

- Atomar: Temp-Datei im Zielverzeichnis, dann `rename()`. Vorher `.keypile.bak`
  der letzten Version anlegen.
- Vor dem Schreiben prüfen, ob die Datei auf der Festplatte seit dem letzten
  eigenen Lesen/Schreiben verändert wurde (Hash-Vergleich). Wenn ja: externe
  Version mit dem Sitzungsschlüssel öffnen, mergen (Abschnitt 6), Ergebnis
  schreiben. Schlägt das Entschlüsseln fehl (anderer Schlüssel): eigene
  Version als `"<Name> (Konflikt).keypile"` daneben speichern, nie überschreiben.

## 8. Sicherheitsanforderungen an Clients

- Master-Passwort und abgeleiteter Schlüssel: zeroize nach Gebrauch bzw. beim
  Sperren; kein Auslagern in Logs, Crash-Dumps, Telemetrie (keypile hat keine).
- Zwischenablage: kopierte Secrets nach konfigurierbarer Zeit (Default 30 s)
  löschen, sofern die Zwischenablage noch den kopierten Wert enthält.
- Auto-Lock nach Inaktivität (Default 10 min).
- Leak-Abgleich ausschließlich per k-Anonymity (HIBP-Range-API, 5-Zeichen-
  SHA-1-Präfix); niemals Passwort oder vollständigen Hash senden.
- Kein Netzwerkzugriff im Core; Netzwerk (nur HIBP) lebt in der App-Schicht.
