# Contributing to StoryScout

Thanks for your interest. This guide covers everything you need to
contribute — from local setup to PR submission.

## Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
Be excellent to each other.

## Development Setup

### Prerequisites

- **Node.js ≥ 20** (LTS recommended) — check with `node -v`
- **Supabase CLI** — `brew install supabase/tap/supabase` or
  `npm install -g supabase`
- **Docker** — required by the local Supabase stack
- **Python 3.10+** with `venv` — only if you work on the SPECTER2
  embedding pipeline

### First-Time Setup

```bash
# 1. Clone
git clone https://github.com/mleihs/oeaw-press-relevance.git
cd oeaw-press-relevance

# 2. Install deps
npm install

# 3. Start local Supabase (downloads Docker images on first run)
supabase start
# Ports printed:  API 54421, DB 54422, Studio 54423 (shifted to 544xx
# range so this stack coexists with other local Supabase projects)

# 4. Apply migrations
supabase migration up --local

# 5. Environment variables
cp .env.example .env.local
# Edit .env.local with at minimum:
#   SUPABASE_URL=http://127.0.0.1:54421
#   SUPABASE_ANON_KEY=<from `supabase status`>
#   SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres
#   OPENROUTER_API_KEY=sk-or-...   # optional for UI-only dev
#   GATE_PASSWORD=<your-choice>
#   GATE_TOKEN=<sha256 of GATE_PASSWORD>
#     # generate with: echo -n "yourpassword" | sha256sum

# 6. Run
npm run dev
# Open http://localhost:3000, sign in with GATE_PASSWORD
```

Leaving `GATE_TOKEN` empty puts middleware in pass-through (dev)
mode — useful when you want to skip the gate during local
development.

### Optional: SPECTER2 Embedding Pipeline

Only needed for work on press-similarity features.

```bash
cd scripts/embeddings
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt    # transformers, adapters, torch, psycopg2, numpy

# Smoke run (no-op if all hashes match, ~5 s)
python compute-embeddings.py --target=local
```

The first real run downloads SPECTER2 (~440 MB) and takes ~90 minutes
on CPU. Use `--max-pubs=400` for the chunked-restart pattern on
memory-constrained machines (WSL2 OOM mitigation).

### Optional: Run Against a Remote Postgres

For testing against a deployed Supabase project:

```bash
supabase link --project-ref <your-prod-ref>
# Migrations:
supabase db push    # applies new migrations to the linked project
```

Don't push migrations to a shared production project from your fork —
open a PR.

## Running Tests

### End-to-End (Playwright)

```bash
# First time only
npx playwright install chromium

# Run all tests
npx playwright test

# Specific spec
npx playwright test e2e/visual.spec.ts

# UI mode (interactive debugging)
npx playwright test --ui

# Regenerate visual baselines after an intentional UI change
rm -rf test-results/visual-snapshots/
npx playwright test e2e/visual.spec.ts
# Inspect the new snapshots before committing
```

The suite currently covers 26 visual snapshots + 4 smoke tests. Visual
baselines are inspected manually as PR attachments.

### Unit Tests (Vitest)

```bash
npm run test           # one-shot run
npm run test:watch     # watch mode
```

Coverage of `lib/` is currently low — Phase 4 of
[OSS_READINESS_PLAN.md](OSS_READINESS_PLAN.md) is the dedicated
test-coverage push.

### Type Check + Lint

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
```

Both must pass before PR submission.

## Code Conventions

### TypeScript

- **Strict mode is on** — see `tsconfig.json`
- Use `type` for simple data shapes, `interface` only when extending
- Prefer **discriminated unions** for variant types — see
  `SimilarPressed` in `components/press-reference-card.tsx` for the
  pattern
- **No `any`** — use `unknown` with type narrowing, or proper types
- Import via the `@/` alias (e.g. `@/lib/types`)

### Comments

**Default: no comments.** Code should be self-explanatory through
naming and structure.

**Exception — WHY-comments** for:

- Hidden invariants ("This must run before X because…")
- Non-obvious workarounds ("Postgres rejects `SET LOCAL` in STABLE
  functions, hence the function-attribute form")
- Historical context where it materially helps a reader

**Avoid:**

- WHAT-comments (`// returns the user id` next to `return user.id`)
- PR / issue references (`// for #123`) — that belongs in the commit
  message
- Status markers (`// TODO: someday`) — open an issue instead

### Writing Style (German UI/KB Text)

See [docs/writing-style.md](docs/writing-style.md). Em-dashes (`—`, U+2014)
are forbidden in user-visible text; rewrite the sentence instead of swapping
in a comma. Both the ESLint rule and `npm run check-em-dashes` enforce this
in CI.

### Styling

Tailwind v4 with semantic tokens. The repo went through a
dark-mode-readiness token sweep — please don't reintroduce hardcoded
neutrals.

**Never use:** `text-neutral-*`, `bg-white`, `bg-neutral-*`,
`border-neutral-*`, `divide-neutral-*`, `hover:bg-neutral-*`.

**Mapping table** (use the semantic equivalent on the right):

