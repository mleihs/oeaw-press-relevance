-- Fortschritts-Ledger fuer das Neuschreiben von Pitch-Texten.
--
-- ANLASS (2026-08-28). Die Kohorte opus-4.8-session benennt in 0 % der Faelle
-- Institut, Journal oder Forschende (gegen 28 / 4 / 4 % in der aelteren
-- Kohorte). Die Rubrik ist korrigiert, die 411 vorhandenen Texte muessen
-- nachgezogen werden, ohne die Scores anzufassen.
--
-- WARUM EINE EIGENE SPALTE. Das Nachziehen laeuft in Sitzungen ueber mehrere
-- Batches und muss einen Context-Clear ueberleben. Ein Ledger dafuer gab es
-- nicht: `analysis_status` bleibt bei einem reinen Textlauf unveraendert, und
-- `updated_at` taugt nicht, weil das Nacht-Delta es ohnehin anfasst (der
-- Nachzieh-Replay am 26.08. hat allein 2470 Zeilen beruehrt). Eine Heuristik
-- ueber den Textinhalt waere die Sorte Pruefung, die richtig aussieht und still
-- falsch liegt: nicht jeder gute Pitch nennt die OeAW, weil nicht jede Quelle
-- das hergibt.
--
-- Die Spalte zaehlt, nicht flaggt: die Rubrik wird sich wieder aendern, und
-- dann will man wissen, welche Generation ein Text hat. 0 = Originaltext aus
-- dem Bewertungslauf.

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS pitch_revision smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN publications.pitch_revision IS
  'Generation des Pitch-Texts. 0 = wie im Bewertungslauf geschrieben, >=1 = per session-pipeline repitch-apply nachgezogen. Ledger fuer batchweises Nachziehen ueber mehrere Sitzungen; die Scores bleiben davon unberuehrt.';

-- Teilindex: gefragt wird immer nur nach dem, was noch offen ist.
CREATE INDEX IF NOT EXISTS idx_pub_pitch_revision_pending
  ON publications (llm_model)
  WHERE pitch_revision = 0 AND analysis_status = 'analyzed';
