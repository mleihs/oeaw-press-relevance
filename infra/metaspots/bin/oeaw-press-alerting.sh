#!/usr/bin/env bash
# Gemeinsame Alarm-Bausteine der Nacht-Wrapper (oeaw-press-ingest.sh,
# oeaw-press-score.sh): Sentry-Cron-Check-in, Sentry-Event, Mail an das Team,
# Journal-Zeile. Wird per `source` geladen, nicht ausgefuehrt. Herausgezogen
# 2026-10-28 aus oeaw-press-ingest.sh, als der zweite Wrapper dazukam; das
# Verhalten ist unveraendert, die Begruendungen der einzelnen Regeln stehen
# weiter im Kopf von oeaw-press-ingest.sh.
#
# Erwartet (aus /etc/oeaw-press-ingest/env): SENTRY_MONITOR_SLUG, SENTRY_INGEST,
# SENTRY_PROJECT_ID, SENTRY_KEY, optional SMTP_URL, SMTP_USER, SMTP_PASS,
# MAIL_FROM, MAIL_TO. Vom Aufrufer VOR dem source gesetzt:
#   ALERT_SOURCE  Logger-Name im Sentry-Event (z. B. oeaw-press-ingest)
#   ALERT_SEAM    Sentry-Tag `seam` (z. B. ingest_cron)
#   ALERT_CLIENT  sentry_client im Envelope-Header (z. B. oeaw-ingest/1.0)

# Was von einem Response-Body hoechstens in Sentry-extra und Mail landet. Reicht
# fuer jeden echten Report; alles darueber ist Payload-Echo.
MAX_BODY_BYTES=20000

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
hex()     { openssl rand -hex 16; }

# Write to stdout, NOT via `logger`: systemd captures stdout under the unit, so
# the line shows up in `journalctl -u`. The units set SyslogIdentifier, so
# `journalctl -t` still finds it too. (Using both would log every line twice.)
say() { printf '%s\n' "$1"; }

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
        -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=$SENTRY_KEY, sentry_client=$ALERT_CLIENT" \
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
    --arg logger "$ALERT_SOURCE" --arg seam "$ALERT_SEAM" \
    '{event_id:$eid, timestamp:$ts, level:$lvl, logger:$logger,
      message:{formatted:$t},
      fingerprint:[$fp],
      tags:{seam:$seam, failure_class:$fp, server_name:$host},
      extra:{response:$b}}')
  # Nicht still scheitern: ohne Envelope gibt es kein Event, und genau das
  # blieb am 2026-08-22 unbemerkt.
  if [ -z "$ev" ]; then
    say "sentry: envelope build FAILED ($(wc -c < "$body_file") bytes body) - kein Event gesendet"
    return 1
  fi
  printf '{"event_id":"%s","sent_at":"%s"}\n{"type":"event"}\n%s\n' \
      "$eid" "$(now_iso)" "$ev" \
    | curl -s -m 20 -X POST "$SENTRY_INGEST/api/$SENTRY_PROJECT_ID/envelope/" \
        -H "Content-Type: application/x-sentry-envelope" \
        -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=$SENTRY_KEY, sentry_client=$ALERT_CLIENT" \
        --data-binary @- >/dev/null 2>&1 || true
}

# Direct mail to the OeAW team inbox (prossl SMTP), belt-and-suspenders alongside
# the Sentry check-in. Optional: skipped if SMTP is unconfigured. Best-effort —
# never fails the job on a mail hiccup. Only HARD failures mail here.
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
