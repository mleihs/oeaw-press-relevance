-- Tracking-Tabelle für die letzte Ausführung von promote_press_release_orphans().
-- Ermöglicht Dashboard-Hinweis "Letzter Promote-Run: TT.MM.YYYY".

CREATE TABLE IF NOT EXISTS press_release_promote_log (
  id          BIGSERIAL PRIMARY KEY,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_n  INT NOT NULL,
  source      TEXT  -- z.B. 'webdb-import', 'manual', 'enrich-orphans'
);

COMMENT ON TABLE press_release_promote_log IS
  'Audit-Log: jeder promote_press_release_orphans()-Aufruf trägt eine Row ein. Ermöglicht Drift-Erkennung wenn lange kein Promote lief.';

-- Function-Wrapper, der sowohl die Original-Funktion ausführt als auch loggt.
CREATE OR REPLACE FUNCTION promote_press_release_orphans_logged(p_source TEXT DEFAULT 'unknown')
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  SELECT promote_press_release_orphans() INTO n;
  INSERT INTO press_release_promote_log (promoted_n, source) VALUES (n, p_source);
  RETURN n;
END $$;

COMMENT ON FUNCTION promote_press_release_orphans_logged IS
  'Wrapper around promote_press_release_orphans() that also writes an audit-row. Aufrufer sollten p_source mitgeben (e.g. "webdb-import", "manual").';
