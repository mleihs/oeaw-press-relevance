#!/usr/bin/env bash
# Nightly SPECTER2 similarity refresh. Embeds new analyzed pubs (hash-idempotent:
# already-embedded pubs skip instantly via source_text_hash) and refreshes
# publications.press_similarity via the k-NN top-5 avg pipeline. On failure it
# mails the technical owner — the similarity signal is secondary, so this uses a
# plain SMTP mail-on-failure rather than a Sentry cron (the free plan's single
# cron monitor is claimed by the nightly ingest job).
set -uo pipefail
source /etc/oeaw-press-embeddings/env
export PROD_DB_URL_OVERRIDE

REPO=/srv/oeaw-press-relevance
PY="$REPO/scripts/embeddings/.venv/bin/python"

LOG=$(mktemp)
T0=$SECONDS
"$PY" -u "$REPO/scripts/embeddings/compute-embeddings.py" --scope=analyzed --target=prod >"$LOG" 2>&1
RC=$?
DUR=$(( SECONDS - T0 ))
TAIL=$(tail -c 1500 "$LOG"); rm -f "$LOG"

if [ "$RC" -eq 0 ]; then
  logger -t oeaw-press-embeddings "OK dur=${DUR}s"
  exit 0
fi

logger -t oeaw-press-embeddings "FAILED rc=$RC dur=${DUR}s"
if [ -n "${SMTP_URL:-}" ]; then
  printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSPECTER2 nightly embeddings FAILED (rc=%s, dur=%ss). Log tail:\r\n\r\n%s\r\n' \
      "$MAIL_FROM" "$MAIL_TO" "[OeAW Embeddings] Nightly SPECTER2 fehlgeschlagen ($(date -u +%F))" "$RC" "$DUR" "$TAIL" \
    | curl -s -m 30 --url "$SMTP_URL" --ssl-reqd \
        --mail-from "$MAIL_FROM" --mail-rcpt "$MAIL_TO" \
        --user "$SMTP_USER:$SMTP_PASS" --upload-file - \
    && logger -t oeaw-press-embeddings "alert mail sent to $MAIL_TO" \
    || logger -t oeaw-press-embeddings "alert mail to $MAIL_TO FAILED"
fi
exit "$RC"
