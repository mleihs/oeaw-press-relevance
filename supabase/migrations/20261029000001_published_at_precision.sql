-- Genauigkeit von publications.published_at: day, month oder year.
--
-- ANLASS. published_at ist ein einzelnes `date` ohne Genauigkeit. Fehlende Teile
-- füllen die Quellen auf: TYPO3 setzte bis 2024 für „Monat bekannt“ den 15., die
-- Anreicherung und backfill_published_at_from_text() setzen den 1. Die Anzeige
-- (lib/shared/format-pub-date.ts) zeigte deshalb jeden 1. und 15. nur als Monat,
-- im Jänner nur als Jahr. Ein echter 15. Oktober 2026 (CrossRef published-online,
-- „Evolution of debris cover over glaciers in the Central Andes“) stand als
-- „Okt 2026“ in der Liste, mit dem Tooltip „Tag nicht überliefert“.
--
-- MESSUNG 2026-10-29 (Prod, 37.884 Publikationen):
--   * Tageshistogramm: 12.062 am 15., 7.350 am 1., sonst 460 bis 1.130 je Tag.
--   * Die RIS-Zeile `PY` kodiert die Genauigkeit: `2026/10/15`, `2015/10`,
--     `2025`. Monats- und Jahresangaben sind verlässlich (449 bzw. 1.174 Sätze,
--     alle passend zu published_at). Ein Tag 1/15 dort ist es nicht: bis 2024
--     liegen im RIS-Tagesformat 450 bis 750 Sätze je Jahr am 15. bei 30 bis 40
--     an anderen Tagen. Ab 2025 bricht die Spitze am 15. ein, am 1. bleibt sie.
--   * CrossRef bestätigte in einer Stichprobe 2 von 24 RIS-Daten am 15. auf den
--     Tag, bei anderen Tagen 5 von 10.
-- Ein 1. oder 15. lässt sich also nur über CrossRef `date-parts` bestätigen.
--
-- UMSETZUNG.
--   * crossref_date_parts (jsonb): die date-parts von published-print,
--     published-online und issued, z. B. [[2026,10,15],[2026,10]]. Schreibt die
--     Anreicherung (lib/server/enrichment/crossref.ts); Analyse-Seite, der
--     TYPO3-Import fasst sie nie an. NULL = nie bei CrossRef nachgesehen.
--   * published_at_precision: GENERATED aus published_at, ris und
--     crossref_date_parts. Jeder Schreibweg (Vollimport, Delta-Funktion,
--     Anreicherung) hält sie damit ohne eigenen Code aktuell.
--   * Wer pub_date_precision() ändert, muss die Spalte neu berechnen lassen
--     (UPDATE publications SET published_at = published_at): eine generierte
--     Spalte wird nur beim Schreiben der Zeile ausgewertet.
--
-- Regeln, erste zutreffende gewinnt (Spiegel: lib/shared/format-pub-date.ts):
--   1. CrossRef kennt genau dieses Datum mit Tag             → day
--   2. Tag nicht 1/15                                        → day
--   3. RIS nennt nur Jahr/Monat und passt                    → month / year
--   4. CrossRef kennt Jahr+Monat (ohne oder mit anderem Tag) → month
--   5. CrossRef kennt nur das Jahr, Datum im Jänner          → year
--   6. Rückfall wie bisher: Monat ≠ Jänner → month, sonst year

