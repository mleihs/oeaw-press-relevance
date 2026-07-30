---
description: Publikationen und Events in-chat gegen Prod bewerten (batchweise, ohne OpenRouter)
argument-hint: "[pubs|events|beides] [batchgröße, Default 25]"
---

Bewerte Publikationen und/oder Veranstaltungen **in-chat** — also von dir selbst,
nicht über OpenRouter. Das ist der kalibrierte Standardweg und kostet nichts; der
„Bewerten"-Knopf in der App und `npm run analyze-events` sind nur der Fallback.

Umfang: `$1` (`pubs`, `events` oder `beides`; ohne Angabe **beides**).
Batchgröße: `$2` (ohne Angabe **25**).

**Ablauf, Befehle und Kalibrierungsanker stehen in `docs/INCHAT_SCORING.md`.**
Lies das Dokument, bevor du anfängst, und arbeite es durch. Hier steht nur, was
weder in den Code noch in dieses Dokument gehört:

- **Rubriktreue ist die Aufgabe.** `lib/server/analysis/prompts.ts` für
  Publikationen, `lib/server/events/prompts.ts` für Events. Wenn deine Bewertung
  und die Rubrik auseinandergehen, gewinnt die Rubrik — sonst sind die neuen
  Scores mit dem Bestand nicht mehr vergleichbar.
- **Bewerte aus dem `content`, nie aus dem Titel allein.** Eine Bewertung ohne
  Substanz ist Fabrikation. Bei Publikationen bricht `apply` unter 120 Zeichen
  Inhalt selbst ab; bei Events musst du selbst entscheiden.
- **Erst Trockenlauf, dann schreiben.** Beide Skripte sind Dry-run per Default
  und fragen vor einem Prod-Write nach. Lies die Vorschau, bevor du bestätigst.
- **Berichte nach jedem Batch Median, Spanne und die Ausreißer nach oben** —
  nicht nur „fertig". Daran erkennt der User, ob die Kalibrierung gehalten hat.
- **Nichts erfinden, wenn es eng wird.** Wenn das Output-Budget knapp wird, sag
  das, statt auf Textbausteine zurückzufallen.
