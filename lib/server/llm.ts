import 'server-only';
import { NextRequest } from 'next/server';
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '@/lib/shared/constants';
import { log } from '@/lib/server/log';

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
 * Allowlist für den `x-llm-model`-Header: exakt der kuratierte Modell-Picker
 * (LLM_MODELS in lib/shared/constants.ts — dieselbe Quelle, aus der
 * /api/llm/models die Auswahl der UI speist). Der Header ist Client-Input
 * hinter dem geteilten Gate-Cookie; ungeprüft könnte jeder Gate-Inhaber ein
 * beliebiges (teuerstes) OpenRouter-Modell pro Request erzwingen.
 */
const HEADER_MODEL_ALLOWLIST = new Set(LLM_MODELS.map((m) => m.value));

/**
 * Validierter `x-llm-model`-Header oder null. Werte außerhalb der Allowlist
 * werden ignoriert (Debug-Log statt 400 — die UI kann nur Allowlist-Werte
 * senden, alles andere ist Handarbeit und fällt auf den Default zurück).
 */
export function getRequestedModel(req: NextRequest): string | null {
  const requested = req.headers.get('x-llm-model');
  if (!requested) return null;
  if (HEADER_MODEL_ALLOWLIST.has(requested)) return requested;
  log.debug('x-llm-model außerhalb der Modell-Allowlist ignoriert', { requested });
  return null;
}

/**
 * Model selection. Header wins so users can override per-request from the
 * settings panel (nur Allowlist-Werte, s. getRequestedModel); falls back to
 * LLM_DEFAULT_MODEL env, then DEFAULT_LLM_MODEL
 * (Opus 4.8 — das Modell, mit dem das bestehende Korpus bewertet wurde;
 * Kalibrierungs-Begründung in lib/shared/constants.ts).
 */
export function getLLMModel(req: NextRequest): string {
  return (
    getRequestedModel(req) ||
    process.env.LLM_DEFAULT_MODEL ||
    DEFAULT_LLM_MODEL
  );
}
