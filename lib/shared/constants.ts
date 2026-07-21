/**
 * OeAW brand colour. Mirrors `--color-brand` in `app/globals.css` (Tailwind v4
 * `@theme`) — Tailwind utility classes (`bg-brand`, `text-brand`, `border-brand`,
 * including opacity modifiers like `bg-brand/10`) read from the CSS variable.
 *
 * This JS constant exists for the small set of places that pass colour as a
 * string (SVG fill/stroke attributes, recharts colour props) where Tailwind
 * utilities don't apply.
 */
export const BRAND_HEX = '#0047bb';

// Single source of truth for all consumers (UI + session-pipeline.mjs script).
// JSON file because mjs scripts can't `import` from .ts at runtime; both can
// import the same JSON cleanly. Dimension order = display order in the radar.
import scoreWeightsJson from './score-weights.json';
import eventScoreWeightsJson from './event-score-weights.json';

export const SCORE_DIMENSIONS = [
  'public_accessibility',
  'societal_relevance',
  'novelty_factor',
  'storytelling_potential',
  'media_timeliness',
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

// `satisfies` enforces shape: a missing or extra key in score-weights.json
// becomes a typecheck error, not a runtime surprise.
export const SCORE_WEIGHTS = scoreWeightsJson satisfies Record<ScoreDimension, number>;

export const SCORE_COLORS: Record<string, string> = {
  public_accessibility: '#3b82f6',
  societal_relevance: '#10b981',
  novelty_factor: '#f59e0b',
  storytelling_potential: '#8b5cf6',
  media_timeliness: '#ef4444',
};

export const SCORE_LABELS: Record<string, string> = {
  public_accessibility: 'Verständlichkeit',
  societal_relevance: 'Gesellschaftl. Relevanz',
  novelty_factor: 'Neuheit',
  storytelling_potential: 'Erzählpotenzial',
  media_timeliness: 'Aktualität',
};

// ─── Event-Relevanz (Veranstaltungsbetrieb) ────────────────────────────────
// Eigenes Dimensions-Set für Events: misst die Eignung fürs zentrale
// Veranstaltungsprogramm/-seite, NICHT Presse-Story-Potenzial wie bei Pubs.
export const EVENT_SCORE_DIMENSIONS = [
  'public_appeal',
  'scientific_significance',
  'reach',
  'timeliness',
] as const;
export type EventScoreDimension = (typeof EVENT_SCORE_DIMENSIONS)[number];

export const EVENT_SCORE_WEIGHTS = eventScoreWeightsJson satisfies Record<EventScoreDimension, number>;

export const EVENT_SCORE_COLORS: Record<string, string> = {
  public_appeal: '#0ea5e9',
  scientific_significance: '#8b5cf6',
  reach: '#10b981',
  timeliness: '#ef4444',
};

export const EVENT_SCORE_LABELS: Record<string, string> = {
  public_appeal: 'Öffentlichkeitswirkung',
  scientific_significance: 'Wissenschaftl. Bedeutung',
  reach: 'Reichweite',
  timeliness: 'Aktualität',
};

/**
 * Press-Score band thresholds for the UI. Used by `getScoreBand` in
 * `lib/score-utils.ts` and consumers (PressScoreBadge, ScoreDonut, ActivityChart
 * legend, EXPL tooltips).
 *
 * - HIGH = 0.7 — also used by PG `count_high` filter and `top_researchers`.
 * - MID  = 0.5 — UI-only ("Mittleres Story-Potenzial"). NOTE: the
 *                researcher-detail PG functions (supabase/migrations/20260428*)
 *                use a separate 0.4 mid threshold for the per-pub band column,
 *                hardcoded there — intentionally not centralized because it
 *                serves a different purpose (researcher-aggregate banding).
 * - LOW  = 0.3 — UI-only (orange → neutral cutoff in PressScoreBadge).
 */
export const SCORE_BAND_HIGH = 0.7;
export const SCORE_BAND_MID = 0.5;
export const SCORE_BAND_LOW = 0.3;

/**
 * Press-Similarity bands (cosine of SPECTER2 embeddings to press-cluster k-NN).
 * Used by `SimilarityIndicator` for visual band-coloring. Values are
 * deliberately tighter than `SCORE_BAND_*` because cosine similarity ranges
 * compress around 0.6–0.95 in practice (SPECTER2 always returns positive
 * similarity for academic text).
 */
export const PRESS_SIMILARITY_BAND_HIGH = 0.85;
export const PRESS_SIMILARITY_BAND_MID = 0.7;

/**
 * Fallback reviewer name when `settings.reviewerName` is empty. Surfaces in
 * flag-notes (`by`) and decision-attribution (`decided_by`). Kept in one place
 * so the client- and server-side fallbacks stay in sync — drift here would
 * silently fragment the audit trail.
 */
export const DEFAULT_REVIEWER_NAME = 'team';

/**
 * Single source of truth for enrichment-source labels and color tokens.
 * Consumed by the publications UI (source badges) and any future surface that
 * displays the enrichment cascade; the cascade itself runs unattended at import.
 */
export const SOURCE_LABELS: Record<string, string> = {
  crossref: 'CrossRef',
  openalex: 'OpenAlex',
  unpaywall: 'Unpaywall',
  semantic_scholar: 'Semantic Scholar',
  pdf: 'PDF',
  csv: 'CSV',
  webdb_summary: 'WebDB',
};

// Dark variants mirror the tint-badge convention (bg-<c>-500/15 + text-<c>-300)
// so the badges stay legible on the dark canvas; light mode is unchanged.
export const SOURCE_BADGE_CLASSES: Record<string, string> = {
  crossref: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  openalex: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  unpaywall: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  semantic_scholar: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  pdf: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  csv: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  webdb_summary: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
};

export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  crossref: 'DOI-basierte Metadaten: Titel, Abstract, Journal, Autoren, ISSN und Lizenzinfos.',
  openalex: 'Offene Forschungsdatenbank: Abstract, Zitationen, Themen-Tags und Open-Access-Status.',
  unpaywall: 'Findet frei zugängliche PDF-Volltext-Links zu Publikationen.',
  semantic_scholar: 'KI-gestützte Datenbank: Abstract, Zitationszahlen und Einfluss-Score.',
  pdf: 'Direkter PDF-Download von der Publikations-URL. Extrahiert den Volltext.',
  csv: 'Abstract aus der ursprünglich importierten CSV-Datei übernommen.',
  webdb_summary: 'Vom Institut kuratierte Pressezusammenfassung (DE/EN) aus der WebDB.',
};

