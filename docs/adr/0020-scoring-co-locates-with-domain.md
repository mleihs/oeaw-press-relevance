---
date: 2026-06-30
status: accepted
deciders: Phase-2 audit-remediation session
supersedes: none
---

# 0020 — LLM scoring co-locates with its domain; `publications` keeps `analysis/`

## Context

Three features run an OpenRouter scoring pass. Two live inside their domain
module — `lib/server/events/analyze.ts`, `lib/server/social/analyze.ts` —
while publication scoring sits in a separate `lib/server/analysis/` namespace
(`batch.ts`, `analyze.ts`, `prompts.ts`, `score.ts`). The Phase-2 audit flagged
the asymmetry: either move publication scoring into `lib/server/publications/`,
or hoist the events/social analyzers up into
`lib/server/analysis/{events,social}.ts`.

## Decision

Neither move. The going-forward rule is **scoring co-locates with its domain
feature module** (events + social already do). Publication scoring stays in
`lib/server/analysis/` as a named, accepted exception:

- `analysis/` predates the events/social features and is a substantial
  sub-system (batch runner, prompt builder, the press-score formula +
  `score.test.ts`). Folding it into the already-large `publications/` domain is
  pure import-churn with zero functional gain — the ADR 0008 maxim, "never
  extract (or move) for symmetry alone".
- Hoisting events/social UP into `analysis/` is worse: it breaks their clean
  co-location and contradicts ADR 0008's "stay flat at the feature level".
- `lib/server/analysis/` reads as the *press-relevance scoring* domain in its
  own right; the name is not a publications implementation detail.

The generic batch machinery (`lib/server/llm-batch.ts`, incl. the shared
`preflightBalance`) is domain-neutral and stays put — all three call it.

## Consequences

- ✅ No churn; the single asymmetry is documented, not silently tolerated.
- ✅ New scoring features co-locate with their domain (the events/social
  precedent), so the rule is forward-stable.
- ⚠️ A reader looking for publication scoring under `publications/` finds it in
  `analysis/`; this ADR is the signpost.
- ↔️ If `analysis/` ever grows a second domain's scoring inline (rather than via
  `llm-batch.ts`), re-open this.

## References

- ADR 0008 (domain-modules deferred — same "don't move for symmetry" maxim)
- `lib/server/analysis/`, `lib/server/events/analyze.ts`,
  `lib/server/social/analyze.ts`, `lib/server/llm-batch.ts`
- `docs/AUDIT_REMEDIATION_PLAN.md` §2.3
