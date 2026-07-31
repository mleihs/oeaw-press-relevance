# Resume: Bewerten in Batches + CI-Audit-Gate an der Wurzel fixen

Stand 2026-07-31. Zwei unabhängige Arbeitsgänge. Teil 1 ist Routine und
läuft immer gleich; Teil 2 war ein einmaliger Umbau, der anstand, weil die CI
wochenlang rot war und dabei einen echten Bug verdeckt hat.

**Teil 1: nichts offen** (zuletzt 2026-07-31: 11 frische Publikationen gescort,
danach beide Pools 0).
**Teil 2: erledigt**, Record unten unter „Was tatsächlich gebaut wurde". Der
Abschnitt darüber ist der Plan von vorher und bleibt als Begründung stehen; wo die
Messung ihn korrigiert hat, steht das im Record.

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

### Stand der Pools (2026-07-31, nach dem Lauf)

| | offen |
|---|---|
| Publikationen (60-Tage-Fenster) | **0** |
| Events (Zukunft, unbewertet) | **0** |

Beide Pools sind leer. **Die Faustregel „nach ein paar Tagen" hat sich am
2026-07-31 bestätigt:** einen Tag nach dem 0/0-Stand lagen 11 neue Publikationen
im Pool, Events blieben bei 0. Ein Blick auf die Kandidatenzahl kostet nichts und
lohnt daher schon nach einem Nacht-Ingest:

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
| 2026-07-31 | Median 0.265, Spanne 0.166–0.583 | Pool leer |

