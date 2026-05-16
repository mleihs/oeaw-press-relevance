'use client';

import { AppSettings, DEFAULT_SETTINGS } from '@/lib/shared/types';

const STORAGE_KEY = 'oeaw-press-relevance-settings';
const SETTINGS_EVENT = 'oeaw-settings-change';

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

// useSyncExternalStore demands a referentially-stable snapshot: returning a
// fresh object every call would loop the renderer. Cache by the raw stored
// string so the reference only changes when localStorage actually changes.
let snapshotRaw: string | null = null;
let snapshotValue: AppSettings = DEFAULT_SETTINGS;

export function loadSettingsSnapshot(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === snapshotRaw) return snapshotValue;
  snapshotRaw = raw;
  try {
    snapshotValue = raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : DEFAULT_SETTINGS;
  } catch {
    snapshotValue = DEFAULT_SETTINGS;
  }
  return snapshotValue;
}

export function subscribeSettings(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SETTINGS_EVENT, onChange);
  };
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function getApiHeaders(): Record<string, string> {
  const settings = loadSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Supabase URL/Key are server-env exclusively (B2). LLM model selection is
  // per-batch and set inside the AnalysisModal — not a global localStorage pref.
  // Only the OpenRouter key (user-owned for cost ownership) is header-bound.
  if (settings.openrouterApiKey) headers['x-openrouter-key'] = settings.openrouterApiKey;
  return headers;
}
