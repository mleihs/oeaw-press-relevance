# Publications PG-side Invariants — 2026-05-23

Follow-up to the venue-registry plan, scoped to the three real PG-side
gaps (and one defense-in-depth opportunity) surfaced by the post-Phase-C
audit on `publications`. Other tables (`users`, `user_settings`,
`press_releases`) already have the equivalents; this aligns `publications`
with the established patterns.

## Goal

Single commit, single migration `20260523000002_publications_invariants.sql`,
two TS-side touches:

1. **`updated_at` trigger** — attach the existing `trg_set_updated_at()`
   function to `publications` (already running on `users` /
   `user_settings`). Today 4 TS-side writers set `updatedAt` manually
   (`analysis/batch.ts` ×2, `enrichment/batch.ts` ×2); other writers
   (decision flip, archive toggle, flag toggle) silently skip it.
   65% of rows have `updated_at = created_at`, contradicting the actual
   change history. Trigger fixes it once-for-all.
2. **`enrichment_status` CHECK** — `pending | enriched | partial | failed`.
   The same column on `press_releases` has the equivalent CHECK;
   `publications` was the asymmetric outlier.
3. **`analysis_status` CHECK** — `pending | analyzed | failed`. Code
   writes all three (`analysis/batch.ts:166` writes 'analyzed',
   `:199` writes 'failed' on LLM error). The 'failed' state has 0 rows
   today (it has never fired), but it IS a legal state and the CHECK
   must allow it. Pre-flight critical: the value set is the union of
   what the CODE writes, not what the corpus currently contains.
4. **Score range CHECKs** — defense-in-depth on `press_score`,
   `public_accessibility`, `societal_relevance`, `novelty_factor`,
   `storytelling_potential`, `media_timeliness`. All `double precision NULL`,
   convention is [0..1]. Today the LLM prompt enforces the range; the
   CHECK enforces it structurally. Observed range: 0..0.815 for score,
   0..0.95 for dimensions — well within [0..1], so the ALTER will pass
   validation on existing data.

## Pre-flight verified (local + prod identical)

- `trg_set_updated_at()` exists in PG ✓
- All `enrichment_status` values in corpus: `{pending, enriched, partial, failed}` ✓ matches code
- All `analysis_status` values in corpus: `{pending, analyzed}` (subset of `{pending, analyzed, failed}` from code) ✓
- All score values in [0..1] ✓
- No raw-SQL writes to these columns outside what was grepped
- 7095 eligible publications (must stay 7095 — CHECK adds no rows, removes no rows)

## Migration shape

Each ALTER guarded by `DROP CONSTRAINT IF EXISTS` so the migration is
replay-safe (this repo's pattern; PG has no `ADD CONSTRAINT IF NOT EXISTS`
for table constraints). Trigger uses `DROP TRIGGER IF EXISTS` + `CREATE
TRIGGER` for the same reason.

```sql
-- 1. updated_at maintenance via trigger (parity with users/user_settings)
DROP TRIGGER IF EXISTS publications_set_updated_at ON publications;
CREATE TRIGGER publications_set_updated_at
BEFORE UPDATE ON publications
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 2. status enum gating (parity with press_releases.enrichment_status)
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_enrichment_status_check;
ALTER TABLE publications ADD CONSTRAINT publications_enrichment_status_check
  CHECK (enrichment_status IS NULL OR enrichment_status = ANY
         (ARRAY['pending','enriched','partial','failed']));

ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_analysis_status_check;
ALTER TABLE publications ADD CONSTRAINT publications_analysis_status_check
  CHECK (analysis_status IS NULL OR analysis_status = ANY
         (ARRAY['pending','analyzed','failed']));

-- 3. score range defense-in-depth ([0..1] convention from the LLM prompt)
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_press_score_range;
ALTER TABLE publications ADD CONSTRAINT publications_press_score_range
  CHECK (press_score IS NULL OR (press_score >= 0 AND press_score <= 1));

ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_dimensions_range;
ALTER TABLE publications ADD CONSTRAINT publications_dimensions_range
  CHECK (
    (public_accessibility   IS NULL OR (public_accessibility   >= 0 AND public_accessibility   <= 1)) AND
    (societal_relevance     IS NULL OR (societal_relevance     >= 0 AND societal_relevance     <= 1)) AND
    (novelty_factor         IS NULL OR (novelty_factor         >= 0 AND novelty_factor         <= 1)) AND
    (storytelling_potential IS NULL OR (storytelling_potential >= 0 AND storytelling_potential <= 1)) AND
    (media_timeliness       IS NULL OR (media_timeliness       >= 0 AND media_timeliness       <= 1))
  );
```

## TS-side changes

- `lib/server/db/schema.ts` publications block: add 4 `.check()` calls
  mirroring the PG constraints. Drift-zero is the existing convention
  (verified pre-plan: every PG CHECK has a TS counterpart).
- `lib/server/analysis/batch.ts` lines 180, 200: drop the
  `updatedAt: new Date().toISOString()` set (trigger handles it now,
  more accurate via PG NOW() than client clock).
- `lib/server/enrichment/batch.ts` lines 412, 556: same.

## Verification

- Local: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` passes (existing
  values legit), trigger fires on UPDATE.
- Constraint existence query: `SELECT conname FROM pg_constraint WHERE conname LIKE 'publications_%'` returns the new four.
- Trigger existence query: `SELECT trigger_name FROM information_schema.triggers WHERE event_object_table='publications'` lists `publications_set_updated_at`.
- Smoke (eligibility) still PASSES — no change to view content.
- press_eligible_publications still counts 7095.
- 203 Vitest tests still pass.

## Out of scope (deliberate)

- Backfill stale `updated_at` (rows where `updated_at = created_at` —
  ~65% of corpus). Leaving them as-is is honest: those rows haven't been
  touched since import. New writes will refresh them naturally.
- `oa_type` / `open_access_status` ENUM-CHECK — possible follow-up
  (low-priority, OpenAlex returns a bounded set already).
- Cross-table invariant "type-3 implies popular_science=true" — already
  enforced structurally via the eligibility view (Phase C); a column-
  level trigger would be redundant.
- Audit / changelog table for publication changes — separate scope.
- Materialize the venues facette to avoid the 14k-row scan — premature
  (35 ms today; cache later if it matters).

## Rollback

If something goes wrong:
```sql
DROP TRIGGER IF EXISTS publications_set_updated_at ON publications;
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_enrichment_status_check;
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_analysis_status_check;
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_press_score_range;
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_dimensions_range;
```
Plus revert the TS-side `updatedAt` writes (they were redundant but
harmless — kept setting client-time-stamps which the trigger then
overrode anyway).
