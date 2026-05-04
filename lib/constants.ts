export const PUBLICATION_TYPE_MAP: Record<string, string> = {
  '0': 'Other',
  '1': 'Journal Article',
  '3': 'Book Chapter',
  '4': 'Book',
  '5': 'Edited Volume',
  '6': 'Conference Paper',
  '7': 'Report',
  '8': 'Dissertation',
  '10': 'Book Anthology',
  '12': 'Working Paper',
  '13': 'Thesis',
  '14': 'Dataset',
  '15': 'Conference Contribution',
  '16': 'Other',
  '17': 'Book Section',
  '18': 'Popular Science',
  '19': 'Miscellaneous',
  '20': 'Other Contribution',
  '21': 'Working Paper (Preprint)',
  '22': 'Non-Textual Output',
  '23': 'Scholarly Edition',
  '24': 'Editorial/Review',
  '25': 'Research Data',
  '26': 'Creative Output',
};

export const OA_TRUE_VALUES = new Set([
  'oa_gold', 'oa_postprint', 'oa_preprint', 'Open', '1', 'oacc',
]);

export const OA_FALSE_VALUES = new Set([
  'nicht_oacc', 'Restricted', 'Unknown', '', '0',
]);

// Single source of truth for all consumers (UI + session-pipeline.mjs script).
// JSON file because mjs scripts can't `import` from .ts at runtime; both can
// import the same JSON cleanly. Dimension order = display order in the radar.
import scoreWeightsJson from './score-weights.json';

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
 * Single source of truth for enrichment-source labels and color tokens.
 * Per-component overrides (e.g. enrichment-modal uses "PDF Extract") still
 * live next to the component if intentionally different.
 */
export const SOURCE_LABELS: Record<string, string> = {
  crossref: 'CrossRef',
  openalex: 'OpenAlex',
  unpaywall: 'Unpaywall',
  semantic_scholar: 'Semantic Scholar',
  pdf: 'PDF',
  csv: 'CSV',
  hebowebdb_summary: 'WebDB',
};

export const SOURCE_BADGE_CLASSES: Record<string, string> = {
  crossref: 'bg-violet-100 text-violet-700',
  openalex: 'bg-sky-100 text-sky-700',
  unpaywall: 'bg-emerald-100 text-emerald-700',
  semantic_scholar: 'bg-orange-100 text-orange-700',
  pdf: 'bg-rose-100 text-rose-700',
  csv: 'bg-teal-100 text-teal-700',
  hebowebdb_summary: 'bg-indigo-100 text-indigo-700',
};

export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  crossref: 'DOI-basierte Metadaten: Titel, Abstract, Journal, Autoren, ISSN und Lizenzinfos.',
  openalex: 'Offene Forschungsdatenbank: Abstract, Zitationen, Themen-Tags und Open-Access-Status.',
  unpaywall: 'Findet frei zugängliche PDF-Volltext-Links zu Publikationen.',
  semantic_scholar: 'KI-gestützte Datenbank: Abstract, Zitationszahlen und Einfluss-Score.',
  pdf: 'Direkter PDF-Download von der Publikations-URL — extrahiert den Volltext.',
  csv: 'Abstract aus der ursprünglich importierten CSV-Datei übernommen.',
  hebowebdb_summary: 'Vom Institut kuratierte Pressezusammenfassung (DE/EN) aus der WebDB.',
};

export interface LLMModel {
  value: string;
  label: string;
  description: string;
  tier: 'recommended' | 'budget' | 'balanced' | 'premium' | 'free';
  costPerMillionTokens: number;
}

export const LLM_MODELS: LLMModel[] = [
  {
    value: 'deepseek/deepseek-chat',
    label: 'DeepSeek Chat',
    description: 'Bestes Preis-Leistungs-Verhältnis. Starke JSON-Ausgabe, gutes Deutsch, zuverlässige Bewertungen.',
    tier: 'recommended',
    costPerMillionTokens: 0.60,
  },
  {
    value: 'google/gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'Extrem günstig und schnell. Ideal für große Batches. Gute strukturierte Ausgabe.',
    tier: 'budget',
    costPerMillionTokens: 0.15,
  },
  {
    value: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Solide Allround-Performance. Zuverlässiges JSON und gute Textqualität.',
    tier: 'balanced',
    costPerMillionTokens: 0.6,
  },
  {
    value: 'anthropic/claude-3.5-haiku',
    label: 'Claude 3.5 Haiku',
    description: 'Schnell und günstig von Anthropic. Gute Textqualität für den Preis.',
    tier: 'balanced',
    costPerMillionTokens: 1.0,
  },
  {
    value: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    description: 'Premium-Qualität. Beste Pitches und differenzierteste Bewertungen. Teuer.',
    tier: 'premium',
    costPerMillionTokens: 9.0,
  },
  {
    value: 'meta-llama/llama-3.2-3b-instruct:free',
    label: 'Llama 3.2 3B (Free)',
    description: 'Kostenlos aber kleines Modell (3B Parameter). Deutsch-Qualität eingeschränkt, JSON manchmal fehlerhaft.',
    tier: 'free',
    costPerMillionTokens: 0.0,
  },
];

export const COST_PER_MILLION_TOKENS: Record<string, number> = Object.fromEntries(
  LLM_MODELS.map(m => [m.value, m.costPerMillionTokens])
);

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

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-neutral-100 text-neutral-600',
  enriched: 'bg-[#0047bb]/10 text-[#0047bb]',
  partial: 'bg-amber-100 text-amber-900',
  analyzed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
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
