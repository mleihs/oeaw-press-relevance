#!/usr/bin/env bash
# Nightly OeAW ingest trigger. Alerting lives OUTSIDE the app via Sentry crons:
# a FAILED or MISSED check-in raises a Sentry issue -> email. "Missed" also
# catches a dead timer/box (which an in-app or SMTP-from-box alert never could).
# The app route (POST /api/ingest/run) pulls both OeAW JSON feeds + auto-enrich;
# it is long-running (external enrich APIs), hence the generous curl --max-time.
#
# ALERT QUALITY (reworked 2026-07-21 after an audit of the 07-20/07-21 alarms).
# Three defects were fixed here; all three made the alert misrepresent reality:
#
#  1. NO GROUPING. The Sentry message carried the whole JSON body incl. timestamps
#     and durations, so every night hashed to a fresh fingerprint and opened a NEW
#     issue (OEAW-PRESS-TOOLS-6 and -7 were the same class on two nights). Now the
#     event carries an explicit `fingerprint` derived from the failure CLASS, so
#     repeats group and Sentry's frequency/regression signals start working.
#  2. UNREADABLE TITLE. The title was a JSON wall cut at 800 chars — two totally
#     different causes looked identical in the issue list, and the tail (events +
#     enrichment leg) was truncated away entirely. Now the title is the route's
#     one-line `summary`; the full body goes into `extra` untruncated-ish.
#  3. WRONG SEVERITY. Any non-fatal warning flipped the run to ok:false, so a
#     fully successful import raised a high-priority error + a mail to the team
#     inbox. The route now distinguishes ok:false (real failure) from degraded
#     (applied, but with drift warnings). A degraded run reports a SUCCESSFUL
#     check-in and emits neither a Sentry event nor a mail; it is only logged.
#
# NACHTRAG 2026-08-22. Ein vierter Defekt, derselbe Klasse wie 1-3: der Body kam
# mit 4,7 MB zurueck (die Route legte das komplette Query-Payload in die
# Fehlermeldung), `jq --arg b "$BODY"` starb an "Argument list too long", und
# weil das still passierte, entstand ausgerechnet in der einzigen Nacht mit
# einem echten Problem KEIN Sentry-Event. Der Body bleibt deshalb eine DATEI und
# geht nie mehr ueber argv; alles, was in Alarm und Mail wandert, ist gedeckelt;
# und ein misslungener Envelope-Bau meldet sich, statt zu schweigen.
set -uo pipefail
source /etc/oeaw-press-ingest/env

# Was von einem Response-Body hoechstens in Sentry-extra und Mail landet. Reicht
# fuer jeden echten Report; alles darueber ist Payload-Echo.
MAX_BODY_BYTES=20000

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
hex()     { openssl rand -hex 16; }

# Sentry cron check-in (in_progress|ok|error). Best-effort: never fail the job
# on a Sentry hiccup. Uses the DSN public key — no auth token needed.
checkin() { # $1=status  $2=check_in_id  $3=duration(optional)
  local status="$1" cid="$2" dur="${3:-}" eid payload
  eid=$(hex)
  payload="{\"check_in_id\":\"$cid\",\"monitor_slug\":\"$SENTRY_MONITOR_SLUG\",\"status\":\"$status\""
  [ -n "$dur" ] && payload="$payload,\"duration\":$dur"
  payload="$payload}"
  printf '{"event_id":"%s","sent_at":"%s"}\n{"type":"check_in"}\n%s\n' \
      "$eid" "$(now_iso)" "$payload" \
    | curl -s -m 20 -X POST "$SENTRY_INGEST/api/$SENTRY_PROJECT_ID/envelope/" \
        -H "Content-Type: application/x-sentry-envelope" \
        -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=$SENTRY_KEY, sentry_client=oeaw-ingest/1.0" \
        --data-binary @- >/dev/null 2>&1 || true
}

