#!/usr/bin/env bash
# Nightly mirror of the OEAW self-hosted Supabase DB (public schema) into the
# old cloud Supabase project — a queryable warm-standby copy on top of the
# dump backups ("2. Backup", user request 2026-07-07).
#
# Scope is --schema=public on purpose (same as the 2026-07-06 migration dump):
# app data incl. board/publications/events. The auth/storage schemas of a
# MANAGED Supabase are owned by supabase-internal roles and cannot be restored
# into from outside; cloud auth keeps its own (stale) users, which is fine for
# a data backup. Cloud project is API-egress-blocked (402) but the Postgres
# pooler port works — reads/writes via psql are unaffected.
#
# Mechanics: pg_dump | psql inside the supabase-db container (has psql 17 +
# egress; the VPS host has no psql). --clean --if-exists rebuilds the schema;
# ON_ERROR_STOP=0 tolerates managed-cloud permission noise (event triggers,
# grants). Row-count parity for key tables is verified afterwards — THAT is
# the success signal, not psql's exit code.
#
# Run by oeaw-db-mirror.timer (03:30 UTC — after the 02:35 dump and the 03:10
# off-box sync). Cloud conn string: /root/.config/metaspots/oeaw-cloud-db.url
# (chmod 600; session pooler aws-1-eu-west-3, sslmode=require).
set -uo pipefail

CONTAINER_FILTER=supabase-db-tqx28to7wuerbt8hnfn2zdlm
CLOUD_URL=$(cat /root/.config/metaspots/oeaw-cloud-db.url)

CID=$(docker ps -q --filter name="$CONTAINER_FILTER" | head -1)
if [ -z "$CID" ]; then
  echo "oeaw-db-mirror: no running container matching $CONTAINER_FILTER" >&2
  exit 1
fi

docker exec -e CLOUD_URL="$CLOUD_URL" "$CID" sh -c \
  'pg_dump -U postgres --schema=public --clean --if-exists postgres | psql "$CLOUD_URL" -q -v ON_ERROR_STOP=0' \
  > /tmp/oeaw-db-mirror.log 2>&1 || true

# Success signal: row-count parity on key tables (app data actually arrived).
FAIL=0
for t in publications events press_releases boards cards card_attachments users; do
  src=$(docker exec "$CID" psql -U postgres -tAc "SELECT count(*) FROM public.$t" postgres)
  dst=$(docker exec -e CLOUD_URL="$CLOUD_URL" -e T="$t" "$CID" sh -c 'psql "$CLOUD_URL" -tAc "SELECT count(*) FROM public.$T"')
  if [ "$src" != "$dst" ]; then
    echo "oeaw-db-mirror: MISMATCH $t src=$src cloud=$dst" >&2
    FAIL=1
  else
    echo "oeaw-db-mirror: $t ok ($src)"
  fi
done
if [ "$FAIL" -ne 0 ]; then
  echo "oeaw-db-mirror: restore log tail:" >&2
  tail -20 /tmp/oeaw-db-mirror.log >&2
  exit 1
fi
echo "oeaw-db-mirror: cloud standby in sync"
