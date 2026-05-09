#!/usr/bin/env bash
# Chunked restart loop for compute-embeddings.py — sidesteps the PyTorch CPU
# memory leak by exiting after N pubs and starting a fresh process. The
# Python script's source_text_hash check guarantees no duplicate work.
#
# Usage:
#   scripts/embeddings/run-chunked.sh [chunk_size]
#
# Env:
#   TARGET=local|prod  (passed through to --target)
#
# Exits when DB has embeddings for every eligible pub, or after MAX_ATTEMPTS.

set -u

CHUNK="${1:-400}"
TARGET="${TARGET:-local}"
MAX_ATTEMPTS=40
PSQL_LOCAL="postgres://postgres:postgres@127.0.0.1:54422/postgres"

count_remaining() {
  local url
  if [ "$TARGET" = "prod" ]; then
    url=$(grep '^PROD_DB_URL_POOLER=' "$HOME/.config/oeaw-press-release/prod-credentials" | cut -d= -f2-)
  else
    url="$PSQL_LOCAL"
  fi
  psql "$url" -At <<'SQL'
WITH eligible AS (
  SELECT p.id
  FROM publications p
  WHERE COALESCE(p.title,'') <> ''
    AND (p.press_score IS NOT NULL
         OR EXISTS (SELECT 1 FROM press_releases pr WHERE pr.publication_id = p.id))
)
SELECT COUNT(*) FROM eligible e
LEFT JOIN publication_embeddings pe ON pe.publication_id = e.id AND pe.model = 'allenai/specter2_base'
WHERE pe.publication_id IS NULL;
SQL
}

cd "$(dirname "$0")/../.."
PY="scripts/embeddings/.venv/bin/python"

for attempt in $(seq 1 $MAX_ATTEMPTS); do
  remaining=$(count_remaining)
  echo "[loop ] attempt=$attempt/$MAX_ATTEMPTS remaining=$remaining"
  if [ "$remaining" -le 0 ]; then
    echo "[loop ] all done."
    break
  fi
  $PY -u scripts/embeddings/compute-embeddings.py --scope=analyzed --target=$TARGET --max-pubs=$CHUNK --no-refresh 2>&1
  rc=$?
  echo "[loop ] python rc=$rc"
  # rc 137 = OOM-kill. Continue regardless.
  sleep 2
done

# Final pass: refresh centroid + similarity
echo "[loop ] final refresh_embedding_pipeline..."
if [ "$TARGET" = "prod" ]; then
  url=$(grep '^PROD_DB_URL_POOLER=' "$HOME/.config/oeaw-press-release/prod-credentials" | cut -d= -f2-)
else
  url="$PSQL_LOCAL"
fi
psql "$url" -c "SELECT * FROM refresh_embedding_pipeline('allenai/specter2_base')"

echo "[loop ] done."
