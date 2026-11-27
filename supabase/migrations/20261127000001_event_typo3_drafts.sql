-- KI-Entwürfe für die TYPO3-Übernahme eines Events (TYPO3-Bridge).
--
-- ANLASS (2026-11-27). Die Redakteurin legt anstehende Veranstaltungen im
-- ÖAW-TYPO3 (News-Ordner [72], EXT:news + eventnews) als zentralen Datensatz
-- an. Die Chrome-Extension „ÖAW TYPO3 Toolkit" (Event-Assistent, ab 1.6.0)
-- holt dafür über POST /api/typo3-bridge/events/:id/draft einen Entwurf, den
-- Claude serverseitig aus den Quelldaten des Events schreibt. Ein Entwurf
-- kostet einen Opus-Aufruf; deshalb bleibt er hier liegen und kommt beim
-- nächsten Öffnen ohne neuen Aufruf zurück (`cached: true`). Erst „Neu
-- erzeugen" (refresh) oder ein geänderter Zusatzwunsch schreibt ihn neu.
--
-- Eine Zeile je Event, kein Verlauf: der Entwurf ist ein Arbeitsstand, kein
-- Beleg. Was übernommen wurde, steht danach in TYPO3.
--
-- ON DELETE CASCADE: der Events-Sync entfernt künftige Events, die die Quelle
-- nicht mehr liefert (lib/server/events/sync.ts). Mit ihnen gehen ihre
-- Entwürfe. Spalten der Tabelle `events` fasst diese Migration nicht an, der
-- Sync bleibt unverändert.
--
-- source_hash: SHA-256 über die Quelldaten, aus denen der Entwurf entstand
-- (lib/server/typo3-bridge/draft.ts, sourceHashOf). Ändert der Nachtimport
-- Titel, Text, Termin oder Ort, weist die Antwort auf den veralteten Entwurf
-- hin, statt ihn still als aktuell auszugeben.

CREATE TABLE IF NOT EXISTS event_typo3_drafts (
  event_id      uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  webdb_uid     integer NOT NULL,
  draft         jsonb NOT NULL,
  notes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  model         text NOT NULL,
  effort        text NOT NULL,
  instructions  text,
  source_hash   text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

-- Keine anon-Policy (Muster 20260831000001): gelesen und geschrieben wird nur
-- serverseitig über die Bridge-Routen.
ALTER TABLE event_typo3_drafts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE event_typo3_drafts IS
  'KI-Entwurf je Event für die Übernahme ins ÖAW-TYPO3 (Chrome-Extension, /api/typo3-bridge). draft: title, teaser, bodytext_html, seo_description, alternative_title, keywords, location, organizer, speaker, event_start, event_end, full_day, language_en.';
