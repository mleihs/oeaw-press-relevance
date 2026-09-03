# Resume: Refactor deployen, dann Publikationen + Events bewerten

> **ERLEDIGT am 2026-07-31 — historisches Dokument, NICHT erneut ausführen.**
> Teil 1 (Deploy) lief am 2026-07-30, Teil 2 (Bewerten) am 2026-07-31
> (11 Pubs, danach beide Pools 0; s. `docs/RESUME_BEWERTEN_UND_CI.md`). Auch
> die beiden Punkte unter „Randnotiz" sind inzwischen behoben
> (Leerfeed-Klassifikation + Drift-Schwelle, 2026-08-26/31).

Stand 2026-07-30, ~11:45 UTC. Zwei getrennte Arbeitsgänge in dieser Reihenfolge:
**erst deployen** (der Refactor liegt nur lokal), **dann bewerten**.

Alle Zahlen unten sind gegen Prod gemessen, nicht geschätzt.

---

## Teil 1 — Deploy (2 Commits, noch nicht gepusht)

```
d0b5983 docs(scoring): In-Chat-Ablauf auf ein Dokument ziehen, /bewerten verschlanken
25db4d5 refactor(scoring): session-pipeline auf die geteilte DB-Schicht heben
```

Der Refactor betrifft nur Skripte und Doku plus zwei App-Dateien
(`lib/shared/scoring.ts`, `lib/server/analysis/score.ts`) — dort ist die
Press-Score-Formel jetzt single-sourced, das Verhalten ist bit-identisch
(verifiziert: dieselben Dims ergeben weiterhin 0.415). Ein Deploy ist trotzdem
richtig, damit Prod und Repo nicht auseinanderlaufen.

### 1a — Vercel (Hot-Standby)

```bash
git push origin main
```

### 1b — metaspots (kanonische Prod)

⚠️ **`push origin main` deployt metaspots NICHT.** Coolify baut aus dem Branch
`chore/coolify-dockerfile`. Ablauf über den Worktree:

```bash
cd /Users/mleihs/Dev/coolify-wt
git fetch origin
git merge origin/main
git push origin chore/coolify-dockerfile
```

Dann den Build anstoßen. Die Coolify-API ist **nur on-box** erreichbar:

```bash
TOKEN=$(cat ~/.config/metaspots/coolify-api.token)
ssh metaspots "curl -s 'http://127.0.0.1:8000/api/v1/deploy?uuid=cbt2tdcwf10ia0prqk8r45bm' \
  -H 'Authorization: Bearer $TOKEN'"
```

Fertig, wenn Coolify „Deploy finished / healthy" meldet.

---

## Teil 2 — Bewerten (Einstieg: `/bewerten`)

Ablauf, Rubriken, Kalibrierungsanker und Formatregeln stehen vollständig in
**`docs/INCHAT_SCORING.md`**. Hier nur der Zuschnitt für diesen Lauf.

### Gemessener Pool (2026-07-30, Prod)

| | offen | Zuschnitt |
|---|---|---|
| Publikationen (60-Tage-Fenster) | **14** | ein Batch, jüngster Eingang 2026-07-29 |
| Events (Zukunft, unbewertet) | **35** | zwei Batches à ~18, Termine bis 2028-02-07 |
| Publikations-Altbestand | 3.537 | **nicht anfassen**, siehe unten |

### Schritt 0 — Tunnel

```bash
if ! pgrep -f '5433:127.0.0.1:5432' >/dev/null; then npm run db:tunnel & sleep 3; fi
```

Danach jedem Prod-Befehl `PROD_DB_TUNNEL=1` voranstellen. **Kein**
`NODE_TLS_REJECT_UNAUTHORIZED=0`, **kein** `export PG_DATABASE_URL` — beides ist
seit dem Refactor überflüssig.

### Publikationen (1 Batch)

```bash
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts candidates 25 --target=prod
```

Das 60-Tage-Fenster ist der Default; **kein `--imported-after` mehr nötig**.
Bewerten nach `lib/server/analysis/prompts.ts`, JSON schreiben, dann:

