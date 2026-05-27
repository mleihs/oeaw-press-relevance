# Events Feature — TYPO3 events → Postgres mirror + maintainer triage

The `/events` route is a thin maintainer workbench: it lists upcoming
TYPO3 events from the ÖAW WebDB and lets a maintainer mark which ones
have been moved into the central event-calendar. Read-only-with-state:
the WebDB stays the source of truth for event facts (title, date,
location), Postgres only owns the per-row maintainer state
(`decision`, `decided_at`, `flag_notes`).

## Source

The TYPO3-EXT:news extension table `tx_news_domain_model_news`,
extended by **EXT:news_eventnews** which adds the `is_event` boolean
and the related `tx_eventnews_domain_model_location` /
`tx_eventnews_domain_model_organizer` lookup tables. Same MySQL
container the publications pipeline already uses (`oeaw-webdb-mysql`
on port 54499 locally; see `docs/WEBDB_IMPORT.md` for setup).

Filter applied at the source (all four conditions ANDed):

| Predicate | Why |
|---|---|
| `is_event = 1` | EXT:news_eventnews flag — the event/news distinction |
| `deleted = 0` | TYPO3 soft-delete |
| `hidden = 0` | TYPO3 editorial hide |
| `datetime >= UNIX_TIMESTAMP()` | upcoming only |

At sync time (2026-05-26) the live WebDB held 10.697 event rows total,
241 of them upcoming.

## Target schema

One Postgres table `events`. Defined across three migrations:
`supabase/migrations/20260526000001_events.sql` (initial),
`20260526000002_events_bodytext_institute.sql` (detail-page fields)
and `20260526000003_events_information.sql` (TYPO3 sidebar block).

| Column | Notes |
|---|---|
| `id` UUID PK | App-side row identifier (`gen_random_uuid()`). |
| `webdb_uid` INT UNIQUE | `tx_news_domain_model_news.uid` — natural key for UPSERT. |
| `title`, `teaser`, `url`, `lang` | Editorial fields from TYPO3. `url` is the cascade result `externalurl → tx_heborssnewsimporter_externalid → internalurl → null` (no fake oeaw.ac.at fallback). |
| `bodytext` TEXT | Full TYPO3 RTE output. Rich-text (often HTML). Rendered only on the detail page — list queries never select it. The detail page strips HTML to plain text via `stripHtml()`. |
| `event_information` TEXT | TYPO3 sidebar block (`tx_news_domain_model_news.event_information`). Often contains canonical address, Zoom link, organiser, contact email, invitation-download link. Rendered on the detail page after server-side sanitisation via `lib/server/events/sanitize-event-info.ts` (a safelist of `<a>`, `<p>`, `<br>`, `<h3-6>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<em>` — links forced to `target=_blank rel=noopener`). |
| `event_at` TIMESTAMPTZ | From `tx_news_domain_model_news.datetime` (UNIX seconds → TIMESTAMPTZ). |
| `event_end_at` TIMESTAMPTZ | From `event_end`; null when 0. |
| `location_title`, `organizer_title` | Three-step cascade: (1) `n.location_simple` / `n.organizer_simple` plain-text, (2) legacy FK join on `tx_eventnews_domain_model_{location,organizer}`.title, (3) for location only: `extractLocationFromEventInfo()` parses the `<h5>Ort</h5><p>…</p>` block out of `event_information`. Step 3 alone raised location coverage from 0% to ~60% on the current corpus. |
| `available_langs` TEXT[] | Languages this event is available in (de/en/mul, from `sys_language_uid` mapping). Original row + every translation pointing at it via `l10n_parent`. Drives the `DE+EN`-style language badge on the list view. Sync filters `l10n_parent = 0` (originals only) and aggregates the translation languages via `GROUP_CONCAT` on the MySQL side, so translations no longer appear as duplicate rows. |
| `institute` TEXT | TYPO3-derived institute label. Adapter walks `pages.pid` up to the site-root, then resolves: if the site-root is the OEAW main site (DE or EN), the page *directly below* it is the institute (catches IHB, IKGA, IMAFO, ISA, KIS, ARZ, ... which live as sub-pages of the main site, `is_siteroot=0`). Otherwise the site-root title itself (catches standalone sites GMI, ACDH, IWF, RICAM, ...). Denormalised label, not a normalised FK. |
| `decision` TEXT CHECK | Mirrors `publications.decision`: `undecided`/`pitch`/`hold`/`skip`. |
| `decided_at` TIMESTAMPTZ | Auto-managed by `trg_events_decided_at_sync` (reuses the publications trigger function). |
| `flag_notes` JSONB | `[{by, note, at}, ...]` — same shape as `publications.flag_notes`. |
| `synced_at` TIMESTAMPTZ | Stamped on every UPSERT. |
| `created_at` TIMESTAMPTZ | First-INSERT timestamp; never updated. |

