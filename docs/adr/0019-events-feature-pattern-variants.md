---
date: 2026-05-26
status: accepted
deciders: session (Matthias + Claude)
supersedes: none
---

# 0019 — Events-feature pattern variants (single-table SourceAdapter + generic EntityFlag)

## Context

The `/events` route mirrors a single TYPO3 table
(`tx_news_domain_model_news WHERE is_event=1`) into Postgres and adds
the same flag-notes + decision-state triage UX that publications
already have. Naively applying the existing patterns would mean:

- Pulling events through the full ADR 0017 `SourceAdapter<Raw>` →
  `CanonicalBatch` pipeline + `loader.ts` + `upsert.ts`. That apparatus
  exists for a 10-table relational graph (publications, persons,
  orgunits, projects, lectures, junctions, lookups) where
  junction-table consistency has to survive a transaction. Events are
  one table with no junctions.
- Copy-and-adapting the 270-line `components/publication-flag.tsx` to
  `components/event-flag.tsx`. That works but duplicates the popover
  state, the same-name dedup, the open-time reviewer-name reload, the
  mutation/invalidation pair, and the four-incident-fix history baked
  into the file. A change to the flag UX would need to land twice.

Both routes break the principle the project keeps coming back to:
"three similar lines is better than a premature abstraction" — but
also "don't copy 270 lines when one prop varies."

## Decision

Two narrow variants, both scoped to "events landed and a third
consumer didn't yet show up."

### A. Single-table SourceAdapter variant

`lib/server/ingest/adapters/typo3-events.ts` implements the **valuable
half** of ADR 0017 — pure synchronous `normalize(raw)` — without the
`CanonicalBatch` / `loader.ts` / `upsert.ts` apparatus. It exports a
`fetchTypo3Events()` (mysql2 connection lifecycle, one SELECT) and a
`normalizeTypo3Event(raw)` (pure mapping). The DB write is one Drizzle
`onConflictDoUpdate` in the feature layer (`lib/server/events/sync.ts`),
not via the shared loader.

The adapter still **shares with WebDB**:

- `webdbMysqlConfigFromEnv()` from `adapters/webdb.ts` (a small
  extension reads `WEBDB_MYSQL_*` first with a legacy `MYSQL_*`
  fallback so both the script and the app land at the same container).
- `tsTimestamp` + `nullIfEmpty` from `adapters/webdb-normalize.ts`
  (exported for cross-adapter reuse).

### B. Generic EntityFlag component

`components/entity-flag.tsx` extracts the full popover + mutation logic
from `publication-flag.tsx`. `publication-flag.tsx` becomes a 30-line
wrapper that passes the publication-specific bindings (apiBase,
invalidation keys, InfoBubble id). `app/events/_components/event-flag.tsx`
is a parallel wrapper with the event-specific bindings plus an
`extraPopoverContent` slot for the docked `<EventDecisionButtons>`
(decision-toolbar variant; see below).

Affected call sites of `<PublicationFlag>`: 4 (publication-table.tsx
×2, dashboard-client.tsx, detail-client.tsx). Wrapper preserves the
exact props shape, so no call-site changes needed.

## Consequences

- ✅ One source of truth for the flag UX. A fix to the popover state
  machine, the open-time reviewer reload, or the dedup rules lands in
  `entity-flag.tsx` only.
- ✅ Events normalisation is unit-testable in isolation
  (`typo3-events.test.ts`, 6 cases, no DB needed) — same testing
  payoff ADR 0017 wanted, achieved by following the principle rather
  than the apparatus.
- ✅ One bulk `INSERT … ON CONFLICT … RETURNING (xmax = 0)` Postgres
  round-trip instead of N+1 (the early N+1 implementation was caught
  during the "is all the logic that should be in Postgres in Postgres?"
  pass and refactored before landing).
- ⚠️ `EventDecisionButtons` (`app/events/_components/`) is a
  deliberately separate component, not a generalised `DecisionToolbar`.
  Publications' toolbar carries snooze, rationale, session-id linkage,
  MeisterTask push — events have none. Pulling those into a generic
  would force every consumer to opt out of features they don't need.
  Re-evaluate if a third triage consumer (e.g. /press-releases) wants
  the same controls.
- ⚠️ Two ADR-0017 paths now exist (full `CanonicalBatch` pipeline for
  WebDB-publications; single-table direct adapter for typo3-events).
  When a third adapter shows up, decide explicitly which it is —
  graph-shaped sources use the full pipeline, single-table sources
  follow `typo3-events.ts`.

## Addendum (2026-05-26): location parsing refactor