```bash
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts apply /tmp/pubs-batch-1.json --target=prod
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts apply /tmp/pubs-batch-1.json --target=prod --apply
```

Der zweite Befehl fragt vor dem Prod-Write nach und zeigt dabei die echte
Ziel-URL (`…@127.0.0.1:5433/postgres`). Steht dort etwas anderes: abbrechen.

### Events (2 Batches)

```bash
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod --limit=18
```

Bewerten nach `lib/server/events/prompts.ts`, **kein Haiku**, flaches JSON-Array,
dann:

```bash
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --file=/tmp/events-batch-N.json
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --yes --apply --file=/tmp/events-batch-N.json
```

Unter den 35 sind erfahrungsgemäß mehrere GMI-Seminare mit dem Platzhalter
`Title to be announced`. Die bewusst niedrig bewerten (0.09–0.11 ist der
etablierte Anker) — sie fallen automatisch in den Pool zurück, sobald ein echter
Titel per `sync-events` ankommt. Nicht manuell nachhalten.

### Nach jedem Batch

Median, Spanne und die Ausreißer nach oben berichten, nicht nur „fertig". Zum
Abgleich der Kalibrierung: der Lauf vom 2026-07-21 lag bei Median ~0.26 (Pubs,
Spanne 0.124–0.523) und ~0.23 im Mittel (Events).

### Nachkontrolle

```sql
SELECT count(*) FROM publication_scoring_candidates
 WHERE created_at >= now() - interval '60 days';   -- soll 0
SELECT count(*) FROM event_scoring_candidates;      -- soll 0
```

---

## Ausdrücklich NICHT Teil davon

- **Der Publikations-Altbestand** (3.537, überwiegend 2023). `--all` würde ihn
  öffnen; als In-Chat-Aufgabe wären das ~50 Sitzungen. Empfehlung steht in
  `docs/RESUME_SCORING_SPLIT_CODEREVIEW.md` §5: ein CLI-Lauf über OpenRouter für
  25–40 USD.
- **Kein OpenRouter** für diesen Lauf: weder der „Bewerten"-Knopf noch
  `npm run analyze-events`. Beides ist der Fallback, nicht der Weg.
- **Kein Cloud-Write.** Nur der VPS ist kanonisch; der 03:30-Mirror trägt die
  Scores automatisch in den Supabase-Warm-Standby.

---

## Nebenbefund: Zustand der Nacht-Jobs (2026-07-30)

Alle fünf Timer auf metaspots sind `enabled` und geplant:

| Timer | UTC | letzter Lauf |
|---|---|---|
| `oeaw-db-backup` | 02:35 | heute ✅ |
| `oeaw-db-mirror` | 03:30 | heute ✅ |
| `oeaw-export-archive` | 04:15 | noch nie, neu eingerichtet |
| `oeaw-press-ingest` | 04:31 (06:31 Wien) | heute 07:44 **manuell**, OK (359s) |
| `oeaw-press-embeddings` | 05:01 | heute ✅ |

Zwei Punkte:

1. Der Ingest-Timer wurde heute 09:14 neu geladen (Verschiebung 04:00 → 04:31,
   weg vom unattended-upgrades-Reboot um 04:00). Deshalb gab es am 29. und 30.
   **keinen automatischen** Lauf; der aktuelle Datenstand stammt aus dem
   Handlauf um 07:44. Ab 2026-07-31 04:31 UTC läuft er wieder von selbst.
   **Am Morgen des 31. einmal nachsehen, ob der erste automatische Lauf am
   neuen Zeitpunkt durchgeht.**
2. Der letzte automatische Lauf (28.07., 04:00) brach mit
   `event_news_grouped failed: Feed enthält keine Institutsgruppe` ab und löste
   Alarm aus. Das ist die bekannte offene Ursache: ein Leerfeed wird in
   `lib/server/ingest/run-events-import.ts` (`classifyEmptyFeed`) fälschlich als
   `failed` statt `skipped` klassifiziert. Eigener Arbeitsgang, zusammen mit der
   zu engen `DRIFT_ALARM_THRESHOLD = 25` (real bis 91 gemessen).
