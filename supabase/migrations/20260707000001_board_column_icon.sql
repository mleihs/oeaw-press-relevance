-- Frei wählbares Kanal-Icon pro Spalte. Überschreibt das bisher rein
-- namensbasierte Mapping (app/board/_lib/channels.tsx). NULL = Fallback auf
-- das Name→Icon-Mapping (Rückwärtskompatibilität für Bestandsspalten).
--
-- Bewusst ohne CHECK-Constraint: die erlaubten Icon-Schlüssel leben in
-- lib/shared/board.ts (BOARD_COLUMN_ICONS) und werden serverseitig in der
-- Zod-Schicht (columnPatchSchema) validiert — so lassen sich neue Icons ohne
-- Migration ergänzen.
ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS icon text;
