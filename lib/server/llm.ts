import 'server-only';
import { NextRequest } from 'next/server';
import { LLM_MODELS } from '@/lib/shared/constants';
import { log } from '@/lib/server/log';
import { envKeyFor, providerFor } from '@/lib/server/llm-client';

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
 * Key für einen Aufruf mit `model`, passend zum Anbieter, den providerFor
 * wählt: ANTHROPIC_API_KEY für `anthropic/*` (gesetzt, sonst wäre der
 * Anbieter OpenRouter), sonst der OpenRouter-Key samt Header-Fallback.
 */
export function getLLMKey(req: NextRequest, model: string): string {
  return providerFor(model) === 'anthropic' ? (envKeyFor(model) as string) : getOpenRouterKey(req);
}

/**
 * Allowlist für den `x-llm-model`-Header: exakt der kuratierte Modell-Picker
 * (LLM_MODELS in lib/shared/constants.ts, dieselbe Quelle, aus der
 * /api/llm/models die Auswahl der UI speist). Der Header ist Client-Input
 * hinter dem geteilten Gate-Cookie; ungeprüft könnte jeder Gate-Inhaber ein
 * beliebiges (teuerstes) Modell pro Request erzwingen. Nur noch der
 * Social-Refresh sendet ihn; die Bewertung wählt ihr Modell nicht über den
 * Request (lib/server/scoring-route.ts).
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