/** OpenRouter-Preise in US-Dollar je 1 Mio. Tokens, getrennt nach Richtung. */
export interface ModelPricing {
  promptUsd: number;
  completionUsd: number;
}

export interface LLMModel {
  value: string;
  label: string;
  description: string;
  tier: 'recommended' | 'budget' | 'balanced' | 'premium' | 'free';
  /**
   * Preisstand vom letzten Live-Check (unten datiert). NUR Fallback: die
   * Anzeige holt die aktuellen Preise über /api/llm/models von OpenRouter
   * (lib/server/llm-pricing.ts). Hier stehen sie, damit die App auch ohne
   * Netz eine ehrliche Größenordnung nennt statt gar nichts.
   */
  fallbackPricing: ModelPricing;
}

/**
 * Der kuratierte Modell-Picker. Bewusst KURZ: jedes zusätzliche Modell ist ein
 * weiteres Kalibrierungs-Regime im selben Korpus, und Scores aus zwei Regimen
 * sind nicht vergleichbar (Befund docs/RESUME_SCORING_SPLIT_REVIEW.md).
 * Entfernt am 2026-07-21: google/gemini-2.0-flash-001 (auf OpenRouter 404),
 * meta-llama/llama-3.2-3b-instruct:free (kaputtes JSON), openai/gpt-4o-mini,
 * anthropic/claude-3.5-haiku, anthropic/claude-sonnet-4 (durch Sonnet 5
 * ersetzt). Historische `llm_model`-Strings in der DB rendern weiter: der
 * ModelBadge in components/publication-table.tsx fällt auf den Teil nach dem
 * Slash zurück.
 *
 * Fallback-Preise: OpenRouter-Live-Check 2026-07-21.
 */