Publikationen sind über alle drei Läufe stabil (Median 0.26 / 0.2715 / 0.265).
Weicht ein neuer Batch beim Median um mehr als etwa 0.05 ab, ohne dass die
Zusammensetzung das erklärt, ist das ein Signal zum Nachrechnen, nicht zum
Weitermachen.

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
   Override, und räumt die Next-Advisories weg (SSRF in Server Actions,
   Cache-Confusion, Image-Optimization-DoS, Offenlegung interner
   Server-Function-Endpunkte). Sollte unabhängig vom Gate passieren.
   *(Korrektur 2026-07-31: es waren **neun**, nicht sieben — und keines davon war
   hier erreichbar, s. „Was der Bump wirklich gebracht hat" unten.)*
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

- [x] `next@16.2.12` installiert, typecheck/lint/test/build grün
- [x] `npm run check-advisories` läuft lokal grün und nennt die Zahl der
      akzeptierten Ausnahmen im Erfolgsfall
- [x] Jeder Policy-Eintrag hat `reason` und `review_by`, kein Eintrag ohne beides
- [x] Alle drei Fehlerbedingungen einmal absichtlich provoziert und rot gesehen
- [x] `ci.yml` nutzt das Gate, der Schritt bleibt **required** (kein
      `continue-on-error`)
- [x] Ein Push nach main ist grün, und zwar in allen Schritten
      (`b4422b5`, Run `30542005386`: alle 13 Schritte grün, der neue Step meldet
      „Advisory-Gate OK: 3 Advisory/Advisories ab high, alle durch 3 gesichtete
      Ausnahme(n) gedeckt")

---

## Was tatsächlich gebaut wurde (2026-07-30, 15:30 UTC)

Der Plan oben stimmt in der Achse und im Aufbau. Drei Dinge hat die Messung
korrigiert, alle drei zum Besseren:

**1. Vier Overrides statt einem — vier der fünf Rest-Advisories waren doch
wegzuräumen.** Der Plan hatte nur postcss als Override-Kandidaten. Gemessen
(`--package-lock-only`, Satz für Satz) räumen gezielte Overrides auch `fast-uri`
(3.1.3 → 3.1.4, ein Patch) und `js-yaml` (5.2.0 → 5.2.2, scoped auf
`fumadocs-core`/`fumadocs-mdx`) weg:

| Override-Satz | high |
|---|---|
| keiner, nur next@16.2.12 | 6 |
| + postcss `^8.5.25` | 5 |
| + fast-uri `^3.1.4` | 4 |
| + js-yaml `^5.2.2` (scoped) | 3 |

Die Kaskade aus Messung 4 des Plans kam **nicht** von Overrides als Mittel,
sondern von npms Versions-Selektor-Keys: `"brace-expansion@1"` / `"@5"` als
Override-Key hat den Baum so umgehängt, dass `node_modules/minimatch` auf eine
verwundbare Version gehoistet wurde und die halbe eslint-Kette mitkam (6 → 11
high). Ohne Selektor-Keys passiert das nicht. **Merksatz: Overrides ohne
`pkg@range`-Keys schreiben, sonst re-resolved npm den Baum.**

**2. `brace-expansion` ist per Override nicht lösbar und deshalb Policy.** Ein
globales `"brace-expansion": "^5.0.9"` bringt high auf 2, zwingt aber
`minimatch@3.1.5` (erwartet den 1.x-Default-Export) auf 5.x. Ergebnis: `npm run
lint` crasht mit `TypeError: expand is not a function`. Deshalb zwei
Policy-Einträge statt eines Overrides. Nebenbefund aus derselben Runde: **ein
inkrementelles `npm install` nach einer Override-Änderung fortschreibt das
Lockfile in einen schlechteren Baum** — Lockfile aus dem Ausgangszustand neu
auflösen (`npm install --package-lock-only`) und mit `npm ci` installieren, sonst
misst man ein Artefakt.

**3. `no_forward_fix` ist weggefallen.** Das Feld aus dem Plan-Entwurf hätte das
Gate nicht auswerten können: `npm audit` meldet für brace-expansion
`fixAvailable: true`, obwohl es keinen gibt. Ein Feld, das das Gate ignoriert,
verrottet — die Aussage steht jetzt in der `reason`. Pflichtfelder sind
`advisory`, `package`, `scope`, `reason`, `review_by`; fehlt eines, ist der
Eintrag ungültig und deckt nichts mehr.

### Endstand

- `next` 16.2.9 → **16.2.12** (räumt **neun** Next-Advisories weg). 13 high → 6.
- `overrides` in `package.json`: postcss, fast-uri, js-yaml (scoped ×2). 6 → 3.
- `scripts/check-advisories.mjs` + `scripts/advisory-policy.json`, `ci.yml` nutzt
  `npm run check-advisories` als **required** Step.
- **Drei akzeptierte Ausnahmen**, alle mit `review_by: 2026-10-31`: zwei
  brace-expansion-Advisories (Build-/Dev-Zeit-Pfade, kein Vorwärts-Fix ohne eslint
  zu brechen) und die sharp-libvips-CVEs. sharp ist bewusst Policy statt Override:
  `next/image` wird im ganzen Repo **nicht** importiert und `next.config.ts` setzt
  keine `images.remotePatterns` — der Pfad, der sharp aufrufen würde, ist nicht
  erreichbar.

### Nachweis, dass das Gate rot werden kann

Alle Bedingungen provoziert und mit Exit 1 gesehen, danach wiederhergestellt und
wieder grün:

| Provokation | Ergebnis |
|---|---|
| sharp-Eintrag gelöscht | Bedingung 1, nennt Advisory + Pfade |
| `review_by` auf 2026-01-31 | Bedingung 2 |
| erfundener Eintrag | Bedingung 3 |
| richtiges Advisory, falscher `scope` | Bedingungen 1 **und** 3 — die `scope`-Achse deckt nicht versehentlich mit |
| `reason` gelöscht | Eintrag ungültig, deckt nichts mehr |

### Was der Bump wirklich gebracht hat (nachgeprüft 2026-07-31)

Auf die Frage „hat das der App etwas gebracht" ehrlich nachgemessen. Es waren
**neun** Next-Advisories, nicht sieben (Liste im CI-Log von Run `30540112261`) —
und **keines davon war in dieser App erreichbar**:

| Advisory-Gruppe | erreichbar? |
|---|---|
| 5× Server Actions / Server Functions (DoS, SSRF auf custom servers, unbounded payload, Endpunkt-Offenlegung) | **nein** — `"use server"` kommt im Repo 0× vor |
| 1× Image-Optimization-DoS via SVG | **nein** — `next/image` wird nirgends importiert |
| 1× Middleware/Proxy-Bypass (GHSA-6gpp-xcg3-4w24) | **nein** — verlangt `config.i18n.locales` mit genau einem Eintrag; die App hat gar keine i18n-Konfiguration |
| 2× Cache-Confusion (GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q) | **nein** — verlangt das Muster `fetch(new Request(init), anderesInit)`; kommt im Code nicht vor |
| 1× SSRF in rewrites | **nein** — `next.config.ts` definiert keine `rewrites()` |

Der Bypass wäre der ernste Fall gewesen, weil `proxy.ts` das Passwort-Gate *ist*
und vor jeder Route läuft. Er greift hier nicht.

**Fazit: der Sicherheitsgewinn war vorsorglich, nicht das Schließen eines offenen
Lochs.** Der eigentliche Ertrag der Sitzung ist die wieder aussagekräftige CI. Das
ist kein Argument gegen den Bump — nur gegen die Formulierung „echter
Sicherheitsgewinn" weiter oben, die ungeprüft war.

### Nachtrag: In-Range-Sweep am selben Tag, und Bedingung 3 im echten Betrieb

Direkt nach dem Umbau ein `npm update` über alle 35 In-Range-Pakete (nur Lockfile,
`package.json` unberührt). Danach sind alle Nicht-Major-Pakete aktuell; offen
bleiben acht bewusste Entscheidungen: `eslint` 10, `typescript` 7, `@types/node`
26, `react-day-picker` 10, `temporal-polyfill` 1.0.2 (an Schedule-X gebunden) und
`@schedule-x/*` 4.6.1 (exakt gepinnt).

**Dabei ist das Gate rot geworden, und zwar richtig.** Der Sweep hat
`brace-expansion` an den drei verschachtelten Pfaden auf 5.0.9 gehoben; damit war
**GHSA-3jxr-9vmj-r5cp echt behoben** und der Policy-Eintrag gegenstandslos.
Bedingung 3 hat genau das gemeldet, mit Verweis auf den Eintrag. Das ist der erste
Einsatz im Betrieb statt im Test, und er zeigt den Zweck: ohne diese Bedingung wäre
die Ausnahme als Karteileiche stehen geblieben und hätte künftig ein echtes
Advisory mitgedeckt.

Endstand danach: **2 Advisories, 2 Ausnahmen.** Übrig bei brace-expansion ist nur
der gehoistete Pfad, den `eslint 9.39.5` über `minimatch@3.1.5` zieht — 1.1.18 ist
die letzte 1.x und liegt weiter im Range. Bemerkenswert: `npm audit` nennt jetzt
als `fixAvailable` **`eslint@10.8.0`**. Der Vorwärts-Fix ist also der
eslint-10-Umstieg, den `docs/AUDIT_REMEDIATION_PLAN.md` bewusst aufschiebt. Beim
`review_by` am 2026-10-31 ist das die Frage, die zu entscheiden ist.

### Danach

Die rote CI-Mail bekommt ihre Aussagekraft zurück. Bis dahin gilt: bei einer
Fehlermeldung erst `gh run view <id>` und schauen, **welcher Schritt** rot ist.
Audit ist bekannt, alles andere ist neu.
