#!/usr/bin/env bash
# Nightly local backup of the OEAW self-hosted Supabase Postgres (all app data:
# public schema incl. board/publications/events + auth users).
#
# Same pattern and rationale as backup-coolify-db.sh: plain SQL via pg_dump,
# gzip, size + integrity guards, 14-day retention. Restore = psql into a fresh
# supabase-db (plain SQL is version-tolerant, unlike -Fc archives; see the
# 17-vs-15 pg_restore gotcha in metaspots-infra SYSTEM-STATE §4.4).
# Off-box: /data/coolify/backups is synced nightly to OneDrive by
# offbox-sync-backups.timer (03:10 UTC) — this dump rides along.
#
# Run by oeaw-db-backup.timer (02:35 UTC — after coolify 02:30, before
# lego-renew 02:40 / mainwp 02:50 / offbox-sync 03:10).
set -euo pipefail

BACKUP_DIR=/data/coolify/backups
CONTAINER_FILTER=supabase-db-tqx28to7wuerbt8hnfn2zdlm
RETENTION_DAYS=14

CID=$(docker ps -q --filter name="$CONTAINER_FILTER" | head -1)
if [ -z "$CID" ]; then
  echo "oeaw-db-backup: no running container matching $CONTAINER_FILTER" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/oeaw-$(date +%F).sql.gz"

# pipefail is load-bearing: pg_dump can fail mid-stream while gzip still exits 0.
docker exec "$CID" pg_dump -U postgres --clean --if-exists postgres | gzip > "$out"

# A gzip-of-nothing is ~20 bytes; the real dump is tens of MB. Fail loud.
size=$(stat -c%s "$out")
if [ "$size" -lt 1000000 ]; then
  echo "oeaw-db-backup: dump $out is suspiciously small ($size bytes), removing" >&2
  rm -f "$out"
  exit 1
fi

gzip -t "$out"

find "$BACKUP_DIR" -name "oeaw-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "oeaw-db-backup: wrote $out ($size bytes)"
