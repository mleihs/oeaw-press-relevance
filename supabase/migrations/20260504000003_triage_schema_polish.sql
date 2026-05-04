-- Polish on the triage schema landed in 20260504000001:
--
-- 1) Drop `flag_count` — it was a denormalised cache of
--    `jsonb_array_length(flag_notes)` and would drift the moment any
--    code path forgot to keep it in sync. The array length is cheap on
--    a JSONB array and indexable via expression index if it ever
--    becomes hot. Single source of truth now.
--
-- 2) Trigger to auto-set `decided_at = now()` whenever `decision`
--    transitions to a non-'undecided' value. Removes the obligation
--    from every app-code mutation site to remember it. Also auto-
--    clears `decided_at` if a decision is reverted to 'undecided'.

ALTER TABLE publications DROP COLUMN flag_count;

CREATE OR REPLACE FUNCTION publications_decided_at_sync()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  -- Only react when `decision` actually changes.
  IF NEW.decision IS DISTINCT FROM OLD.decision THEN
    IF NEW.decision = 'undecided' THEN
      NEW.decided_at := NULL;
    ELSE
      NEW.decided_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publications_decided_at_sync
  BEFORE UPDATE OF decision ON publications
  FOR EACH ROW
  EXECUTE FUNCTION publications_decided_at_sync();

COMMENT ON FUNCTION publications_decided_at_sync IS
  'Keeps publications.decided_at in lockstep with decision. Runs only on UPDATE OF decision; INSERTs land via DEFAULT.';
