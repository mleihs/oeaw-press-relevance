-- Journal der automatischen Bewertungsläufe (Nacht, Knopf, CLI).
--
-- ANLASS. Bewertet wurde bisher in-chat oder über den Bewerten-Knopf, und
-- keiner der beiden Wege hinterließ eine Spur: wie viele Kandidaten ein Lauf
-- sah, was er gekostet hat, welche Haikus er verwarf, ob er überhaupt durchlief.
-- ingest_runs protokolliert nur die Feeds. Der Bewertungskern
-- (lib/server/scoring/run.ts) schreibt hier je Entität und Lauf eine Zeile:
-- beim Start `running`, nach jedem Chunk den Zwischenstand, am Ende Status,
-- Einzeiler und Bericht. Die Dashboard-Kachel und die Nachkontrolle
-- (`npm run scoring-run -- --report-latest`) lesen nur hier.
--
-- Status: ok | partial | failed | skipped (Regeln in
-- lib/shared/scoring/run-classify.ts). Ein Lauf, der als `running` stehen
-- bleibt (Prozess beendet), wird nicht umgeschrieben; die Leseseite meldet ihn
-- nach 120 Minuten als abgebrochen (STALE_RUNNING_MINUTES in journal.ts).

CREATE TABLE IF NOT EXISTS scoring_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity           text NOT NULL CHECK (entity IN ('publications','events')),
  trigger          text NOT NULL CHECK (trigger IN ('nightly','button','cli','compare')),
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed','skipped')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  model            text NOT NULL,
  model_tag        text NOT NULL,
  effort           text NOT NULL,
  candidates       int  NOT NULL DEFAULT 0,
  scored           int  NOT NULL DEFAULT 0,
  failed           int  NOT NULL DEFAULT 0,
  skipped          int  NOT NULL DEFAULT 0,
  haiku_rejected   int  NOT NULL DEFAULT 0,
  lektorat_flags   int  NOT NULL DEFAULT 0,
  lektorat_changes int  NOT NULL DEFAULT 0,
  cost_usd         numeric(10,4) NOT NULL DEFAULT 0,
  cost_cap_usd     numeric(10,2),
  cost_cap_hit     boolean NOT NULL DEFAULT false,
  median_score     numeric(6,4),
  summary          text,
  error_class      text,
  error_message    text,
  report           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scoring_runs_entity_started ON scoring_runs (entity, started_at DESC);

-- Keine anon-Policy (Muster 20260831000001): gelesen wird nur serverseitig.
ALTER TABLE scoring_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE scoring_runs IS 'Journal der automatischen Bewertungsläufe (Nacht, Knopf, CLI). Quelle der Dashboard-Kachel „Bewertung". report: haiku_rejected[], haiku_stats, lektorat_flags[], lektorat_changes[], failed_items[], batches[], audit_before/after, scores[].';
