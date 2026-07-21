-- Social-Beobachtung: Abrufzeitraum in die Einstellungen, Retention raus.
--
-- Befund (Audit 2026-07-21): das Feature trug FÜNF Zeitfenster, und ausgerechnet
-- das folgenreichste stand nicht in den Einstellungen. `SOCIAL_WINDOW_DAYS`
-- (Env, Default 14) bestimmt, wie weit zurück Posts von Apify geholt werden —
-- also was der Lauf an Guthaben kostet — und war nur über eine Env-Variable
-- erreichbar, während die zwei harmloseren Fenster (frisch/Themen) eine
-- Oberfläche hatten. Der Wert ist weder auf Coolify noch auf Vercel gesetzt,
-- überall greift der Code-Default 14; diese Migration schreibt genau diesen
-- Wert fest und ändert damit kein Verhalten.
--
-- `retention_days` entfällt ersatzlos:
--   * Nie eingeschaltet (NULL seit dem Anlegen der Zeile am 2026-06-15).
--   * Wirkungslos: 91 Posts / 792 kB nach sechs Wochen Betrieb, kein Post
--     älter als 90 Tage. Der Abrufzeitraum begrenzt die Menge schon selbst,
--     das begründete „begrenzt das DB-Wachstum" traf nie zu.
--   * Gefährlich: der Wert war unabhängig validiert (1-3650), ohne Kopplung an
--     die anderen Fenster. Eine Retention unterhalb des Themen-Fensters hätte
--     dem Lagebild bei jedem Refresh kommentarlos die Datenbasis gelöscht.
--
-- Statt der fehlenden Kopplung erzwingt die neue CHECK-Bedingung die Ordnung
-- der drei verbleibenden Fenster. Der aktuelle Prod-Zustand (7 / 14 / 14)
-- erfüllt sie bereits.
--
-- ROLLBACK:
--   ALTER TABLE social_settings DROP CONSTRAINT social_settings_window_order_check;
--   ALTER TABLE social_settings DROP COLUMN fetch_window_days;
--   ALTER TABLE social_settings ADD COLUMN retention_days integer;
--   ALTER TABLE social_settings ADD CONSTRAINT social_settings_retention_check
--     CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650);
--   (retention_days war auf Prod durchgehend NULL — kein Datenverlust.)

ALTER TABLE social_settings
  ADD COLUMN fetch_window_days integer NOT NULL DEFAULT 14;

ALTER TABLE social_settings
  ADD CONSTRAINT social_settings_fetch_check
  CHECK (fetch_window_days BETWEEN 1 AND 365);

ALTER TABLE social_settings DROP COLUMN retention_days;

-- Die Ordnung, die vorher niemand erzwungen hat: was angezeigt wird, muss im
-- ausgewerteten Zeitraum liegen, und der wiederum im abgerufenen. Sonst zeigt
-- die Oberfläche ein Fenster an, für das gar keine Posts geholt wurden.
ALTER TABLE social_settings
  ADD CONSTRAINT social_settings_window_order_check
  CHECK (fresh_window_days <= theme_window_days
     AND theme_window_days <= fetch_window_days);

COMMENT ON COLUMN social_settings.fetch_window_days IS
  'Abrufzeitraum: wie weit zurück Posts von Apify geholt werden. Das teuerste der drei Fenster (Apify rechnet je Ergebnis ab) und die Obergrenze für die beiden anderen. Bis 2026-07-21 als Env-Variable SOCIAL_WINDOW_DAYS versteckt.';

COMMENT ON COLUMN social_settings.theme_window_days IS
  'Auswertungszeitraum: woraus das LLM-Lagebild entsteht — UND, über social_theme_snapshots.window_days, das Anzeigefenster der Dashboard-Kachel (lib/server/social/dashboard.ts). Die alte UI behauptete hier „unabhängig vom Anzeige-Fenster"; das stimmte nie.';

COMMENT ON COLUMN social_settings.fresh_window_days IS
  'Ab wann ein Post in der Liste als „älter" einsortiert wird (app/social/_components/group-section.tsx). Reine Darstellungsfrage.';
