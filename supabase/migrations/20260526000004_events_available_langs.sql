-- TYPO3 news rows are stored once per language: an original (l10n_parent=0)
-- plus optional translations (l10n_parent points back to the original uid).
-- Before this migration the sync mirrored every translation as a separate
-- event row, surfacing the same event twice (DE + EN) in the /events list.
--
-- Fix: the sync now selects only originals and aggregates the available
-- languages into this array. The list view renders a single row per
-- event with a `DE+EN` style language badge.

ALTER TABLE events
  ADD COLUMN available_langs TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN events.available_langs IS
  'Languages this event is available in, from sys_language_uid mapping (0=de, 1=en, -1=mul). Includes the original language + every translation. Drives the lang-badge on the list view.';
