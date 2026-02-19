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

export const SCORE_WEIGHTS: Record<string, number> = {
  public_accessibility: 0.20,
  societal_relevance: 0.25,
  novelty_factor: 0.20,
  storytelling_potential: 0.20,
  media_timeliness: 0.15,
};

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