| Hardcoded | Semantic replacement |
|---|---|
| `bg-white` | `bg-card` (component surfaces) or `bg-background` (full-page) |
| `bg-neutral-50` | `bg-muted/50` |
| `bg-neutral-100` | `bg-muted` |
| `bg-neutral-200` | `bg-muted` (chips) or `bg-border` (dividers) |
| `text-neutral-300` | `text-muted-foreground/50` |
| `text-neutral-400` | `text-muted-foreground/70` |
| `text-neutral-500` | `text-muted-foreground` |
| `text-neutral-600` | `text-foreground/80` |
| `text-neutral-700` | `text-foreground` or `text-foreground/90` |
| `text-neutral-800` / `text-neutral-900` | `text-foreground` |
| `border-neutral-200` / `border-neutral-300` | `border-border` |
| `divide-neutral-100` | `divide-border/60` |
| `hover:bg-neutral-100` | `hover:bg-muted` |
| `bg-neutral-900 text-white` (inverted) | `bg-foreground text-background` |

**Component-library shortcuts** — prefer these over composing from
primitives:

- `<TintBadge color="...">` for color-tinted badges
  (`green | amber | blue | red | purple | indigo | emerald | orange`)
- `<SectionLabel>` for `h4`-style section headers
- `<StatusBanner variant="...">` for inline alert / success / warning
  banners
- `<ApiErrorCard title=... message=... hint=...>` for error displays
- `<CapybaraModalAvatar variant="analyst | enricher">` for modal
  capybaras

**shadcn/ui primitives in `components/ui/`** — do not edit directly.
Override via `className` on the consuming side; `twMerge` (via
`cn()` in `lib/utils.ts`) handles conflict resolution.

### Commits

Conventional Commits style: `type(scope): subject`.

```
type(scope): short subject in German or English (≤72 chars)

Optional body explaining WHY, not WHAT. Wrap at ~72 chars.

Co-Authored-By: optional pair-programmer
```

Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`,
`perf`, `style`, `build`, `ci`.

**Examples from this repo:**

```
feat(press-release): orphan press_release embeddings in k-NN-Cluster
fix: press_cluster_view DISTINCT ON pub_id + smoke timeout 15→25s
refactor(ui): dark-mode-ready token-sweep + extracted components
docs(architecture): add embedding-pipeline section
```

### Branches & PRs

- **`main`** — production, auto-deploys to Vercel
- **`feature/<name>`** — new features
- **`fix/<name>`** — bug fixes
- **`docs/<name>`** — documentation
- **`chore/<name>`** — refactors and tooling

#### PR Template

```markdown
## What

Brief description of the change.

## Why

Motivation, link to issue if applicable.

## How tested

- Local dev: yes / no
- Playwright e2e: yes / no
- Manual UI check: yes / no
- New tests added: yes / no

## Screenshots (if UI change)

[before / after]
```

#### PR Checklist

- [ ] Type check passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass: `npm test`
- [ ] Playwright e2e passes (if UI changes): `npx playwright test`
- [ ] No new ESLint warnings introduced
- [ ] Migrations are forward-compatible (don't break existing data)
- [ ] If feature: `ARCHITECTURE.md` or `README.md` updated
- [ ] Commit messages follow conventional commits

### Migrations

DB migrations live in `supabase/migrations/` with
timestamp-prefixed names
(e.g. `20260511000001_orphan_press_release_embeddings.sql`).

**Naming:** `YYYYMMDDhhmmss_short_description.sql`

**Conventions:**

- **Idempotent** — `CREATE IF NOT EXISTS`, `CREATE OR REPLACE`,
  `DROP IF EXISTS`
- **Documented** — `COMMENT ON TABLE / COLUMN / FUNCTION` for
  non-obvious things
- **Reversible** — add rollback notes in a header comment where
  practical
- **Atomic** — one logical change per migration

**Forbidden:**

- Editing applied migrations (production has them) — except for
  pure comment-only edits that don't change the schema state
- Destructive operations without an explicit comment + reason

## Areas for Contribution

### Good First Issues

Look for the `good-first-issue` label on GitHub. Examples:

- I18n (German ↔ English UI toggle)
- A11y improvements (keyboard nav, screen reader labels)
- Score-distribution chart variants (alternative visualizations)
- Per-feature deep-dives in `docs/`

### Medium-Sized Tasks

- Multilingual embedding pipeline (multilingual-e5-large or BGE-M3
  as a second cluster source)
- Inngest / Trigger.dev migration for >60 s enrichment pipelines
- Real-time collaboration via Supabase Realtime (Presence in
  `/review`)
- `press_score` formula refit per
  [docs/SCORING_VALIDATION.md](docs/SCORING_VALIDATION.md)

### Large / Architectural

- Backend rewrite to Phoenix LiveView (see
  [OSS_READINESS_PLAN.md](OSS_READINESS_PLAN.md) §1.2 for the
  trigger criteria)
- ML hot-path via FastAPI sidecar (only if real-time embedding
  becomes needed)
- Multi-tenancy (one instance serving multiple universities)

**For large contributions:** open an issue first to align before
investing weeks of work.

## License

MIT — by submitting a PR you agree your contribution is MIT-licensed.

## Questions

- GitHub Issues for bugs and feature requests
- Direct contact: see repository owner profile
