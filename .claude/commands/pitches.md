---
description: Pitch-Texte batchweise nachziehen (repitch), ohne die Bewertung anzufassen
argument-hint: "[batchgröße, Default 25] [--model=TAG]"
---

Zieh die Pitch-Texte nach, die hinter der korrigierten Rubrik zurückbleiben.
**Die Scores bleiben unberührt** — das ist der ganze Punkt dieses Wegs.

Ablauf, Befehle und Wachen: **`docs/INCHAT_SCORING.md`, Abschnitt „Pitch
nachziehen, ohne neu zu bewerten"**. Lies ihn, bevor du anfängst.

Batchgröße: `$1` (ohne Angabe **25**). Kohorte: `$2` (ohne Angabe
`anthropic/claude-opus-4.8-session`, die Kohorte mit dem Befund von 2026-08-28).

Erst den Reststand feststellen, damit klar ist, wo du stehst:

```sql
SELECT llm_model, count(*) FROM publications
 WHERE analysis_status='analyzed' AND press_score IS NOT NULL
   AND archived=false AND pitch_revision=0
 GROUP BY 1 ORDER BY 2 DESC;
```

Was hier steht und nicht im Dokument:

- **Die Rubrik ist `lib/server/analysis/prompts.ts`, Punkt 6 „VERANKERUNG".**
  Einrichtung ausgeschrieben („vom Institut für Interdisziplinäre Gebirgsforschung
  der ÖAW"), Forschende beim Namen, Fachbegriff nennen *und* erklären,
  Größenordnungen aus der Quelle. Fehlt ein Anker: **kürzer schreiben**, nicht
  füllen.
- **Kalibriere an den bereits nachgezogenen Texten**, nicht am alten Pitch:
  `SELECT pitch_suggestion FROM publications WHERE pitch_revision>=1 LIMIT 3;`
  Der alte Text ist das, was ersetzt werden soll — wer ihn umformuliert,
  reproduziert die Lücke.
- **Prüf, ob die lead_author-Person wirklich an der ÖAW ist**, bevor du sie einem
  Institut zuschreibst: `person_publications` × `persons` für die Pub-IDs. Ist der
  Erstautor extern, schreib „unter Beteiligung von <ÖAW-Person> vom <Institut>"
  statt ihn dem Institut zuzuordnen.
- **Keine Em-Dashes (—).** Im Bestand kommen sie null Mal vor; `sanitizeText`
  greift auf diesem Pfad nicht.
- **Keine Verwertbarkeits-Aussagen im Pitch** („eignet sich für …", „gut zu
  bebildern"). Der Guard bricht darauf ab, und sie stehen ohnehin in
  `target_audience` / `suggested_angle`.
- **Reihenfolge ist neueste zuerst** — `repitch-candidates` sortiert schon so
  (`ORDER BY published_at DESC`). Nicht umsortieren.
- **prod ist direkt erreichbar**, `session-pipeline` braucht keinen Tunnel.
- **Nach jedem Batch den Reststand je Kohorte melden**, den druckt
  `repitch-apply` selbst.
