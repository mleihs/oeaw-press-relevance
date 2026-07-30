# Resume: Bewerten in Batches + CI-Audit-Gate an der Wurzel fixen

Stand 2026-07-30, ~14:00 UTC. Zwei unabhängige Arbeitsgänge. Teil 1 ist Routine und
läuft immer gleich; Teil 2 ist ein einmaliger Umbau, der ansteht, weil die CI
wochenlang rot war und dabei einen echten Bug verdeckt hat.

Alle Zahlen unten sind gemessen, nicht geschätzt.

---

## Teil 1 — Bewerten in Batches

### Einstieg

```
/bewerten [pubs|events|beides] [Batchgröße]
```

Ohne Argumente: beides, Batchgröße 25. Der Befehl liest `docs/INCHAT_SCORING.md`,
dort stehen Ablauf, Rubriken, Kalibrierungsanker und Formatregeln. Dieses Dokument
ergänzt nur, was sich am Zuschnitt der Batches im Betrieb gezeigt hat.

### Stand der Pools (2026-07-30, nach dem Lauf)

| | offen |
|---|---|
| Publikationen (60-Tage-Fenster) | **0** |
| Events (Zukunft, unbewertet) | **0** |

Beide Pools sind leer. Der nächste Lauf lohnt sich erst wieder, wenn der
Nacht-Ingest neue Sätze gebracht hat, in der Praxis also nach ein paar Tagen. Ein
Blick auf die Kandidatenzahl kostet nichts:

```bash
if ! pgrep -f '5433:127.0.0.1:5432' >/dev/null; then npm run db:tunnel & sleep 3; fi
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts candidates 25 --target=prod
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod --limit=25
```

`count: 0` heißt: nichts zu tun, Lauf beenden.

### Batchgröße

25 ist der Default und für Publikationen fast immer richtig: der `content` ist
lang, und die fünf Dimensionen plus fünf Freitextfelder brauchen Platz. Über 25 wird
der Context knapp und die Texte werden zu Bausteinen, was schlimmer ist als ein
zweiter Batch.

Bei Events ist der Inhalt viel dünner, dort tragen auch 25 pro Batch problemlos.
Maßgeblich ist nicht die Anzahl, sondern wie viele davon Substanz haben.

### Lektion aus dem Lauf vom 2026-07-30: Serientermine nicht von Hand tippen

Von 35 Event-Kandidaten waren **28 identische GMI-`Monday Seminar (Internal)`** bis
Februar 2028: eine Terminserie ohne Teaser, ohne Beschreibung, nur mit wechselnden
Vortragendennamen im Organizer-Feld. Die bekommen alle dieselbe Bewertung, weil
inhaltlich nichts zu unterscheiden ist.

Solche Blöcke **per Skript erzeugen, nicht 28-mal denselben Text schreiben**. Ein
`python3`-Einzeiler über die id-Liste mit einem Bewertungs-Template ist schneller,
fehlerfrei und macht sichtbar, dass es bewusst dieselbe Bewertung ist:

```python
tpl = {"public_appeal": 0.03, "scientific_significance": 0.08, "reach": 0.03,
       "timeliness": 0.03, "pitch_suggestion": "…", "suggested_angle": "…",
       "target_audience": "Institutsangehörige", "reasoning": "…"}
out = [dict(id=i, **tpl) for i in ids]
```

Das ist keine Abkürzung um die Rubrik herum: die Bewertung wird einmal bewusst
getroffen und dann auf identische Fälle angewandt. Für alles mit eigenem Inhalt
gilt weiter, dass jeder Satz einzeln geschrieben wird.

Zwei Folgen für den Bericht am Ende:
- **Median und Mittel getrennt nennen.** Am 30.07. lag der Event-Median bei 0.046
  und das Mittel bei 0.1387, allein wegen des Seminarblocks. Der Median allein
  hätte wie eine Fehlkalibrierung ausgesehen.