export const LLM_MODELS: LLMModel[] = [
  {
    value: 'anthropic/claude-opus-4.8',
    label: 'Claude Opus 4.8',
    description:
      'Kalibrierungskonsistent: dasselbe Modell, mit dem das bestehende Korpus in-chat bewertet wurde. Beste Pitches, teuerste Option.',
    tier: 'recommended',
    fallbackPricing: { promptUsd: 5, completionUsd: 25 },
  },
  {
    value: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
    description:
      'Deutlich günstiger als Opus bei guter Textqualität. Kleine Abweichungen zur Opus-Kalibrierung sind möglich.',
    tier: 'balanced',
    fallbackPricing: { promptUsd: 2, completionUsd: 10 },
  },
  {
    value: 'deepseek/deepseek-chat',
    label: 'DeepSeek Chat',
    description:
      'Günstigste Option, aber Vorsicht: bewertet deutlich höher als das Opus-kalibrierte Korpus (gemessen rund 0,53 statt 0,25). Die Scores sind dann nicht mehr vergleichbar.',
    tier: 'budget',
    fallbackPricing: { promptUsd: 0.20, completionUsd: 0.80 },
  },
];

/** Vorbelegung des Modell-Pickers und Server-Fallback (lib/server/llm.ts). */
export const DEFAULT_LLM_MODEL = 'anthropic/claude-opus-4.8';

/**
 * Preisannahme für ein Modell, das nicht im kuratierten Picker steht — etwa
 * ein per `x-llm-model`-Header oder `LLM_DEFAULT_MODEL` gesetztes. Bewusst
 * konservativ und in beiden Richtungen gleich: lieber zu teuer geschätzt als
 * ein Lauf, der billiger aussieht, als er war.
 */
export const UNKNOWN_MODEL_PRICING: ModelPricing = { promptUsd: 5, completionUsd: 5 };

/** Statische Preise eines Modells. Nur Rückfallebene — die Nachkalkulation
 *  nimmt die Live-Preise (lib/server/llm-pricing.ts). */
export function fallbackPricingFor(model: string): ModelPricing {
  return LLM_MODELS.find((m) => m.value === model)?.fallbackPricing ?? UNKNOWN_MODEL_PRICING;
}

/** „$5 / $25 je M" bzw. „gratis". Ein Format für Modal und Social-Refresh. */
export function formatModelPricing(p: ModelPricing): string {
  if (p.promptUsd === 0 && p.completionUsd === 0) return 'gratis';
  const usd = (n: number) => `$${Number(n.toFixed(2))}`;
  return `${usd(p.promptUsd)} / ${usd(p.completionUsd)} je M`;
}

/**
 * Enrichment / analysis status pipeline. Used in the detail header and the
 * publication-table StatusBadge.
 */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  enriched: 'Angereichert',
  partial: 'Teilweise',
  analyzed: 'Analysiert',
  failed: 'Fehlgeschlagen',
};

// Status → Badge-Zustands-Variante (components/ui/badge.tsx §2.3-Varianten).
// Die Varianten sind der SSOT der Tint/Ink-Klassen; hier nur noch das Mapping,
// damit Status-Chips nicht per Klassen-String an der Badge-Definition
// vorbeidriften.
export const STATUS_BADGE_VARIANTS: Record<
  string,
  'neutral' | 'info' | 'success' | 'warning' | 'danger'
> = {
  pending: 'neutral',
  enriched: 'info',
  partial: 'warning',
  analyzed: 'success',
  failed: 'danger',
};

/**
 * Open-Access status labels. WebDB delivers a heterogeneous mix
 * (CrossRef-style `oa_gold`, free-text `Open`/`Restricted`, `nicht_oacc`).
 * Falls back to the raw value if no label is mapped.
 */
export const OA_LABELS: Record<string, string> = {
  oa_gold: 'OA Gold',
  oa_postprint: 'OA Postprint',
  oa_preprint: 'OA Preprint',
  nicht_oacc: 'kein OA',
  Open: 'OA',
  Restricted: 'eingeschränkt',
  Unknown: 'unbekannt',
};
