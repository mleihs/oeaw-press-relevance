#!/usr/bin/env bash
# Em-Dash-Gate für MDX-Content (content/help/**.mdx).
#
# ESLint covers em-dashes in .ts/.tsx UI-Files. MDX braucht eslint-plugin-mdx,
# das wir nicht installiert haben — dieser grep-basierte Check schließt die
# Lücke und prüft die KB-Artikel auf U+2014.
#
# Beispiel-Use: in `npm run check-em-dashes` oder via pre-commit hook.
# Exit 1 wenn Em-Dashes gefunden, sonst 0.
set -euo pipefail

if grep -rn '—' content/help/ --include='*.mdx' 2>/dev/null; then
  echo ""
  echo "Em-Dashes (U+2014) in MDX-Content gefunden."
  echo "Bitte durch Komma, Doppelpunkt oder Punkt+Neusatz ersetzen."
  echo "Siehe memory/kb_writing_style.md."
  exit 1
fi
echo "OK: keine Em-Dashes in content/help/"
