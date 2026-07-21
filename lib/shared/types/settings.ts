/** Per-browser app settings (Settings page → localStorage). */

export interface AppSettings {
  openrouterApiKey: string;
  minWordCount: number;
  batchSize: number;
  // Used as the `by` field for flag notes and decision attribution.
  // Empty string falls back to "team" server-side.
  reviewerName: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  minWordCount: 100,
  batchSize: 3,
  reviewerName: '',
};

/** Ein Eintrag des Modell-Pickers, wie GET /api/llm/models ihn ausliefert:
 *  Metadaten aus LLM_MODELS plus den zum Abrufzeitpunkt gültigen OpenRouter-
 *  Preisen (`stale: true` = Fallback, OpenRouter war nicht erreichbar). */
export interface ModelPickerEntry {
  value: string;
  label: string;
  description: string;
  tier: 'recommended' | 'budget' | 'balanced' | 'premium' | 'free';
  pricing: { promptUsd: number; completionUsd: number; stale: boolean };
}

export interface ModelPickerResponse {
  models: ModelPickerEntry[];
}
