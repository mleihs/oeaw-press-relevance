# Events Scoring — Progress (resume anchor)

Plan: `~/.claude/plans/mossy-seeking-jellyfish.md`. After `/clear`, say
"implementiere den Veranstaltungs-Scoring-Plan" → read that plan + this file, continue
from the first unchecked box. Verify each batch: `npm run typecheck && npm run lint &&
npm test`; before deploy also `check-em-dashes`, `check-schema-drift`, `build`.

Decisions: event-specific 4 dims (public_appeal 0.35 · scientific_significance 0.30 ·
reach 0.20 · timeliness 0.15); shared `runLLMBatch` + all 3 migrated; **model = deepseek**
(user pref). Research verdict: LLM-only is right for v1 (no SPECTER2-equivalent for events;
cold-start blocks a similarity signal) — embeddings deferred.

## Teil 1 — shared runLLMBatch + migrate pubs & social ✅ DONE (commit e5a9a54)
## Teil 2 — generic scoring ✅ DONE
- weightedScore + computePressScore delegate; event-score-weights.json; computeEventScore + tests (8 pass)
## Teil 3 — data model ✅ DONE (migration applied to PROD; schema-drift OK)
- migration 20260616000001; schema.ts mirror; to-api Event+mapper; sync.ts unchanged
## Teil 4 — server analyze ✅ DONE
- events/prompts.ts (4-dim rubric, DE, html-stripped content); events/analyze.ts (fetch/analyze/runEventsAnalysisBatch on runLLMBatch, clamp01)
## Teil 5 — API + CLI ✅ DONE (smoke: 3 prod events via deepseek = $0.002, sensible scores)
- app/api/events/analyze/route.ts (SSE); eventsAnalyzeBatchPayloadSchema; scripts/analyze-events.ts + npm analyze-events

## Teil 6 — UI ✅ DONE
- [ ] generalize `components/score-bar.tsx` → `ScoreBar({label,value,color})` + `ScoreBadge`; keep pub adapters
- [ ] `event-detail.tsx`: analyse-card (score hero + 4 dim bars + reasoning + provenance) + pitch-card
- [ ] `events-table.tsx`: Score column (ScoreBadge when analyzed)
- [ ] `event-analyze-modal.tsx` (model picker default **deepseek**, SSE via sse-progress) + trigger button on events page
- [ ] (optional) "nach Relevanz sortieren" toggle

## Teil 7 — bubbles / help / changelog ✅ DONE
- [ ] EXPL entries + EXPL_KB_MAP deeplinks (event_score, event_public_appeal, event_significance, event_reach, event_timeliness, event_pitch, event_angle, event_audience, event_reasoning, event_ai_provenance)
- [ ] content/help/events/relevanz-score.mdx + meta.json
- [ ] changelog entry + bump

## Deploy ⬜ NEXT
- [ ] commit; Vercel --prod; merge → chore/coolify-dockerfile → Coolify (:8088, uuid cbt2tdcwf10ia0prqk8r45bm). Prod migration ALREADY applied.
- [ ] (optional) full prod scoring run via `npm run analyze-events -- --target=prod --yes` once UI is live
</content>
