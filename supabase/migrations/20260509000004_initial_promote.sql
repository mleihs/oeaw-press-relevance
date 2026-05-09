-- After the press_releases-consolidation in 20260509000003, run promote once
-- to catch any orphans whose paper-DOI now matches a publication that was
-- imported between the original orphan-seed (2026-05-06) and now (2026-05-09).
--
-- Idempotent (function uses NOT EXISTS-guard). Safe to run on a fresh
-- rebuild — promotes 0 if nothing matches.

DO $$
DECLARE
  n int;
BEGIN
  SELECT promote_press_release_orphans() INTO n;
  RAISE NOTICE '[20260509000004] Initial promote after consolidation: % orphan(s) → publications', n;
END $$;
