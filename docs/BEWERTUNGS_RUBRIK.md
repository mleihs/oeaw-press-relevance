# Bewertungs-Rubrik — Press-Relevance-Scoring

Wie Publikationen im Session-basierten Workflow `candidates → bewerten → apply` zu bewerten sind. Aus Realbetrieb destilliert (Sessions 6-20 = 7,148 Pubs analyzed; Repair-Sweep aus 872 lokal/prod-paired Pubs am 2026-04-28). Für Menschen, die diese Bewertungen reproduzieren, prüfen oder fortführen wollen — und als verbindliche Grundlage für jede automatisierte Bewertung.

## Loop pro Charge

```bash
# 1. Candidates ziehen — Default 50 (Context-Budget pro Session)
node scripts/session-pipeline.mjs candidates 50 > /tmp/batch.json

# 2. Build-Skript für die Bewertungen (Vorlage hat alle Sanity-Checks eingebaut)
cp scripts/eval_chunk_template.py /tmp/build_chunk_revisions.py
# → PUBS-Block füllen (1 add(...) pro Pub), python3 ausführen
# → Bei Verstoß gegen die Schwellen: Exit 1, Korrektur, erneut

# 3. Apply (--force bei Re-Eval, sonst nur --apply)
node scripts/session-pipeline.mjs apply /tmp/chunk_revisions.json --apply

# 4. Sofort nächste Charge — kein Stop, kein Bericht zwischendurch
```

**Charge-Größe:** **50 Pubs** ist die praktisch erprobte Obergrenze pro Session — bei mehr läuft der Context-Budget einer Conversation in den Engpass (50 Pubs × Content + Pitch + Reasoning + Sanity-Check-Output passt verlässlich, 100 oft nicht). Bei sehr kurzen Pubs (Editorials, Buchrezensionen) gerne 75-100, bei Content-schweren Long-Form-Studies eher 30-40.

**Disziplin-Anker:** Charges sollen durchlaufen. Keine Zwischenstand-Berichte. Wenn `session-pipeline.mjs` etwas nicht kann: das offizielle Skript erweitern — keine ad-hoc Node-Einzeiler oder `/tmp/fetch_*.mjs` Helfer.

## Pro-Pub-Disziplin

| Aspekt | Soll | Anti-Pattern |
|---|---|---|
| Content lesen | vollständig vor erstem Tippzeichen | überfliegen |
| Story-Anker | konkret aus Content paraphrasiert | „keine breitenwirksame Stoßrichtung" (Generic-Default-Verbot) |
| `pitch_suggestion` | **350-550 Zeichen**, drei Beats: Hook → Konkretum → Anschluss | Templates wie „Eine Studie aus dem Wiener…", „Eine GMI-Studie der OeAW zeigt…", Methodendetails als Lead |
| `reasoning` | **200-280 Zeichen**, dimensionsweise (3 Sätze: Inhalt + Vermittelbarkeit + Aktualität) | Floskel-Sign-off „Pressewertbar als…", Variablennamen wie `popular_science=true` |
| `suggested_angle` | **50-200 Zeichen**, der Anker in einem Satz, anders formuliert als im Pitch | Wiederholung der Headline-Zahl |
| `target_audience` | konkrete Outlets: Der Standard Wissen, APA Science, Wissenschaftsredaktion ORF, science.ORF.at, Die Presse Wissen, Spektrum der Wissenschaft, Falter, Profil, ORF Universum, ORF Ö1 Dimensionen | „reine Fachpresse", „Industrieumfeld", „Fachpublikum" als Hauptwert (= Audience-Verzicht) |
| `haiku` | deutsches 5-7-5, aus Anker verdichtet, ohne Eigennamen oder Fachjargon | weglassen, generisch wiederverwenden |

### Score-Bias-Korrektur (aus 872-Pub-Audit lokal vs. prod)

Beim eigenen Scoring **bewusst gegensteuern**, weil die LLM-Drift sich in 4 Dimensionen wiederholt zeigte:

| Dimension | Mittlere Drift (lokal − prod) | Korrektur |
|---|---|---|
| `novelty_factor` | **+0,121** | −0,10 vom ersten Bauchgefühl |
| `media_timeliness` | +0,088 | −0,05 |
| `societal_relevance` | +0,061 | −0,05 |
| `storytelling_potential` | +0,019 | neutral |
| `public_accessibility` | −0,032 | wenn lebensweltlich relatable: 0,30+, nicht Default 0,15 |

Net: lokale `press_score`-Werte lagen im Schnitt **+0,05 zu hoch**. Top-Overscores systematisch bei **Buchrezensionen, Editorials, lokalen archäologischen Funden** (0,3+ ist da meist zu viel — prod sieht 0,07-0,28 richtig).

