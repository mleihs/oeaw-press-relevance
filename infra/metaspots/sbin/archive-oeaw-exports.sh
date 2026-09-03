#!/usr/bin/env bash
# Archiviert die beiden OeAW-JSON-Rohexporte gzip-komprimiert, BEVOR der Ingest
# sie anwendet.
#
# WARUM: OeAW überschreibt die Exporte jede Nacht gegen 03:00-03:25. Bei den
# Vorfällen am 2026-07-22 (1424 Pseudo-Löschungen) und 2026-07-29 (Personensätze
# auf {uid,lastname} eingedampft) war die Diagnose nur möglich, weil zufällig am
# selben Tag jemand nachsah. Einen Tag später wären die Belege weg gewesen —
# `ingest_runs.report` hält nur unsere Zählung fest, nicht die Rohdaten.
#
# Die Exporte komprimieren ~10:1 (30 MB -> ~3 MB), 90 Tage kosten damit unter
# 300 MB. Läuft bewusst als EIGENER Timer, nicht im Ingest-Wrapper: so entstehen
# Belege auch dann, wenn der Ingest pausiert ist — also genau in der Lage, in der
# man sie am dringendsten braucht.
#
# CLOUDFLARE: die Export-URLs liegen hinter einer Managed Challenge (403 auf
# serverseitiges curl). Wie in lib/server/ingest/fetch-export.ts lösen wir den
# Host per --resolve auf die Origin-IP auf, senden SNI/Host aber unverändert —
# dadurch bleibt die TLS-Validierung intakt (kein -k).
set -uo pipefail

ARCHIVE_DIR=/data/coolify/backups/oeaw-exports
RETENTION_DAYS=90
ORIGIN_HOST=voxy.arz.oeaw.ac.at
EXPORT_HOST=www.oeaw.ac.at
BASE_URL="https://$EXPORT_HOST/fileadmin/exports"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
FEEDS=(event_news_grouped.json publications_incremental_change_2.json)

mkdir -p "$ARCHIVE_DIR"
run_stamp=$(date -u +%F)
rc=0

# Origin-IP frisch auflösen: sie hat schon gewechselt, ein fest verdrahteter
# Wert wäre eine stille Zeitbombe.
ip=$(dig +short "$ORIGIN_HOST" | grep -E '^[0-9.]+$' | head -1)
if [ -z "$ip" ]; then
  echo "archive-oeaw-exports: cannot resolve $ORIGIN_HOST" >&2
  exit 1
fi

for feed in "${FEEDS[@]}"; do
  tmp=$(mktemp)

  http=$(curl -sS --max-time 300 --resolve "$EXPORT_HOST:443:$ip" \
           -H "User-Agent: $UA" -H 'Accept: application/json,text/plain,*/*' \
           -o "$tmp" -w '%{http_code}' "$BASE_URL/$feed")
  if [ "$?" -ne 0 ] || [ "$http" != "200" ]; then
    echo "archive-oeaw-exports: $feed -> HTTP $http, skipping" >&2
    rm -f "$tmp"; rc=1; continue
  fi

  # Eine Cloudflare-Challenge kommt als HTML mit HTTP 200 zurück — als JSON-Archiv
  # wertlos und als „erfolgreich" gemeldet irreführend. Erste Bytes prüfen.
  if ! head -c 1 "$tmp" | grep -qE '[[{]'; then
    echo "archive-oeaw-exports: $feed is not JSON (challenge/HTML?), skipping" >&2
    rm -f "$tmp"; rc=1; continue
  fi

  # Tagesstempel aus dem Feed selbst (meta.generated_at_timestamp, Unix-Epoch),
  # NICHT aus dem Laufdatum: seit Persistent=true kann ein Boot-Nachhol-Lauf
  # sonst Nacht-N-Inhalt unter Nacht-N+1-Namen ablegen. Die Exporte entstehen
  # ~03:00-03:25 Wien; in UTC konvertiert bleibt das derselbe Kalendertag.
  # Fallback aufs Laufdatum, wenn das Feld fehlt oder kaputt ist.
  ts=$(jq -r '.meta.generated_at_timestamp // empty' "$tmp" 2>/dev/null)
  if echo "$ts" | grep -qE '^[0-9]+$' && stamp=$(date -u -d "@$ts" +%F 2>/dev/null); then
    :
  else
    stamp=$run_stamp
    echo "archive-oeaw-exports: $feed has no usable meta.generated_at_timestamp, falling back to run date $stamp" >&2
  fi
  out="$ARCHIVE_DIR/${feed%.json}-$stamp.json.gz"

  # Exists-Guard: eine vorhandene Stempel-Datei ist ein bereits gesicherter
  # Beleg und wird NIE überschrieben. Ohne den Guard trunkiert der reguläre
  # 06:15-Lauf nach einem Boot-Nachhol-Lauf genau die Datei, die den einzigen
  # Roh-Beleg eines bereits angewandten Deltas enthält.
  if [ -e "$out" ]; then
    echo "archive-oeaw-exports: $out already exists, keeping existing archive (skip)"
    rm -f "$tmp"; continue
  fi

  gzip -c "$tmp" > "$out"
  rm -f "$tmp"

  # gzip -c kann bei vollem Volume trunkiert schreiben und trotzdem 0 liefern.
  if ! gzip -t "$out" 2>/dev/null; then
    echo "archive-oeaw-exports: $out failed integrity check, removing" >&2
    rm -f "$out"; rc=1; continue
  fi
  echo "archive-oeaw-exports: wrote $out ($(stat -c%s "$out") bytes)"
done

# Retention. -mtime greift auf die Schreibzeit, nicht auf den Namensstempel —
# für tägliche Dateien deckungsgleich.
find "$ARCHIVE_DIR" -name '*.json.gz' -type f -mtime +$RETENTION_DAYS -delete

exit $rc
