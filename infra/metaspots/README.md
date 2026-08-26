# metaspots — Ops-Dateien des Nacht-Betriebs

Kopien der Skripte und systemd-Units, die auf dem VPS **metaspots** den nächtlichen
Betrieb fahren. Bis zum 2026-08-26 existierten sie ausschließlich auf der Box: kein
Diff, keine Historie, kein Review. Sichtbar wurde der Preis in der Nacht auf den
22.08., als eine stille Änderung in der Alarm-Kette dazu führte, dass ausgerechnet
beim einzigen echten Fehler kein Sentry-Event entstand — und niemand nachsehen
konnte, was dort eigentlich lief.

**Dieses Verzeichnis deployt nichts.** Es ist die versionierte Wahrheit; das
Ausrollen bleibt ein bewusster, manueller Schritt.

## Inhalt

| Repo | auf der Box | Zweck |
|------|-------------|-------|
| `bin/oeaw-press-ingest.sh` | `/usr/local/bin/` | Trigger für `POST /api/ingest/run` + Alarm-Kette (Sentry-Check-in, Sentry-Event, Mail an websites@) |
| `bin/oeaw-press-embeddings.sh` | `/usr/local/bin/` | SPECTER2-Ähnlichkeits-Embeddings |
| `sbin/archive-oeaw-exports.sh` | `/usr/local/sbin/` | archiviert die OeAW-Rohexporte gzip-komprimiert, **bevor** der Ingest sie anwendet (90 Tage) |
| `sbin/backup-oeaw-db.sh` | `/usr/local/sbin/` | nächtliches lokales `pg_dump` |
| `sbin/mirror-oeaw-db-to-cloud.sh` | `/usr/local/sbin/` | Spiegel auf den Cloud-Warm-Standby |
| `systemd/*.service`, `systemd/*.timer` | `/etc/systemd/system/` | die zugehörigen Units |

Zeitplan (Europe/Vienna): 02:35 UTC Backup · 03:30 UTC Cloud-Spiegel · 06:15 Archiv ·
06:30 Ingest · 07:00 Embeddings. Der Ingest liegt bewusst 30 min hinter dem
04:00-UTC-Reboot der unattended-upgrades.

## Secrets

Keine. Alle Zugangsdaten kommen aus `EnvironmentFile`s bzw. `source`-Dateien, die
**nur** auf der Box liegen und hier bewusst fehlen:

- `/etc/oeaw-press-ingest/env` — `INGEST_CRON_SECRET`, `INGEST_URL`, `INGEST_RESOLVE`,
  Sentry-DSN-Bestandteile, SMTP-Zugang
- `/etc/oeaw-press-embeddings/env`

Vor jedem Commit hier gilt: die Dateien tragen Variablenreferenzen, niemals Literale.

## Abgleich

`sync-check.sh` vergleicht Repo und Box byteweise. Ohne ihn ist dieses Verzeichnis
nur ein Schnappschuss, der beim ersten Hotfix auf der Box unbemerkt falsch wird.

```bash
bash infra/metaspots/sync-check.sh          # prüfen, Exit 1 bei Drift
bash infra/metaspots/sync-check.sh --pull   # Box gewinnt, Repo nachziehen
```

Host über `METASPOTS_SSH_HOST` überschreibbar (Default: `metaspots`).

## Ausrollen

Die Box ist die laufende Instanz, deshalb immer erst sichern, dann ersetzen, dann
verifizieren:

```bash
# Skript
scp infra/metaspots/bin/oeaw-press-ingest.sh metaspots:/tmp/x.sh
ssh metaspots 'cp -a /usr/local/bin/oeaw-press-ingest.sh /usr/local/bin/oeaw-press-ingest.sh.bak-$(date +%F) \
  && install -m 755 /tmp/x.sh /usr/local/bin/oeaw-press-ingest.sh \
  && rm -f /tmp/x.sh && bash -n /usr/local/bin/oeaw-press-ingest.sh'

# Unit (systemd muss nachladen, sonst laeuft die alte Definition weiter)
scp infra/metaspots/systemd/oeaw-press-ingest.timer metaspots:/etc/systemd/system/
ssh metaspots 'systemctl daemon-reload && systemctl restart oeaw-press-ingest.timer'

# beweisen, dass es laeuft -- nicht nur, dass die Datei liegt
ssh metaspots 'systemctl start oeaw-press-ingest.service; sleep 5; \
  journalctl -u oeaw-press-ingest.service --since "-2 min" --no-pager | tail -5'
bash infra/metaspots/sync-check.sh
```

Ein manueller Lauf ist ungefährlich: beide Feeds sind über
`(feed, generated_at_timestamp)` idempotent, ein zweiter Lauf am selben Tag endet
in `skipped`.

Fachlicher Ablauf und Alarm-Semantik stehen in [`docs/NIGHTLY_OPS.md`](../../docs/NIGHTLY_OPS.md).
