#!/usr/bin/env bash
# Vergleicht die Repo-Kopien der metaspots-Ops-Dateien mit dem, was dort wirklich
# laeuft. OHNE diesen Check ist das Verzeichnis nur ein Schnappschuss, der beim
# ersten Hotfix auf der Box unbemerkt falsch wird -- und genau so ist die
# Alarm-Kette am 2026-08-22 gescheitert: niemand konnte sehen, was deployt war.
#
#   bash infra/metaspots/sync-check.sh          # nur pruefen (Exit 1 bei Drift)
#   bash infra/metaspots/sync-check.sh --pull   # Box gewinnt, Repo nachziehen
#
# Deployt wird bewusst NICHT von hier: das Ausrollen ist ein bewusster Schritt
# (siehe README), kein Nebeneffekt eines Vergleichs.
set -uo pipefail

HOST=${METASPOTS_SSH_HOST:-metaspots}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PULL=0
[ "${1:-}" = "--pull" ] && PULL=1

# repo-relativer Pfad  ->  Pfad auf der Box
map() {
  case "$1" in
    bin/*)     echo "/usr/local/bin/$(basename "$1")" ;;
    sbin/*)    echo "/usr/local/sbin/$(basename "$1")" ;;
    systemd/*) echo "/etc/systemd/system/$(basename "$1")" ;;
  esac
}

drift=0
missing=0
checked=0
# Aus $ROOT heraus globben, NICHT aus dem Arbeitsverzeichnis: sonst matcht das
# Muster nichts, die Schleife laeuft leer durch und der Check meldet froehlich
# "identisch", ohne eine einzige Datei angesehen zu haben.
cd "$ROOT" || exit 1
shopt -s nullglob
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
for rel in bin/*.sh sbin/*.sh systemd/*.service systemd/*.timer; do
  remote=$(map "$rel")
  checked=$((checked + 1))
  # In eine DATEI holen, nicht in eine Variable: $(...) schluckt abschliessende
  # Zeilenumbrueche, dann meldet der Vergleich Unterschiede, die keine sind --
  # oder uebersieht welche, die es sind.
  ssh -o BatchMode=yes "$HOST" "cat '$remote'" > "$TMP" 2>/dev/null
  if [ ! -s "$TMP" ]; then
    echo "FEHLT auf $HOST (oder leer): $remote"
    missing=$((missing + 1))
    continue
  fi
  if ! diff -q "$TMP" "$rel" >/dev/null; then
    if [ "$PULL" = "1" ]; then
      cp "$TMP" "$rel"
      echo "NACHGEZOGEN: $rel"
    else
      echo "DRIFT: $rel  <->  $HOST:$remote"
      diff -u "$rel" "$TMP" | sed 's/^/    /' | head -40
    fi
    drift=$((drift + 1))
  fi
done

if [ "$checked" -eq 0 ]; then
  echo "FEHLER: keine Datei gefunden -- der Check haette nichts gemeldet"
  exit 2
fi
if [ "$PULL" = "1" ]; then
  echo "fertig: $checked geprueft, $drift nachgezogen, $missing fehlen auf $HOST"
  exit 0
fi
if [ "$drift" -eq 0 ] && [ "$missing" -eq 0 ]; then
  echo "OK: $checked Datei(en) geprueft, Repo und $HOST sind identisch"
  exit 0
fi
echo "Drift: $drift, fehlend: $missing"
exit 1