### URL cascade detail

TYPO3 detail-page URLs depend on the site's `routeEnhancers` config
(lives in `config/sites/*.yaml` outside the DB), and most institute
sub-sites do NOT route under `oeaw.ac.at/detail/news/...`. So the
adapter never fabricates a URL from `path_segment` alone — it picks
the first non-empty HTTP(S) URL from this cascade:

1. `externalurl` (editor-set, ~2% of upcoming events)
2. `tx_heborssnewsimporter_externalid` (RSS-import source, e.g.
   `seminars.viennabiocenter.org/...` — ~39% of GMI events)
3. `internalurl` (~8% of rows)
4. **null** — UI then renders an "Auf oeaw.ac.at suchen" fallback
   that opens a `site:oeaw.ac.at "{title}"` Google query in a new
   tab. Honest about missing data, no broken links.

Live coverage on 2026-05-26: 99/240 with direct URL, 142/240 via the
search fallback.

Indexes: `idx_events_event_at` + `idx_events_decision`. No partial
`WHERE event_at >= NOW()` index because `NOW()` is not `IMMUTABLE`;
the plain B-tree is selective enough for the ~hundreds-of-rows scale.

## Sync flow

`POST /api/events/sync` → `syncUpcomingEvents()` in
`lib/server/events/sync.ts`. Three steps:

1. **Fetch** via `fetchTypo3Events()` in
   `lib/server/ingest/adapters/typo3-events.ts`. Opens one `mysql2`
   connection, runs the SQL above (a `WITH RECURSIVE` CTE walks
   `pages.pid` upward until `is_siteroot=1` to derive the institute
   label per event in the same query), closes. Adapter is a
   single-table variant of the ADR 0017 SourceAdapter pattern (no
   `CanonicalBatch` ceremony — see ADR 0017 update for the variant
   rationale).

2. **Normalise** with the pure `normalizeTypo3Event(raw)` function in
   the same file. Maps unix → ISO TIMESTAMPTZ via the shared
   `tsTimestamp` helper from `webdb-normalize.ts` (same family of
   adapters, same epoch semantics); applies the URL cascade above;
   maps `sys_language_uid` 0/1/-1 → `de`/`en`/`mul`; collects
   `availableLangs` from the original row + every translation via
   `collectAvailableLangs`.

   **Location extraction** falls back to `extractLocationFromEventInfo`
   (cheerio-based DOM walker) when the structured `location_simple`
   field is empty. The walker finds any element whose text matches a
   location label (`Ort`, `Location`, `Venue`, `Wo`, ...) and takes
   the adjacent content: for inline labels, the sibling text nodes up
   to the next `<strong>`; for block labels, the next non-empty
   sibling. Coverage: 87.5 % on the 2026-05-26 corpus, up from 60 %
   with the original regex cascade. See ADR 0019 for the rationale.

3. **UPSERT** as one Postgres round-trip:
   `INSERT … ON CONFLICT (webdb_uid) DO UPDATE … RETURNING (xmax = 0)`.
   `xmax = 0` is the canonical inserted-vs-updated marker in Postgres
   UPSERT — the same row tells us which branch it took, so the API
   can return precise `imported` and `updated` counts without an extra
   SELECT round-trip.

4. **Prune** stale upcoming rows in one DELETE:
   `DELETE FROM events WHERE event_at >= NOW() AND webdb_uid NOT IN (incoming)`.
   Catches translations we used to mirror separately before the
   `l10n_parent = 0` filter landed, plus events the editors removed from
   WebDB. Scoped to upcoming rows so past events keep their triage
   history. The prune count flows into `EventsSyncResult.pruned` and
   surfaces in the maintainer's success toast.

The UPSERT `SET`-list **does not** include `decision`, `decided_at`,
`flag_notes`, or `created_at`. That's the contract that makes re-syncs
safe to run as often as the maintainer wants: WebDB-sourced columns
refresh, maintainer state survives.

## Maintainer workflow

The `/events` route renders the list server-side (RSC,
`force-dynamic` per ADR 0009 because mutating decision badges have to
reflect immediately). Per row, the maintainer can:

- **Open the detail page** by clicking the title (arrow icon).
  `/events/[id]` shows the full bodytext, all flag-notes without
  truncation, an institute badge, a prominent "Auf oeaw.ac.at" link
  for the canonical event page, and the same flag/decision popover as
  the list row. Route file: `app/events/[id]/page.tsx`.
