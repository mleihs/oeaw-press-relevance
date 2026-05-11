# Roadmap

Open work, roughly priority-sorted. Items are markers for "this would
be useful", not commitments. PRs welcome — open an issue tagged
`roadmap` before starting non-trivial work.

## Near-Term

- **Multilingual embedding pipeline** — `multilingual-e5-large` or
  `BGE-M3` as a second cluster source for the ~8% German-only pubs that
  SPECTER2 mis-clusters
- **`press_score` V2 formula** — re-weight per empirical LR
  coefficients; see [SCORING_VALIDATION.md](SCORING_VALIDATION.md)
- **`pitch_log` + `coverage` tables** — close the Find→Ship loop;
  current decision-state stops at `pitch`, no post-pitch tracking
- **Story bundles** — semantic clustering of related pubs into
  pitchable narratives

## Medium-Term

- **Drizzle ORM migration** — see
  [OSS_READINESS_PLAN.md](../OSS_READINESS_PLAN.md) Phase 3
- **Vitest unit-test coverage** for `lib/server` — Phase 4
- **Inngest / Trigger.dev** — replace Vercel SSE for >60s enrichment
  pipelines
- **Recharts theming polish** — full `currentColor` + CSS-var
  migration; some inline SVG fills still hardcoded

## Long-Term

- **Real-time multi-user collaboration** — would justify the Phoenix
  LiveView rewrite discussed in OSS_READINESS_PLAN.md §1.2
- **Multi-tenancy** — one instance serving multiple universities
- **ML hot-path via FastAPI sidecar** — only if real-time embedding
  becomes a need (currently offline batch)

## Known Limitations

- **SPECTER2 is English-trained.** German-only pubs cluster in a noise
  subspace; the UI shows a language hint as mitigation until the
  multilingual pipeline ships.
- **Vercel function timeout (60s on Pro)** breaks SSE streams for >250
  pubs per batch. Current workaround: chunked client-side calls.
- **`press_score` formula not yet empirically refit.** V1 weights are
  hypothesis-driven; V2 recommendation is in
  [SCORING_VALIDATION.md](SCORING_VALIDATION.md).
- **Manual screenshot polish.** Initial screenshots are reused from
  Playwright visual snapshots. Demo-data-polished screenshots are a
  later refresh.
