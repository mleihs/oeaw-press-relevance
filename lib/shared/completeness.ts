import type { Publication } from './types';

// Minimum usable abstract/summary length to attempt a press score. Mirrors the
// scoring ingest gate (MIN_CONTENT_LEN in scripts/session-pipeline.mjs) so the
// UI explanation and the scorer agree on what counts as "has content".
export const CONTENT_MIN_CHARS = 120;

export type CompletenessVariant = 'success' | 'info' | 'warning' | 'neutral';

export interface Completeness {
  /** true once a press score exists; the detail view then shows the analysis. */
  analyzed: boolean;
  variant: CompletenessVariant;
  /** One-line state headline. */
  headline: string;
  /** Per-publication explanation: what is present, what is missing, and why. */
  detail: string;
}

/** The publication fields the completeness verdict reads. */
export type CompletenessInput = Pick<
  Publication,
  | 'analysis_status'
  | 'press_score'
  | 'enrichment_status'
  | 'summary_de'
  | 'summary_en'
  | 'enriched_abstract'
  | 'abstract'
  | 'doi'
>;

/**
 * Length, in characters, of the best available content source. Priority mirrors
 * the scorer's pickContent: curated summary first, then abstracts.
 */
export function bestContentLength(pub: CompletenessInput): number {
  const text =
    pub.summary_de?.trim() ||
    pub.summary_en?.trim() ||
    pub.enriched_abstract?.trim() ||
    pub.abstract?.trim() ||
    '';
  return text.length;
}

/**
 * Per-publication verdict on why a pub does or does not carry a press score.
 *
 * Pure and UI-agnostic: returns a variant + headline + a detail sentence
 * composed from THIS publication's actual state (content length, DOI presence,
 * enrichment status). The detail view renders it so every incomplete pub gets
 * an individual explanation instead of a generic status badge. Single source of
 * truth shared by the detail banner (and reusable by any list/tooltip).
 */
export function publicationCompleteness(pub: CompletenessInput): Completeness {
  const analyzed = pub.analysis_status === 'analyzed' && pub.press_score !== null;
  if (analyzed) {
    return {
      analyzed: true,
      variant: 'success',
      headline: 'Bewertet',
      detail:
        'Diese Publikation wurde inhaltlich bewertet. Story Score, Pitch und Begründung stehen weiter unten.',
    };
  }

  const len = bestContentLength(pub);
  const hasContent = len >= CONTENT_MIN_CHARS;
  const hasDoi = Boolean(pub.doi && pub.doi.trim());

  // A scoring run happened but produced no valid result: distinct from "never
  // attempted". Independent of content, so checked first.
  if (pub.analysis_status === 'failed') {
    return {
      analyzed: false,
      variant: 'warning',
      headline: 'Bewertung fehlgeschlagen',
      detail:
        'Eine Scoring-Session lief, lieferte aber keine gültige Bewertung. Ein erneuter Lauf, gegebenenfalls mit besserer Textgrundlage, ist nötig.',
    };
  }

  if (hasContent) {
    return {
      analyzed: false,
      variant: 'info',
      headline: 'Noch nicht bewertet',
      detail: `Eine Textgrundlage liegt vor (${len} Zeichen), die inhaltliche Bewertung steht aber noch aus. Die Publikation lässt sich über die Analyse-Seite jederzeit nachbewerten.`,
    };
  }

  // No usable content: explain by enrichment state and DOI presence.
  switch (pub.enrichment_status) {
    case 'failed':
      return {
        analyzed: false,
        variant: 'warning',
        headline: 'Nicht bewertbar: kein Abstract',
        detail: hasDoi
          ? 'Ein DOI ist vorhanden, doch über die externen Quellen (CrossRef, OpenAlex) ließ sich kein Abstract laden. Ohne Textgrundlage ist keine inhaltliche Bewertung möglich.'
          : 'Es fehlen sowohl Abstract als auch Zusammenfassung, und ohne DOI greift die externe Anreicherung nicht. Ohne Textgrundlage ist keine inhaltliche Bewertung möglich.',
      };
    case 'partial':
      return {
        analyzed: false,
        variant: 'warning',
        headline: 'Nur teilweise angereichert',
        detail:
          'Die Anreicherung lieferte Metadaten, aber keinen ausreichend langen Abstract-Text. Für eine inhaltliche Bewertung fehlt die Grundlage.',
      };
    case 'pending':
      return {
        analyzed: false,
        variant: 'neutral',
        headline: 'Anreicherung ausstehend',
        detail:
          'Diese Publikation wurde noch nicht angereichert. Sobald ein Abstract oder eine Zusammenfassung vorliegt, kann sie bewertet werden.',
      };
    case 'enriched':
    default:
      return {
        analyzed: false,
        variant: 'neutral',
        headline: 'Kein bewertbarer Inhalt',
        detail: `Die Anreicherung ist abgeschlossen, es liegt aber kein ausreichend langer Text vor (${len} von mindestens ${CONTENT_MIN_CHARS} Zeichen). Eine inhaltliche Bewertung ist daher nicht möglich.`,
      };
  }
}
