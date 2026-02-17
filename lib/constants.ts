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
  public_accessibility: 'Accessibility',
  societal_relevance: 'Societal Relevance',
  novelty_factor: 'Novelty',
  storytelling_potential: 'Storytelling',
  media_timeliness: 'Timeliness',
};

export const LLM_MODELS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B (Free)' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
];

export const COST_PER_MILLION_TOKENS: Record<string, number> = {
  'anthropic/claude-sonnet-4': 9.0,
  'anthropic/claude-3.5-sonnet': 9.0,
  'deepseek/deepseek-chat': 0.5,
  'meta-llama/llama-3.2-3b-instruct:free': 0.0,
  'google/gemini-2.0-flash-001': 0.15,
  'openai/gpt-4o-mini': 0.6,
  'openai/gpt-4o': 7.5,
};
