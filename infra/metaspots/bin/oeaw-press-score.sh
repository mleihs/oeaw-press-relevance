#!/usr/bin/env bash
# Nachtbewertung (lib/server/scoring/, ab 2026-10-28): bewertet nach dem Ingest
# die neuen Publikationen und Events. Kein eigener Timer: der Ingest-Wrapper
# startet diese Unit (`systemctl start --no-block oeaw-press-score.service`)
# und legt dabei seinen Sentry-Check-in in /run/oeaw-press/checkin-id ab. Diese
# Datei schliesst ihn, sobald die Bewertung fertig ist; der eine Sentry-Monitor
# (Free-Plan) ueberwacht so Ingest UND Bewertung. Fehlt die Datei (Handstart),
# oeffnet der Wrapper einen eigenen Check-in.
#
# Ablauf: POST /api/scoring/run (202 mit den Journal-ids, der Lauf rechnet in
# der App weiter), dann alle 30 s GET /api/scoring/runs/<id>, bis keine Zeile
# mehr `running` steht. Die App geht dabei ueber die Message Batches API von
# Anthropic (halber Preis, Minuten Wartezeit je Runde) und wartet hoechstens
# BATCH_DEADLINE_MINUTES (300); der Poll laesst etwas Luft darueber.
#
# Alarm wie beim Ingest: nur ein `failed` ist ein Fehler (Check-in error,
# Sentry-Event, Mail an das Team). `partial` (Deckel, verworfene Haikus,
# Lektorat-Hinweise) und `skipped` schliessen ok; die Einzelheiten stehen im
# Journal (`npm run scoring-run -- --target=prod --report-latest`).
#
# Danach die Embeddings: sobald etwas bewertet wurde, startet dieser Wrapper
# oeaw-press-embeddings.service, damit SPECTER2 und press_similarity die
# Nachtkohorte am selben Morgen aufnehmen (hash-idempotent, ein zweiter Lauf ist
# billig). Der Embeddings-Timer bleibt als Netz fuer Naechte ohne Bewertung.
set -uo pipefail
source /etc/oeaw-press-ingest/env
ALERT_SOURCE=oeaw-press-score
ALERT_SEAM=scoring_cron
ALERT_CLIENT=oeaw-score/1.0
source /usr/local/bin/oeaw-press-alerting.sh

POLL_S=30
# BATCH_DEADLINE_MINUTES (300) plus Stornieren und Abholen; gleich der
# Stale-Regel des Journals fuer Nacht und CLI (330 min).
POLL_MAX_S=19800
HANDOFF=/run/oeaw-press/checkin-id

# Check-in uebernehmen (und die Datei sofort entfernen: ein spaeterer Handstart
# soll keinen fremden, laengst geschlossenen Check-in erben).
{ read -r CID T_START < "$HANDOFF"; } 2>/dev/null || true
rm -f "$HANDOFF"
if [ -z "${CID:-}" ]; then
  CID=$(hex)
  T_START=$(date +%s)
  checkin in_progress "$CID"
  say "Handstart: eigener Check-in"
fi
T0=$SECONDS
duration() { echo $(( $(date +%s) - ${T_START:-$(date +%s)} )); }

BASE=${INGEST_URL%/api/ingest/run}
# Wie beim Ingest an den lokalen Traefik gepinnt (Cloudflare kappt nach 100 s).
CURL_ARGS=(-sS -H "Authorization: Bearer $INGEST_CRON_SECRET")
[ -n "${INGEST_RESOLVE:-}" ] && CURL_ARGS+=(--resolve "$INGEST_RESOLVE" -k)

BODY_FILE=$(mktemp)
POLL_FILE=$(mktemp)
SHORT_FILE=$(mktemp)
# Die Ergebnisse je Lauf liegen als "$BODY_FILE.<id>" daneben.
trap 'rm -f "$BODY_FILE" "$BODY_FILE".* "$POLL_FILE" "$SHORT_FILE"' EXIT

fail() { # $1=class  $2=title  $3=body-FILE
  head -c "$MAX_BODY_BYTES" "$3" > "$SHORT_FILE"
  checkin error "$CID" "$(duration)"
  sentry_event error "$1" "$2" "$SHORT_FILE"
  mail_team "[OeAW Scoring] Nachtbewertung fehlgeschlagen ($(date -u +%F))" "$2

$(cat "$SHORT_FILE")"
  say "$2"
  exit 1
}

