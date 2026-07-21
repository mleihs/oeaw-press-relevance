import 'server-only';
import { NextRequest } from 'next/server';
import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';

/**
 * OpenRouter API key. Env takes priority, but a per-request header fallback
 * is kept because users may legitimately bring their own key for cost
 * ownership.
 */
export function getOpenRouterKey(req: NextRequest): string {
  const key = process.env.OPENROUTER_API_KEY || req.headers.get('x-openrouter-key') || '';
  if (!key) {
    throw new Error('OpenRouter API key not configured');
  }
  return key;
}

/**
 * Model selection. Header wins so users can override per-request from the
 * settings panel; falls back to LLM_DEFAULT_MODEL env, then DEFAULT_LLM_MODEL
 * (Opus 4.8 — das Modell, mit dem das bestehende Korpus bewertet wurde;
 * Kalibrierungs-Begründung in lib/shared/constants.ts).
 */
export function getLLMModel(req: NextRequest): string {
  return (
    req.headers.get('x-llm-model') ||
    process.env.LLM_DEFAULT_MODEL ||
    DEFAULT_LLM_MODEL
  );
}
