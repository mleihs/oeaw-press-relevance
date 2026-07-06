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
