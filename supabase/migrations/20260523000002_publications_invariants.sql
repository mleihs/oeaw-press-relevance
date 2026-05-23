-- Publications PG-side invariants: align the most-used table with the
-- patterns already in place for users / user_settings / press_releases.
--
-- 1. trg_set_updated_at: attached to publications so every UPDATE bumps
--    `updated_at` automatically. The function exists in PG already
--    (running on users + user_settings); publications was the asymmetric
--    outlier. Before this trigger, 4 TS-side writers in analysis/batch
--    and enrichment/batch set updatedAt manually, while other writers
--    (decision flip, archive toggle, flag toggle) silently skipped it,
--    leaving ~65% of rows with `updated_at = created_at` despite real
--    changes having happened.
--
-- 2. publications_enrichment_status_check: the same column on
--    press_releases has CHECK (... ANY ['enriched','partial','failed']);
--    publications writes the same values plus 'pending' as default state.
--
-- 3. publications_analysis_status_check: code (analysis/batch.ts) writes
--    'analyzed' on success and 'failed' on LLM error, plus 'pending'
--    default. Today 0 rows are 'failed' (it has never fired), but it IS
--    a legal state and the CHECK reflects what the CODE allows, not what
--    the corpus currently shows.
--
-- 4. publications_press_score_range + publications_dimensions_range:
--    defense-in-depth on the LLM scores ([0..1] convention from the
--    prompt). Observed range 0..0.815 for press_score, 0..0.95 for the
--    five dimensions — well within [0..1], so this passes validation on
--    existing rows.
--
-- All ALTERs guarded by DROP CONSTRAINT IF EXISTS so the migration is
-- replay-safe (PG has no ADD CONSTRAINT IF NOT EXISTS for table CHECKs).
-- Trigger guarded by DROP TRIGGER IF EXISTS for the same reason.

-- 1. updated_at maintenance via trigger
DROP TRIGGER IF EXISTS publications_set_updated_at ON publications;
CREATE TRIGGER publications_set_updated_at
BEFORE UPDATE ON publications
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 2. enrichment_status enum gating
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_enrichment_status_check;
ALTER TABLE publications ADD CONSTRAINT publications_enrichment_status_check
  CHECK (enrichment_status IS NULL OR enrichment_status = ANY
         (ARRAY['pending'::text, 'enriched'::text, 'partial'::text, 'failed'::text]));

-- 3. analysis_status enum gating
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_analysis_status_check;
ALTER TABLE publications ADD CONSTRAINT publications_analysis_status_check
  CHECK (analysis_status IS NULL OR analysis_status = ANY
         (ARRAY['pending'::text, 'analyzed'::text, 'failed'::text]));

-- 4a. press_score in [0..1]
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_press_score_range;
ALTER TABLE publications ADD CONSTRAINT publications_press_score_range
  CHECK (press_score IS NULL OR (press_score >= 0 AND press_score <= 1));

-- 4b. five LLM dimensions in [0..1]
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_dimensions_range;
ALTER TABLE publications ADD CONSTRAINT publications_dimensions_range
  CHECK (
    (public_accessibility   IS NULL OR (public_accessibility   >= 0 AND public_accessibility   <= 1)) AND
    (societal_relevance     IS NULL OR (societal_relevance     >= 0 AND societal_relevance     <= 1)) AND
    (novelty_factor         IS NULL OR (novelty_factor         >= 0 AND novelty_factor         <= 1)) AND
    (storytelling_potential IS NULL OR (storytelling_potential >= 0 AND storytelling_potential <= 1)) AND
    (media_timeliness       IS NULL OR (media_timeliness       >= 0 AND media_timeliness       <= 1))
  );