**Konsistenzprüfung:** Wenn der Story-Anker einen Aktualitätsbezug benennt, muss `media_timeliness` das mitmachen (≥ 0,85). Sonst widersprechen sich Pitch und Score.

### 9-Schritt-Pitch-Prozess pro Pub

1. **Content lesen** — vollständig, mindestens 1× durch.
2. **Story-Anker identifizieren** — was im Content macht das interessant *jetzt*, *für ein nicht-Fachpublikum*? Eine Reibung gegen Erwartung? Aktualitätsbezug? Personalisierbare Frage? Anschauliches Bild?
3. **Wenn kein Anker:** STOP. Niedrige Scores (< 0,15), knappes 2-Satz-Reasoning, KEINE „reine Fachpresse"-Audience, sondern konkretes Spezialfeld oder gar nichts.
4. **Wenn Anker:** Pitch in drei Beats — Hook (Leser adressieren), Konkretum aus Content (paraphrasiert), Anschluss (Why-it-matters).
5. **Angle schreiben** — DER Anker in einem Satz, anders als im Pitch.
6. **Reasoning schreiben** — dimensionsweise, drei Sätze, kein Floskel-Schluss.
7. **Audience schreiben** — 2-4 konkrete Outlets, nach Pitch-Reichweite gewichtet.
8. **Scores setzen** — gegen die Bias-Drift korrigiert.
9. **Haiku** — 5-7-5 deutsch, aus Anker verdichtet.

## Anti-Patterns (mit Code-Block in `eval_chunk_template.py`)

Das Build-Skript bricht mit Exit 1 ab bei:

- **Pressewertbar-Floskel** im Reasoning (425/872 Pubs im Audit): „Pressewertbar als Backgrounder", „Pressewertbar in Regional- und Wissenschaftsressorts", „Pressewertbar für Wissenschaftsspezial- und Kulturressorts" und Varianten.
- **Wiener-Templates** im Pitch (204/872 im Audit): „Eine Studie aus dem Wiener…", „Wissenschaftlich begutachtete Studie aus der…", „Eine GMI-Studie der OeAW zeigt…", „Das Wiener Hochenergiephysik-Institut der ÖAW…", „Eine Leobener ESI-Gruppe entwickelt eine…" und institutsbasierte Prefix-Variationen.
- **Generic-Angle** (265/872 im Audit, prod-Baseline 1/872): „keine breitenwirksame Stoßrichtung", „keine starke eigenständige Stoßrichtung", „kein eigenständiger Pressewinkel".
- **Audience-Verzicht** (221/872 im Audit): „reine Fachpresse", „Spezialfachpresse", „Fachpublikum".
- **Negative Meta-Phrasen** im Reasoning: „außerhalb der Disziplin", „für Fachpublikum", „spezialisiertes Fach" als präemptive Abwertung.
- **Variablen-/Spaltennamen**: `popular_science=true`, `peer_reviewed=false`, `mahighlight=true` im User-facing Text.
- **Längen außerhalb Korridor**: Pitch < 350 oder > 650, Reasoning < 200 oder > 300, Angle < 50 oder > 200.
- **Akronym-Inferenz** (wenn `content=`-Parameter mitgegeben): geo/historische Behauptungen ohne Volltext-Beleg im Content.
- **Default-Templates für Routine-Pubs**: einen Pitch-Generator schreiben, der nur den Institutsnamen variiert und den Rest fix lässt, ist verboten — jede Pub einzeln auf Basis ihres Contents bewerten.

## DB-Flag-Lesart

| Flag | Erlaubte Übersetzung | Verboten |
|---|---|---|
| `popular_science=true` | „im WebDB als populärwissenschaftlich/öffentlichkeitsrelevant markiert" | „Das Institut hat den Beitrag intern als pressetauglich klassifiziert" |
| `peer_reviewed=true` | „wissenschaftlich begutachtet" | (passt) |
| `mahighlight=true` | „Eine der beteiligten ÖAW-Autor:innen ([Name]) hat den Beitrag im WebDB als persönliches Highlight markiert" | „Das Akademie-Mitglied selbst hat ihn als Highlight markiert" |

**Zur `mahighlight`-Lesart:** In 38 von 41 dokumentierten Fällen ist die markierende Person KEIN Mitglied der Gelehrtengesellschaft (`member_type_id = NULL`), sondern reguläre:r ÖAW-Forscher:in. Bei `mahighlight=true` immer per JOIN auf `persons` und `member_types` prüfen, ob die markierende Person tatsächlich Mitglied ist. Wenn nein: Person konkret nennen, „Mitglied" weglassen.

## Anti-Fabrikations-Regeln