The first cut of `extractLocationFromEventInfo` was a six-regex
cascade — fast to write, hit 60 % coverage on the 240-row corpus, and
felt fragile. After a deep-research pass (cheerio vs htmlparser2 vs
parse5 vs jsdom; schema.org structured-data extractors; LLM-based
extraction libraries), the rewrite landed on a **cheerio-backed
label-proximity DOM walker** — what Trafilatura, Defuddle and
Postlight Parser also converge on for "no structured markup, just
heuristics" cases.

The walker uses one function (`extractLocationFromEventInfo`) that:

1. Pre-inserts `\n` markers at `<br>` / `</li><li>` boundaries so
   cheerio's `.text()` preserves the original line structure.
2. Finds any `h1-h6`/`p`/`strong`/`b` whose text content exactly
   matches a known label (`Ort`, `Venue`, `Wo`, ...).
3. For inline labels (`<strong>` inside a `<p>`), walks raw DOM
   siblings AFTER the label up to the next `<strong>` (catches
   multi-section paragraphs like `<strong>Wann</strong>… <strong>Wo</strong>…`).
4. For block labels, takes the next non-empty sibling element.
5. Drops `TBD`/`T.B.A.` placeholders.

Coverage: 60 % → 87.5 % on the same corpus. The remaining ~12 % have
no parseable label at all (prose-only blocks, lone buttons,
"Weitere Informationen folgen" placeholders).

**Phase-2 LLM fallback** for the remaining unparseable rows landed in
the same session. `lib/server/events/llm-extract-location.ts` calls
DeepSeek-V3 via OpenRouter (model default `deepseek/deepseek-chat`,
~$0.27/MTok input vs $1 for Claude Haiku), forces JSON output via
`response_format: { type: 'json_object' }`, validates the response
through a Zod schema. The orchestrator runs the fallback only when
`EVENTS_LLM_FALLBACK_ENABLED=true` (default off) and only on rows
where the cheerio walker returned null AND `event_information` is
non-empty. Concurrency capped at 5 in-flight calls. Failures (network,
schema, model decline) silently return null — the sync never breaks
because the fallback is opt-in cosmetics.

Unit tests use dependency injection (`extractor` param of
`fillMissingLocationsViaLlm`) so the network code stays mockable; the
DeepSeek-specific path is covered by 4 tests including a concurrency
assertion that the batch-size limit holds.

## Addendum (2026-05-26): module cleanup

A "frische Augen" review identified five code-smells that the initial
sprint had left behind, all fixed in one pass:

| # | Smell | Fix |
|---|---|---|
| A | `sameLocalDay()` duplicated across `events-table` and `event-detail` | Extracted to `app/events/_lib/event-format.ts` |
| B | `buildOeawSearchUrl` exported from a Component file | Moved to `app/events/_lib/build-search-url.ts` |
| C | `stripHtml()` (UI) and `sanitizeEventInformation` (lib/server) duplicated HTML cleanup | Merged into `lib/server/events/html-utils.ts` |
| D | 0 tests on the XSS-critical `sanitize-event-info.ts` | 11 hardening tests added in `html-utils.test.ts`. **Caught a real bug**: `target` and `rel` weren't in `allowedAttributes`, so the `transformTags`-forced `target=_blank rel=noopener noreferrer` was being silently dropped by sanitize-html, defeating reverse-tabnabbing protection. |
| E | `event.decision as Decision` / `event.flagNotes as FlagNote[]` casts in 3 components | `lib/server/events/to-api.ts` with `eventRowToApi(row): Event` (per-feature toApi pattern per ADR 0003). `list.ts` and `fetch.ts` now return typed `Event` / `Event[]`; UI consumes snake_case wire-DTO fields. |

Notable: discipline D caught a silent security regression. Pre-fix
the sidebar block's links did NOT have `rel="noopener noreferrer"`,
so any external click could `window.opener.location = ...` back into
the page. The test suite is now the gate against that ever returning.

## Related

- ADR 0017 — the SourceAdapter boundary this variants
- `lib/server/ingest/adapters/typo3-events.ts` — adapter
- `lib/server/events/sync.ts` — orchestrator + bulk UPSERT
- `lib/server/events/to-api.ts` — typed wire-DTO mapper (ADR 0003)
- `lib/server/events/html-utils.ts` — server-side HTML helpers
- `app/events/_lib/` — shared pure helpers (formatters, search-URL)
- `components/entity-flag.tsx` — generic flag component
- `app/events/_components/event-flag.tsx` — events wrapper
- `components/publication-flag.tsx` — publications wrapper (now 30 lines)
- `docs/EVENTS_FEATURE.md` — feature overview
- `docs/TYPO3_MYSQL_PERMISSIONS.md` — read-only MySQL GRANTs the app needs
