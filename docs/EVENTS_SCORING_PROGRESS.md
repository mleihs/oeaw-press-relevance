# Events Scoring — Progress (resume anchor)

Plan: `~/.claude/plans/mossy-seeking-jellyfish.md`. After `/clear`, say
"implementiere den Veranstaltungs-Scoring-Plan" → read that plan + this file, continue
from the first unchecked box. Verify each batch: `npm run typecheck && npm run lint &&
npm test`; before deploy also `check-em-dashes`, `check-schema-drift`, `build`.

Decisions: event-specific 4 dims (public_appeal 0.35 · scientific_significance 0.30 ·
reach 0.20 · timeliness 0.15); shared `runLLMBatch` + migrate all 3 (with tests).
Runner uses NEUTRAL lifecycle hooks (callers keep their own SSE event names).

## Teil 1 — shared runLLMBatch + migrate pubs & social ✅ DONE (372 tests, commit pending)
- [x] `lib/server/llm-batch.ts` (generic runner; neutral hooks onBatchStart/onError/onCancelled; pre-flight + complete stay caller-side)
- [x] `lib/server/llm-batch.test.ts` (7 tests: tally, partial-results→failed, non-fatal continue, fatal break, pre-abort, mid-run abort, hook counters)
- [x] migrated `analysis/batch.ts` (pre-flight init/budget kept; hooks → identical progress/error/complete/cancelled payloads)
- [x] migrated `social/analyze.ts` (empties pre-step kept; batchDelayMs:400; hooks → analyzing/progress/error/cancelled)
- [x] verify: 372 pass (was 365 +7); scoring + social tests green = behavior-neutral

## Teil 2 — generic scoring
- [ ] `lib/shared/scoring.ts`: `weightedScore(dims, weights)`; computePressScore delegates
- [ ] `lib/shared/event-score-weights.json` + `computeEventScore` + test

## Teil 3 — data model
- [ ] migration `…_events_analysis.sql` (analysis_status, event_score, 4 dims, pitch fields, llm_model, analysis_cost, analyzed_at, 2 indexes)
- [ ] mirror in `schema.ts` (manual); `to-api.ts` Event + eventRowToApi; sync.ts unchanged (verify)
- [ ] apply local + prod; check-schema-drift

## Teil 4 — server analyze
- [ ] `lib/server/events/prompts.ts` (system + buildEventEvaluationPrompt + JSON)
- [ ] `lib/server/events/analyze.ts` (fetchEventsForAnalysis, analyzeEvents, runEventsAnalysisBatch)

## Teil 5 — API + CLI
- [ ] `app/api/events/analyze/route.ts` (SSE)
- [ ] `lib/shared/schemas.ts`: eventsAnalyzeBatchPayloadSchema
- [ ] `scripts/analyze-events.ts` + npm `analyze-events`

## Teil 6 — UI
- [ ] generalize `components/score-bar.tsx` (ScoreBar{label,value,color} + ScoreBadge; pub adapters)
- [ ] `event-detail.tsx`: analyse-card (score hero + 4 dim bars + reasoning + provenance) + pitch-card
- [ ] `events-table.tsx`: Score column
- [ ] `event-analyze-modal.tsx` + trigger button on events page

## Teil 7 — bubbles / help / changelog
- [ ] EXPL entries + EXPL_KB_MAP deeplinks (event_*)
- [ ] `content/help/events/relevanz-score.mdx` + meta.json
- [ ] changelog entry + bump

## Deploy
- [ ] commit main → Vercel --prod; merge → chore/coolify-dockerfile → Coolify (:8088, uuid cbt2tdcwf10ia0prqk8r45bm); prod migration FIRST via psql
</content>