- **Keine Bewertung ohne substantiellen Inhalt.** Pub muss ≥120 Zeichen `summary_de`/`summary_en`/`enriched_abstract`/`abstract` haben. Status `enriched` allein reicht nicht — der Loop kann ohne Quellen-Treffer durchgelaufen sein. Wenn kein substantieller Content da: in `pending` belassen, nichts aus dem Titel ableiten.
- **Keine relativen Einordnungen** im Reasoning. Verboten: „pressetauglichst", „im Vergleich zu", „höchster Score in der Charge", „anders als die Folgeepisoden". Reasoning steht für sich, nicht relativ zu anderen Pubs.
- **Keine Behauptungen ohne Content-Beleg.** Verboten ohne Wortlaut im Abstract: „Erstmonografie", „erstmals beschrieben", „völlig neu", „kaum erforscht", „wenig erschlossen", „selten thematisiert". Erlaubt: Paraphrase dessen, was im Content steht.
- **Akronym-Inferenz ist Fabrikation.** Bei jeder geografisch-historischen oder periodischen Behauptung im Pitch oder Reasoning (Habsburgermonarchie, Mittelalter, Reformation, k.u.k., cisleithanisch, Bernsteinstrasse) den Content per Volltextsuche prüfen, ob das Wort wörtlich enthalten ist. Wenn nein: streichen oder durch eine inhaltlich belegbare Formulierung ersetzen.

## Quality-Drift-Wächter (Mustermüdigkeit-Killer)

1. **Substanz vor Geschwindigkeit.** „Output-Budget" heißt nicht „möglichst viele Pubs durch", sondern „pro Pub mindestens 220-260 Zeichen Reasoning, drei Sätze". Lieber 35 Pubs richtig als 50 flach.
2. **Längen-Statistik alle 10 Pubs prüfen** — bei Charges mit ≥10 ähnlichen Pubs (gleiches Akronym + ähnliche Methodik) den Reasoning-Median der letzten 10 ausrechnen. Wenn unter 220 Zeichen: STOP, zurück zu den letzten 5, anreichern. Mustermüdigkeit ist beim Schreiben unsichtbar; sie zeigt sich nur in der Längen-Statistik.
3. **Differenzierung in homogenen Clustern.** Bei drei Pubs derselben Person zum nahem Topic (z.B. drei Horejs-Balkan-Pubs): jede auf eigenen Erzähl-Anker, eigene Audiences, eigene Haikus. Niemals den ersten Anker variiert wiederverwenden.
4. **Sanity-Checks tight von Anfang an.** Nicht erst auf Nachfrage Schwellen anziehen. `eval_chunk_template.py` hat die strengen Korridore als Asserts drin — nutzen, nicht umgehen.

## Tooling

**`scripts/eval_chunk_template.py`** ist die Vorlage mit allen Sanity-Checks. Workflow:

```bash
cp scripts/eval_chunk_template.py /tmp/build_chunk_revisions.py
# → PUBS-Block füllen, python3 ausführen
# → Bei Verstoß: Exit 1 mit Erklärung welche Pub gegen welchen Check verstößt
# → Bei Erfolg: schreibt /tmp/chunk_revisions.json
node scripts/session-pipeline.mjs apply /tmp/chunk_revisions.json --apply
```

Das Skript prüft alle oben genannten Anti-Patterns plus Bindestrich-Tippfehler und Pitch/Angle/Haiku-Uniqueness im Chunk. Bei „false positive" (z.B. legitimer Gedankenstrich vor Großbuchstaben) auf eine andere Formulierung umstellen, nicht den Check entfernen.

**Re-Eval bestehender Pubs** (z.B. um zu kurze Reasonings nachträglich anzuheben):

```sql
-- Pubs mit defizitärem Reasoning ziehen (Beispiel: < 180 Zeichen):
SELECT id, title, press_score, length(reasoning) AS r_len
FROM publications 
WHERE analysis_status='analyzed' AND length(reasoning) < 180
ORDER BY press_score DESC LIMIT 50;
```

Dann bewerten + `--apply --force` (überschreibt bestehende Werte).

## Was das Ziel-Output erreichen soll

Das fertige Output (Pitch + Angle + Reasoning + Audience + Scores + Haiku) wird Pressereferent:innen angezeigt, nicht Entwickler:innen. Es muss:

- Lesbar sein für jemand ohne Code-Vorwissen (Fließtext, keine Notation)
- Eine **Story** anbieten, kein Datenblatt
- Eine konkrete Zielausspielung benennen (welche Outlets würden das nehmen)
- Ehrlich sein: wenn keine Story drin ist, niedriger Score und kurzes Reasoning, kein erfundener Pitch

Pub-Bewertungen sind die Eingangsschleuse für Pressestellen-Entscheidungen. Der Workflow wird nur dann nützlich, wenn die Bewertungen genau und unaufgebauscht sind.

---

**Audit-Trail-Kontext:** HANDOVER.md (Session-by-Session-Snapshots) + IMPLEMENTATION.md (Code-Map). Diese Rubrik ist die normative Quelle, der Audit ist die historische Begründung dazu.
