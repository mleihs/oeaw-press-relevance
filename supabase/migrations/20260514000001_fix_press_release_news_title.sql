-- Fix a column-mapping bug introduced by the 2026-05-09 consolidation migration
-- (20260509000003_press_releases_consolidation.sql).
--
-- That migration moved data from `publications.press_release_*` into the
-- new `press_releases` table with this mapping:
--   publications.press_release_title  →  press_releases.paper_title
--
-- But `publications.press_release_title` actually held the **German news
-- article title** from oeaw.ac.at/news (e.g. „Quantenwirbel liefern Beleg
-- für Suprafluidität") — not the academic paper title (e.g. „Observation
-- of vortices in a dipolar supersolid"). So 114 of 142 press_releases now
-- have the news title sitting in the `paper_title` column and `news_title`
-- empty.
--
-- Effect on /press-releases: the News-Titel column rendered "–" for those
-- 114 rows because the UI reads `pr.news_title`.
--
-- Fix: move paper_title → news_title for rows where news_title is empty.
-- Set paper_title to NULL — the publication-side JOIN already provides the
-- canonical academic title (`pub.title`), so we don't need a duplicate.

UPDATE press_releases
SET news_title = paper_title,
    paper_title = NULL
WHERE (news_title IS NULL OR news_title = '')
  AND paper_title IS NOT NULL;