- **Sagen, wie viele geflootet wurden und warum.** Sonst liest sich ein Median von
  0.046 als zu strenge Bewertung.

### Kalibrierungsanker

| Lauf | Publikationen | Events |
|---|---|---|
| 2026-07-21 | Median ~0.26, Spanne 0.124–0.523 | Mittel ~0.23 |
| 2026-07-30 | Median 0.2715, Spanne 0.1705–0.6245 | Mittel 0.1387, Median 0.046 (28 Serientermine) |

Publikationen sind über beide Läufe stabil. Weicht ein neuer Batch beim Median um
mehr als etwa 0.05 ab, ohne dass die Zusammensetzung das erklärt, ist das ein
Signal zum Nachrechnen, nicht zum Weitermachen.

### Nachkontrolle

```sql
SELECT count(*) FROM publication_scoring_candidates
 WHERE created_at >= now() - interval '60 days';   -- soll 0
SELECT count(*) FROM event_scoring_candidates;      -- soll 0
```

### Ausdrücklich nicht Teil davon

- **Der Publikations-Altbestand** (rund 3.500, überwiegend 2023). `--all` würde ihn
  öffnen; in-chat wären das ~50 Sitzungen. Empfehlung steht in
  `docs/RESUME_SCORING_SPLIT_CODEREVIEW.md` §5: ein CLI-Lauf über OpenRouter für
  25–40 USD.
- **Kein OpenRouter** für den In-Chat-Weg, weder der Knopf in der App noch
  `npm run analyze-events`.
- **Kein Cloud-Write.** Nur der VPS ist kanonisch, der 03:30-Mirror trägt nach.

---

## Teil 2 — CI-Audit-Gate an der Wurzel fixen

### Warum das ein eigener Arbeitsgang ist

Die CI war bei **jedem** Push seit mindestens 2026-07-21 rot, aus zwei
voneinander unabhängigen Gründen. Der erste war ein echter Bug im RLS-Smoke-Test
und ist am 2026-07-30 mit `5899832` behoben. Der zweite ist der `npm audit`-Schritt,
und der ist noch offen.

Der eigentliche Schaden war nicht der Bug und nicht die Advisories, sondern die
Kombination: **eine dauerhaft rote Pipeline hat wochenlang einen echten
Testfehler verdeckt.** 715 Tests liefen durch, die Suite scheiterte trotzdem, und
niemand hat hingesehen, weil rot der Normalzustand war. Ein Gate, das immer rot
ist, hat negativen Wert. Das ist der Defekt, der behoben werden muss.

### Die Wurzel: das Gate kann nur eine Sache ausdrücken

Aktuell in `.github/workflows/ci.yml`:

```yaml
# postcss-via-next is moderate and blocked upstream (no fix available);
# gate fails only on high+ vulnerabilities so that local moderate-blockers
# don't permanently red the build. Re-evaluate when next.js bumps postcss.
- name: Audit (high+ only)
  run: npm audit --audit-level=high
```

Der Kommentar dokumentiert genau das Problem. Es gab schon einmal ein
upstream-blockiertes Advisory, und die einzige verfügbare Reaktion war, die
Schwelle **global** zu senken. Das Gate hat exakt einen Hebel, einen
Severity-Schwellwert für alles. Als dieselben Advisories später auf `high`
hochgestuft wurden, war der Hebel verbraucht, und die Pipeline ging dauerhaft rot.

Ein Severity-Schwellwert ist die falsche Achse. Die richtige Frage ist nicht „wie
schlimm", sondern **„ist das gesichtet, und ist ein Fix überhaupt erreichbar"**.

### Messung: Grün-durch-Upgraden ist nicht erreichbar

Alles am 2026-07-30 gegen den echten Dependency-Graph gemessen (per
`--package-lock-only`, danach zurückgesetzt):

