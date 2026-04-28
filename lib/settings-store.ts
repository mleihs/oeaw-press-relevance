'use client';

import { AppSettings, DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'oeaw-press-relevance-settings';

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getApiHeaders(): Record<string, string> {
  const settings = loadSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Supabase URL/Key are NEVER sent from the browser anymore (B2): they live in
  // server env exclusively. Only OpenRouter key (user-owned) and model
  // selection remain header-bound for per-user customization.
  if (settings.openrouterApiKey) headers['x-openrouter-key'] = settings.openrouterApiKey;
  if (settings.llmModel) headers['x-llm-model'] = settings.llmModel;
  return headers;
}
