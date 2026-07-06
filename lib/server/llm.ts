import 'server-only';
import { NextRequest } from 'next/server';

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
 * settings panel; falls back to LLM_DEFAULT_MODEL env, then a sensible
 * default.
 */
export function getLLMModel(req: NextRequest): string {
  return (
    req.headers.get('x-llm-model') ||
    process.env.LLM_DEFAULT_MODEL ||
    'anthropic/claude-sonnet-4'
  );
}