1. **`next` 16.2.9 → 16.2.12** liegt innerhalb von `^16.2.4`, braucht also kein
   Override, und räumt die **sieben Next-Advisories** weg (SSRF in Server Actions,
   Cache-Confusion, Image-Optimization-DoS, Offenlegung interner
   Server-Function-Endpunkte). **Das ist echter Sicherheitsgewinn und sollte
   unabhängig vom Gate passieren.**
2. **Danach bleiben `postcss` und `sharp` high**, weil `next` sie selbst pinnt:
   `postcss@8.4.31` als direkte Dependency (Fix erst ab 8.5.18) und
   `sharp@^0.34.5` als optionalDependency (Fix ab 0.35.0). npm nennt als
   `fixAvailable` allen Ernstes **`next@9.3.3`**, einen Major-Downgrade. Es gibt
   also keinen Vorwärts-Fix.
3. **`overrides` für postcss und sharp lösen diese drei Einträge** (high 6 → 3).
   Sie erzwingen aber Versionen, gegen die das Framework nicht getestet hat, und
   sharp sitzt im Image-Optimization-Pfad.
4. **Der Rest (`brace-expansion`, `fast-uri`, `js-yaml`) meldet
   `fixAvailable: true`, aber `npm audit fix` macht es schlimmer:** danach standen
   **neun** high-Einträge quer durch die eslint-Kette (`@eslint/config-array`,
   `eslint-plugin-*`, `minimatch`). Gemessen, nicht vermutet.

**Schluss daraus: es gibt keinen Zustand dieses Dependency-Graphen, der
gleichzeitig grün und ehrlich ist.** Ein Gate, das Grün verlangt, ist deshalb
dauerhaft entweder rot oder verlogen. Genau deshalb reicht ein Dependency-Bump
nicht als Fix.

### Entwurf: gesichtete, befristete Ausnahmen statt globaler Schwelle

Zwei Dateien, nach dem Muster der bestehenden Gates (`scripts/check-schema-drift.mjs`,
`scripts/check-em-dashes.sh`): Kopfkommentar mit dem Warum und der bewussten
Heuristik, sprechender Fehlertext mit Handlungsanweisung, Zählzeile im Erfolgsfall,
Exit 1.

```
scripts/check-advisories.mjs      Gate: npm audit --json einlesen, Policy anwenden
scripts/advisory-policy.json      Die Entscheidungen, deklarativ und reviewbar
```

Verdrahtung: `npm run check-advisories` in `package.json`, in `ci.yml` den Schritt
`Audit (high+ only)` ersetzen, samt dem dann veralteten Kommentar.

Policy-Eintrag:

```json
{
  "floor": "high",
  "accepted": [
    {
      "advisory": "GHSA-qx2v-qp2m-jg93",
      "package": "postcss",
      "scope": "node_modules/next/node_modules/postcss",
      "reason": "next pinnt postcss 8.4.31 als direkte Dependency, Fix erst ab 8.5.18. Build-Zeit-Werkzeug, liegt in keinem Request-Pfad.",
      "no_forward_fix": true,
      "review_by": "2026-10-31"
    }
  ]
}
```

**Das Gate fällt bei genau drei Bedingungen.** Die zweite und dritte sind der
Grund, warum das kein Ignorier-Mechanismus ist:

1. **Ein Advisory ab `floor` ohne Policy-Eintrag.** Neu und ungesichtet, also rot.
   Das ist der eigentliche Zweck.
2. **Ein Eintrag, dessen `review_by` verstrichen ist.** Erzwingt erneute Sichtung.
   Ohne das verrottet die Datei still, und wir hätten den heutigen Zustand mit
   mehr Schritten.
3. **Ein Eintrag, der auf nichts mehr passt.** Die Ausnahme ist gegenstandslos und
   muss gelöscht werden. Derselbe Gedanke wie beim Schema-Drift-Check: die Datei
   darf kein Friedhof werden.