# Actionable detail alongside the check-in. `title` is the human one-liner that
# lands in the issue list and the alert mail subject; `body` is the full response
# JSON, parked in extra.response so it stays readable and never truncates the
# title; `fp` is the stable grouping key (failure class, no volatile numbers).
sentry_event() { # $1=level  $2=fingerprint-key  $3=title  $4=body-FILE
  local level="$1" fp="$2" title="$3" body_file="$4" eid ev
  eid=$(hex)
  # --rawfile statt --arg: der Body kommt aus einer Datei und beruehrt argv nie.
  ev=$(jq -cn \
    --arg eid "$eid" --arg ts "$(now_iso)" --arg lvl "$level" \
    --arg fp "$fp" --arg t "$title" --rawfile b "$body_file" --arg host "$(hostname)" \
    '{event_id:$eid, timestamp:$ts, level:$lvl, logger:"oeaw-press-ingest",
      message:{formatted:$t},
      fingerprint:[$fp],
      tags:{seam:"ingest_cron", failure_class:$fp, server_name:$host},
      extra:{response:$b}}')
  # Nicht mehr still scheitern: ohne Envelope gibt es kein Event, und genau das
  # blieb am 2026-08-22 unbemerkt.
  if [ -z "$ev" ]; then
    say "sentry: envelope build FAILED ($(wc -c < "$body_file") bytes body) - kein Event gesendet"
    return 1
  fi
  printf '{"event_id":"%s","sent_at":"%s"}\n{"type":"event"}\n%s\n' \
      "$eid" "$(now_iso)" "$ev" \
    | curl -s -m 20 -X POST "$SENTRY_INGEST/api/$SENTRY_PROJECT_ID/envelope/" \
        -H "Content-Type: application/x-sentry-envelope" \
        -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=$SENTRY_KEY, sentry_client=oeaw-ingest/1.0" \
        --data-binary @- >/dev/null 2>&1 || true
}

# Direct mail to the OeAW team inbox (prossl SMTP), belt-and-suspenders alongside
# the Sentry check-in: the tailored failure detail reaches websites@ even though a
# free-plan Sentry seat can't be granted to that address. Optional: skipped if
# SMTP is unconfigured. Best-effort — never fails the job on a mail hiccup.
# Only HARD failures mail here — a degraded run is not the team's problem.
mail_team() { # $1=subject  $2=body
  local subj="$1" body="$2"
  [ -z "${SMTP_URL:-}" ] && return 0
  printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n' \
      "$MAIL_FROM" "$MAIL_TO" "$subj" "$body" \
    | curl -s -m 30 --url "$SMTP_URL" --ssl-reqd \
        --mail-from "$MAIL_FROM" --mail-rcpt "$MAIL_TO" \
        --user "$SMTP_USER:$SMTP_PASS" --upload-file - \
    && say "alert mail sent to $MAIL_TO" \
    || say "alert mail to $MAIL_TO FAILED"
}

# Write to stdout, NOT via `logger`: systemd captures stdout under this unit, so
# the line shows up in `journalctl -u` — where the old logger-only calls did not,
# which is why the 07-21 post-mortem saw "alert mail sent" without any reason.
# The unit sets SyslogIdentifier=oeaw-press-ingest, so `journalctl -t` still
# finds it too. (Using both would log every line twice.)
say() { printf '%s\n' "$1"; }

CID=$(hex)
checkin in_progress "$CID"

T0=$SECONDS
BODY_FILE=$(mktemp)
# INGEST_RESOLVE (e.g. host:443:127.0.0.1) pins the request to the LOCAL Traefik
# so it never leaves the box for Cloudflare — CF's fixed 100s proxy timeout would
# otherwise 524 this long (enrichment) run. -k because the local proxy presents the
# CF Origin cert (only trusted by CF); the hop is localhost, so skipping verify is safe.
CURL_ARGS=(-sS -o "$BODY_FILE" -w '%{http_code}' -m 2700 -X POST
  -H "Authorization: Bearer $INGEST_CRON_SECRET")