HTTP=$(curl "${CURL_ARGS[@]}" -o "$BODY_FILE" -w '%{http_code}' -m 120 -X POST \
  -H 'Content-Type: application/json' --data '{}' "$BASE/api/scoring/run")
RC=$?
CLASS_503=$(jq -r '.errorClass // empty' < "$BODY_FILE" 2>/dev/null)

# Not-Aus (SCORING_NIGHTLY_ENABLED=false): kein Fehler, die Kette ist ok.
if [ "$RC" -eq 0 ] && [ "$HTTP" = "503" ] && [ "$CLASS_503" = "disabled" ]; then
  checkin ok "$CID" "$(duration)"
  say "DISABLED: Nachtbewertung abgeschaltet (SCORING_NIGHTLY_ENABLED=false)"
  exit 0
fi
[ "$RC" -ne 0 ] && fail "scoring:transport:rc$RC" "OeAW nightly scoring: curl failed (rc=$RC) beim Start" "$BODY_FILE"
[ "$HTTP" != "202" ] && fail "scoring:http:$HTTP${CLASS_503:+:$CLASS_503}" "OeAW nightly scoring: HTTP $HTTP beim Start${CLASS_503:+ ($CLASS_503)}" "$BODY_FILE"

RUN_IDS=$(jq -r '.runs[]?.id' < "$BODY_FILE")
[ -z "$RUN_IDS" ] && fail "scoring:no_runs" "OeAW nightly scoring: Start ohne Journal-ids" "$BODY_FILE"
say "gestartet: $(jq -c '{transport, costCapUsd, runs}' < "$BODY_FILE")"

# Pollen, bis keine Zeile mehr `running` steht. Ein einzelner misslungener Poll
# (Netz, Neustart des Containers) ist kein Abbruch; die Frist ist es.
declare -A STATUS
while :; do
  open=0
  for id in $RUN_IDS; do
    [ "${STATUS[$id]:-running}" != "running" ] && continue
    code=$(curl "${CURL_ARGS[@]}" -o "$POLL_FILE" -w '%{http_code}' -m 30 "$BASE/api/scoring/runs/$id") || code=000
    if [ "$code" = "200" ]; then
      STATUS[$id]=$(jq -r '.status // "running"' < "$POLL_FILE" 2>/dev/null || echo running)
      [ "${STATUS[$id]}" != "running" ] && cp "$POLL_FILE" "$BODY_FILE.$id"
    fi
    [ "${STATUS[$id]:-running}" = "running" ] && open=$((open + 1))
  done
  [ "$open" -eq 0 ] && break
  if [ $(( SECONDS - T0 )) -ge "$POLL_MAX_S" ]; then
    printf '%s\n' "$RUN_IDS" > "$POLL_FILE"
    fail "scoring:timeout" "OeAW nightly scoring: nach $((POLL_MAX_S / 60)) min noch running" "$POLL_FILE"
  fi
  sleep "$POLL_S"
done

# Auswerten: je Lauf Status und Einzeiler; `failed` alarmiert.
FAILED=0
PARTIAL=0
SCORED=0
LINES=""
for id in $RUN_IDS; do
  f="$BODY_FILE.$id"
  st=$(jq -r '.status' < "$f")
  ent=$(jq -r '.entity' < "$f")
  sum=$(jq -r '.summary // ""' < "$f" | tr '\n\r' '  ' | cut -c1-200)
  cls=$(jq -r '.errorClass // empty' < "$f")
  SCORED=$(( SCORED + $(jq -r '.counts.scored // 0' < "$f") ))
  LINES="$LINES $ent=$st${cls:+($cls)}: $sum;"
  [ "$st" = "failed" ] && { FAILED=1; FAIL_CLASS=${cls:-unknown}; FAIL_FILE=$f; }
  [ "$st" = "partial" ] && PARTIAL=1
done

if [ "$SCORED" -gt 0 ]; then
  systemctl start --no-block oeaw-press-embeddings.service \
    && say "embeddings: oeaw-press-embeddings.service gestartet ($SCORED neu bewertet)" \
    || say "embeddings: Start fehlgeschlagen, der Timer zieht nach"
fi

[ "$FAILED" -eq 1 ] && fail "scoring:$FAIL_CLASS" "OeAW nightly scoring —$LINES" "$FAIL_FILE"

checkin ok "$CID" "$(duration)"
if [ "$PARTIAL" -eq 1 ]; then
  say "PARTIAL dur=$(( SECONDS - T0 ))s ::$LINES"
else
  say "OK dur=$(( SECONDS - T0 ))s ::$LINES"
fi
exit 0
