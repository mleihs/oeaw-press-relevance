-- Woher wissen wir von diesem Event?
--
-- Anlass (2026-09-03): der Nacht-Ingest liest den JSON-Export
-- `event_news_grouped`, und der Export ist ein Delta-Feed über eine FESTE
-- Menge von News-Ordnern. Legt eine Redaktion ein Event in einem Ordner an,
-- den der Export nicht einsammelt, kommt es nie bei uns an — und es fällt
-- niemandem auf, weil nur etwas fehlt, das nie da war. Gemessen am
-- WebDB-Dump vom 2026-09-03 betraf das 8 künftige Events, darunter das
-- "2nd Exchange Meeting of SCOOP" des IMAFO (pid 7523, seit 14.08. angelegt,
-- an keinem der 35 archivierten Export-Tage ausgeliefert).
--
-- Diese Events lassen sich nur über einen WebDB-Dump nachziehen. Damit man
-- sie danach von den regulär eingelaufenen unterscheiden kann — in der Liste,
-- in einer Auswertung, und beim nächsten Mal —, trägt jede Zeile jetzt ihre
-- Herkunft.
--
-- 'feed'       = kam über den nächtlichen JSON-Export (der Normalfall).
-- 'webdb_dump' = kam NUR über einen Dump-Abzug, der Export hat es nie geliefert.
--
-- Der Default macht Bestandszeilen zu 'feed'. Das ist eine Untergrenze, keine
-- Messung: seit prod-first ist der Export der einzige automatische Schreibpfad
-- auf prod, ein paar sehr alte Zeilen stammen aber noch aus einem manuellen
-- `sync-events`-Lauf. Rückwirkend unterscheidbar sind sie nicht — der Wert
-- 'webdb_dump' wird deshalb ausschließlich beim Dump-Import gesetzt und ist
-- damit ab heute eine belastbare Aussage.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS discovered_via text NOT NULL DEFAULT 'feed';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_discovered_via_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_discovered_via_check
  CHECK (discovered_via IN ('feed', 'webdb_dump'));

COMMENT ON COLUMN public.events.discovered_via IS
  'feed = über den nächtlichen JSON-Export gekommen; webdb_dump = nur über einen WebDB-Dump gefunden, der Export liefert diesen News-Ordner nicht.';

-- Die Liste filtert/sortiert nach dem Marker, sobald mehr als eine Handvoll
-- Zeilen ihn tragen; partiell, weil 'feed' die überwältigende Mehrheit ist.
CREATE INDEX IF NOT EXISTS idx_events_discovered_via_dump
  ON public.events (event_at)
  WHERE discovered_via = 'webdb_dump';
