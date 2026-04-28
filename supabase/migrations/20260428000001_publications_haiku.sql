-- Persist the model-generated haiku alongside the rest of the analysis output.
-- The column was added ad-hoc to live databases earlier; this migration brings
-- fresh setups in line and is a no-op on environments that already have it.

ALTER TABLE publications ADD COLUMN IF NOT EXISTS haiku TEXT;