[ -n "${INGEST_RESOLVE:-}" ] && CURL_ARGS+=(--resolve "$INGEST_RESOLVE" -k)
HTTP=$(curl "${CURL_ARGS[@]}" "$INGEST_URL")
RC=$?
DUR=$(( SECONDS - T0 ))
# Gekuerzte Kopie fuer alles, was den Rechner verlaesst (Sentry-extra, Mail).
# Das Original bleibt liegen, solange jq es auswertet.
BODY_SHORT_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE" "$BODY_SHORT_FILE"' EXIT
BODY_BYTES=$(wc -c < "$BODY_FILE")
head -c "$MAX_BODY_BYTES" "$BODY_FILE" > "$BODY_SHORT_FILE"
if [ "$BODY_BYTES" -gt "$MAX_BODY_BYTES" ]; then
  printf '\n\n[gekuerzt: %s von %s Bytes]\n' "$MAX_BODY_BYTES" "$BODY_BYTES" >> "$BODY_SHORT_FILE"
fi

# jq liest per stdin bzw. --rawfile, nie per argv (siehe Kopf, 2026-08-22).
OK=$(jq -r '.ok // empty'       < "$BODY_FILE" 2>/dev/null)
DEGRADED=$(jq -r '.degraded // empty' < "$BODY_FILE" 2>/dev/null)
SUMMARY=$(jq -r '.summary // empty'   < "$BODY_FILE" 2>/dev/null)
# Grouping detail for feed failures: which feed in which state, no numbers.
FEEDFP=$(jq -r '[.failed[]? | "\(.feed)=\(.status)"] | sort | join(",")' \
  < "$BODY_FILE" 2>/dev/null)
# Pre-`summary` deploys (and non-JSON error pages) have no one-liner to borrow.
[ -z "$SUMMARY" ] && SUMMARY=$(head -c 300 "$BODY_SHORT_FILE")
# Der Titel ist Issue-Titel UND Mail-Betreff: eine Zeile, endliche Laenge.
SUMMARY=$(printf '%s' "$SUMMARY" | tr '\n\r' '  ' | cut -c1-300)

# --- Success ---------------------------------------------------------------
if [ "$RC" -eq 0 ] && [ "$HTTP" = "200" ] && [ "$OK" = "true" ]; then
  checkin ok "$CID" "$DUR"

  # Applied, but with drift warnings (e.g. a junction pointing at a person the
  # OeAW export itself never delivered — the 2026-07-21 case). The import
  # SUCCEEDED; this must not wake anyone. Deliberately NO Sentry event and NO
  # mail: the project's only alert rule fires on high-priority issues, including
  # an existing issue that Sentry later escalates — a nightly-recurring issue
  # could cross that line on its own and start mailing again. The signal stays
  # durable without Sentry: ingest_runs.report carries person_link_orphans etc.
  # per run, and the line below lands in the unit journal. Real corpus drift is
  # caught by DRIFT_ALARM_THRESHOLD in the route, which flips ok:false.
  if [ "$DEGRADED" = "true" ]; then
    say "DEGRADED http=$HTTP dur=${DUR}s :: $SUMMARY"
    exit 0
  fi

  say "OK http=$HTTP dur=${DUR}s"
  exit 0
fi

# --- Hard failure ----------------------------------------------------------
# Classify so repeats group into ONE issue per cause instead of one per night.
if [ "$RC" -ne 0 ]; then
  CLASS="ingest:transport:rc$RC"
  TITLE="OeAW nightly ingest: curl failed (rc=$RC) after ${DUR}s"
elif [ "$HTTP" != "200" ]; then
  CLASS="ingest:http:$HTTP"
  TITLE="OeAW nightly ingest: HTTP $HTTP from the ingest route"
else
  CLASS="ingest:feed${FEEDFP:+:$FEEDFP}"
  TITLE="OeAW nightly ingest — $SUMMARY"
fi

checkin error "$CID" "$DUR"
sentry_event error "$CLASS" "$TITLE" "$BODY_SHORT_FILE"
mail_team "[OeAW Ingest] Nachtlauf fehlgeschlagen ($(date -u +%F))" \
  "$TITLE

curl_rc=$RC http=$HTTP ok=${OK:-<none>} dur=${DUR}s

$(cat "$BODY_SHORT_FILE")"
say "$TITLE (curl_rc=$RC http=$HTTP ok=${OK:-<none>} dur=${DUR}s)"
exit 1