Zusammen heißt das: grün nur, solange **jedes** akzeptierte Risiko aktuell
begründet **und** aktuell real ist.

Zwei Entwurfsentscheidungen, die begründet gehören:

- **`scope` statt nur `package`.** Ein Eintrag „postcss hat ein XSS" würde auch
  eine später hinzukommende *direkte* Abhängigkeit auf ein verwundbares postcss
  mitakzeptieren. Die Ausnahme gilt nur an der Stelle, an der sie upstream
  erzwungen ist. Der Preis ist Brüchigkeit: `npm audit --json` liefert diese Pfade
  unter `nodes`, und die verschieben sich beim Dedup. Bewusste Heuristik, im
  Kopfkommentar so zu benennen, wie es `check-schema-drift.mjs` mit seinen Regexen
  auch tut.
- **Keine neue Dependency.** `audit-ci` und `better-npm-audit` können das, aber sie
  bringen genau das mit, was hier gerade das Problem ist: mehr transitive
  Abhängigkeiten in der Kette, die das Gate prüfen soll. Ein Skript über
  `npm audit --json` ist knapp 100 Zeilen und passt zur bestehenden Konvention.

### Was ausdrücklich nicht der Weg ist

- **Die Schwelle noch einmal senken** (`--audit-level=critical`). Verschiebt das
  Problem um eine Stufe und verliert dabei jede Aussage.
- **`continue-on-error: true`.** Stellt den Zustand wieder her, den wir gerade
  reparieren: ein Schritt, auf den niemand schaut.
- **Den Schritt löschen.** Dann fällt auch das echte neue Advisory nicht mehr auf.
- **`npm audit fix --force`.** Zieht Major-Bumps quer durch den Graph, siehe
  Messung 4.

### Reihenfolge

1. **`next` auf 16.2.12** (`npm install next@16.2.12`), dann `npm run typecheck`,
   `npm run lint`, `npm run test:coverage`, `npm run build`. Unabhängig vom Gate
   richtig. **Achtung: der Lockfile-Bump geht beim nächsten Build auf Prod**, also
   Vercel und metaspots, nicht nur in die CI.
2. **Overrides entscheiden.** Empfehlung: postcss ja (reines Build-Zeug, Minor-Bump);
   bei sharp vorher `next/image` gegen eine echte Bilddatei prüfen, sonst per Policy
   akzeptieren statt erzwingen. Beides ist verteidigbar, aber es sollte eine
   bewusste Entscheidung sein und in der `reason` stehen.
3. **Gate und Policy bauen**, `ci.yml` umstellen, alten Kommentar entfernen.
4. **Das Gate selbst testen.** Ein Gate, von dem man nicht gezeigt hat, dass es
   rot werden kann, ist wertlos. Also nachweisen: Policy-Eintrag löschen → rot;
   `review_by` zurückdatieren → rot; erfundenen Eintrag hinzufügen → rot
   (Bedingung 3). Erst dann ist der Umbau fertig.

### Abnahmekriterien

- [ ] `next@16.2.12` installiert, typecheck/lint/test/build grün
- [ ] `npm run check-advisories` läuft lokal grün und nennt die Zahl der
      akzeptierten Ausnahmen im Erfolgsfall
- [ ] Jeder Policy-Eintrag hat `reason` und `review_by`, kein Eintrag ohne beides
- [ ] Alle drei Fehlerbedingungen einmal absichtlich provoziert und rot gesehen
- [ ] `ci.yml` nutzt das Gate, der Schritt bleibt **required** (kein
      `continue-on-error`)
- [ ] Ein Push nach main ist grün, und zwar in allen Schritten

### Danach

Die rote CI-Mail bekommt ihre Aussagekraft zurück. Bis dahin gilt: bei einer
Fehlermeldung erst `gh run view <id>` und schauen, **welcher Schritt** rot ist.
Audit ist bekannt, alles andere ist neu.