- **Flag** the event with an optional note (multi-reviewer stack, same
  dedup rules as `publications.flag_notes`). API:
  `POST/DELETE /api/events/[id]/flag`.
- **Set status** to pitch / hold / skip. API:
  `PATCH /api/events/[id]/decision`. `decided_at` is stamped by the
  `trg_events_decided_at_sync` trigger inside the same transaction.

Both flag and decision surfaces live inside one popover, opened by
clicking the row's Pin/Status icon — see
`app/events/_components/event-flag.tsx` (combines `<EntityFlag>` with
`<EventDecisionButtons>` in the popover footer). This is
intentionally lighter than the publications-side `<DecisionToolbar>`
(no snooze, no rationale, no MeisterTask push, no session
lazy-create) — the event triage doesn't need that surface area.

The detail page renders `bodytext` as plain text via a server-side
`stripHtml()` (entity decoding + tag removal, preserves `<p>` and
`<br>` as paragraph/line breaks). No `dangerouslySetInnerHTML`, no
XSS surface. If a future requirement needs structured HTML
(links, lists), swap in a sanitiser like DOMPurify rather than
loosening this path.

## Auth + read path

Inherits the project's SHA-256 gate cookie (`proxy.ts`) — no
additional auth on the `/events` route. The local-dev bypass for
`NODE_ENV=development` applies here as everywhere else.

The read path runs entirely in Postgres: `getEventsOverview()` in
`lib/server/events/list.ts` is one query, five `COUNT(*) FILTER`
conditional aggregates plus a `MAX(synced_at)`. Counts in the tab
badges are guaranteed to match the row counts the user sees after
clicking a tab because both share the same `event_at >= NOW()` base
predicate from the same single scan.

## Operational notes

- **WEBDB MySQL container must be up** for `/api/events/sync` to work.
  Setup commands are in `docs/WEBDB_IMPORT.md`. The page itself stays
  bedienbar with the last-mirrored state even when the container is
  down (sync returns 503 with a friendly toast; the read path doesn't
  touch MySQL).
- **Env vars**: `WEBDB_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` are
  validated boot-time in `lib/server/env.ts` (HOST + (USER, DATABASE)
  conditional pair). Unsetting HOST disables the sync without
  breaking the page.
- **`mysql2`** is now a runtime dependency (was devDependency for
  scripts-only). The sync route imports it, so it has to ship with the
  app bundle. The dual-naming on `webdbMysqlConfigFromEnv` reads
  `WEBDB_MYSQL_*` first, falls back to legacy unprefixed `MYSQL_*` —
  both the script and the app land at the same container.

### Re-syncing prod

Prod-Vercel cannot reach the TYPO3 MySQL container (it lives on the
developer machine), so the `/api/events/sync` HTTP path is unusable in
production. The canonical write path for prod is the CLI wrapper
`scripts/sync-events.ts`, run from the dev machine where TYPO3 is
reachable:

```bash
npm run sync-events                          # → local Supabase
npm run sync-events -- --target=prod         # → prod Supabase (asks y/N)
npm run sync-events -- --target=prod --yes   # CI / unattended
```

Prod credentials are sourced from `~/.config/oeaw-press-release/
prod-credentials` via `scripts/lib/db.mjs` — the same convention used
by `backfill-venue`, `enrich-orphans`, `recompute-press-scores`. The
script overrides `DATABASE_URL` at process level so a shell-level
shadow value cannot misdirect a prod-targeted run; `.env.local`
provides the rest (WEBDB_MYSQL_*, GATE_*, OPENROUTER_API_KEY).

`syncUpcomingEvents()` takes its env as a `SyncOptions` parameter
rather than reading `getEnv()` internally, so the CLI doesn't drag the
HTTP-route's full env-validator (GATE_TOKEN, SERVICE_ROLE, …) into a
context where it has nothing to validate. The HTTP route resolves
`SyncOptions` from `getEnv()`; the CLI resolves it from `process.env`
after the target switch.

The sync UPSERT only updates TYPO3-sourced columns (see `sync.ts`
`onConflictDoUpdate.set`), so maintainer state (`decision`,
`decided_at`, `flag_notes`, `created_at`) is per-environment by
construction — re-running against prod never overwrites press-team
triage progress.

## Related docs

- `docs/WEBDB_IMPORT.md` — broader WebDB pipeline (publications side)
- `docs/adr/0017-source-adapter-boundary.md` — the SourceAdapter pattern + the single-table variant rationale
- `docs/adr/0019-generic-entity-flag-component.md` — the publication-flag → EntityFlag refactor
- `content/help/events/*.mdx` — user-facing help center pages