CREATE OR REPLACE FUNCTION public.pub_date_precision(pa date, ris text, cr jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  y int;
  m int;
  d int;
  r text[];
  e jsonb;
  cr_month boolean := false;
  cr_year boolean := false;
BEGIN
  IF pa IS NULL THEN
    RETURN NULL;
  END IF;
  y := extract(year FROM pa)::int;
  m := extract(month FROM pa)::int;
  d := extract(day FROM pa)::int;

  IF jsonb_typeof(cr) = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(cr) LOOP
      -- Nur Arrays aus ganzen Zahlen; alles andere übergehen, statt mit einem
      -- Cast-Fehler das schreibende UPDATE scheitern zu lassen. Zwei Schritte,
      -- weil SQL ein OR nicht von links nach rechts auswerten muss.
      CONTINUE WHEN jsonb_typeof(e) <> 'array';
      CONTINUE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e) x WHERE x::text !~ '^[0-9]{1,4}$');
      CONTINUE WHEN (e->>0)::int IS DISTINCT FROM y;
      IF jsonb_array_length(e) >= 3 AND (e->>1)::int = m AND (e->>2)::int = d THEN
        RETURN 'day';
      END IF;
      IF jsonb_array_length(e) >= 2 AND (e->>1)::int = m THEN
        cr_month := true;
      ELSIF jsonb_array_length(e) = 1 THEN
        cr_year := true;
      END IF;
    END LOOP;
  END IF;

  IF d NOT IN (1, 15) THEN
    RETURN 'day';
  END IF;

  r := regexp_match(ris, '(?:^|\n)PY\s+-\s+(\d{4})(?:/(\d{1,2}))?(?:/(\d{1,2}))?');
  IF r IS NOT NULL AND r[1]::int = y AND r[3] IS NULL THEN
    IF r[2] IS NOT NULL AND r[2]::int = m AND d = 1 THEN
      RETURN 'month';
    END IF;
    IF r[2] IS NULL AND m = 1 AND d = 1 THEN
      RETURN 'year';
    END IF;
  END IF;

  IF cr_month THEN
    RETURN 'month';
  END IF;
  IF cr_year AND m = 1 THEN
    RETURN 'year';
  END IF;
  RETURN CASE WHEN m <> 1 THEN 'month' ELSE 'year' END;
END;
$$;

COMMENT ON FUNCTION public.pub_date_precision(date, text, jsonb) IS
  'Genauigkeit von published_at (day/month/year) aus RIS-PY und CrossRef date-parts. Quelle der generierten Spalte publications.published_at_precision; Regeln in der Migration 20261029000001.';

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS crossref_date_parts jsonb;

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS published_at_precision text
  GENERATED ALWAYS AS (public.pub_date_precision(published_at, ris, crossref_date_parts)) STORED;

-- updated_at bleibt stehen, wenn ein UPDATE nur crossref_date_parts ändert.
-- Sonst stempelt der Backfill (scripts/backfill-crossref-dates.ts) rund 7.000
-- Zeilen neu, und die Review-Queue zeigt sie als „neu seit der letzten
-- Sitzung“ (findIdsByFreshness vergleicht updated_at). Jedes andere UPDATE,
-- auch eines ohne Änderung, stempelt wie bisher (trg_set_updated_at, das die
-- anderen Tabellen weiter nutzen). Eigene Funktion statt WHEN-Klausel:
-- Postgres verbietet in der WHEN-Bedingung eines BEFORE-Triggers den Zugriff
-- auf generierte Spalten von NEW, auch über die ganze Zeile.
-- published_at_precision fällt aus dem Vergleich, weil Postgres sie erst nach
-- den BEFORE-Triggern berechnet.
CREATE OR REPLACE FUNCTION public.trg_publications_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.crossref_date_parts IS DISTINCT FROM OLD.crossref_date_parts
     AND (to_jsonb(NEW) - ARRAY['crossref_date_parts', 'published_at_precision', 'updated_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['crossref_date_parts', 'published_at_precision', 'updated_at']) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS publications_set_updated_at ON publications;
CREATE TRIGGER publications_set_updated_at
BEFORE UPDATE ON publications
FOR EACH ROW EXECUTE FUNCTION public.trg_publications_set_updated_at();

COMMENT ON COLUMN publications.crossref_date_parts IS
  'CrossRef date-parts (published-print, published-online, issued), von der Anreicherung geschrieben. NULL = nicht nachgesehen.';
COMMENT ON COLUMN publications.published_at_precision IS
  'Genauigkeit von published_at: day, month oder year. Generiert über pub_date_precision().';
