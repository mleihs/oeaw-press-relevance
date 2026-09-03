// Gemeinsame Anzeige-Helfer der beiden Publikations-Renderer
// (components/publication-table.tsx für /review und
// app/publications/_components/publication-list.tsx für /publications).
//
// Die großen Bausteine (PressScoreBadge, ScoreBar, VenueLine, HaikuBlock,
// DecisionBadge, displayTitle/displayAuthor) sind BEREITS geteilte Module —
// hier landet nur die Ableitungs-Logik, die beide Renderer bislang je einmal
// lokal dupliziert hatten. Bewusst KEINE gemeinsamen Karten-/Zeilen-Layouts:
// Tabelle (Alt-Design, /review-Sitzung) und Liste (Toolkit-Redesign) sind
// gestalterisch absichtlich verschieden.

import { displayTitle } from '@/lib/shared/publication-display';
import { enrichmentReason } from '@/lib/shared/enrichment-reason';

/** Strukturelle Mindestfelder — deckt Publication (types/publications) ebenso
 *  wie PublicationListItem (lib/server/publications/list) ab. */
interface TypeLabelFields {
  publication_type: string | null;
  publication_type_lookup?: { name_de: string } | null;
}

interface NaReasonFields extends TypeLabelFields {
  enrichment_status: string | null;
  doi: string | null;
  published_at: string | null;
}

interface TitleFields {
  title: string;
  original_title: string | null;
  citation: string | null;
}

/**
 * Per-row „warum kein Score / warum kein Enrichment"-Grund, gewoben aus DOI,
 * Typ und Datum der Zeile (lib/shared/enrichment-reason). Einmal pro Zeile
 * berechnet und sowohl dem Score-Badge als auch dem (optionalen)
 * Enrichment-StatusBadge gereicht, damit beide nie verschiedene Geschichten
 * erzählen. `publication_type` ist bei jeder failed-Zeile leer, deshalb springt
 * das Lookup-Label ein.
 */
export function pubNaReason(pub: NaReasonFields): string | null {
  return enrichmentReason(
    {
      enrichment_status: pub.enrichment_status,
      doi: pub.doi,
      publication_type: pubTypeLabel(pub),
      published_at: pub.published_at,
    },
    new Date(),
  );
}

/** Typ-Label mit Lookup-Fallback (failed-Zeilen haben einen leeren
 *  `publication_type`-String). `null`, wenn beides fehlt — den Platzhalter
 *  („Unbekannt" o.ä.) bestimmt der Aufrufer. */
export function pubTypeLabel(pub: TypeLabelFields): string | null {
  return pub.publication_type || pub.publication_type_lookup?.name_de || null;
}

/** Anzeigetitel einer Publikations-Zeile: Originaltitel vor lokalisiertem
 *  Titel, ggf. per Citation verlängert (lib/shared/publication-display). */
export function pubDisplayTitle(pub: TitleFields): string {
  return displayTitle(pub.original_title || pub.title, pub.citation);
}
