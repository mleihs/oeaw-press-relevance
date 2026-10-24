// Anbieterneutrale LLM-Fassade. Feature-Schichten (Publikations-Bewertung in
// lib/server/analysis/, Event-Bewertung in lib/server/events/, Social-Analyse
// in lib/server/social/) bauen ihre Prompts und prüfen ihre Antwortformen
// selbst; alles darunter läuft hier durch:
//
//   providerFor(model)  die eine Weiche: welcher Transport bedient ein Modell
//   completeJson()      JSON-Aufruf über den passenden Transport, plus Kosten
//   getKeyBalance()     Guthaben-Pre-flight, soweit der Anbieter einen hat
//   isFatalLlmError()   Lauf abbrechen (Guthaben/Auth) oder Batch überspringen
//   parseJsonContent()  gehärteter JSON-Parser für Antworttexte
//
// Transporte: lib/server/openrouter.ts und lib/server/anthropic.ts. Sie kennen
// einander nicht und rechnen keine Kosten; die Typen teilen sie über
// lib/server/llm-types.ts.

import { fallbackPricingFor, type ModelPricing } from '@/lib/shared/constants';
import { getLiveModelPricing } from '@/lib/server/llm-pricing';
import { parseLooseJson } from '@/lib/shared/json';
import { log } from '@/lib/server/log';
import { anthropicModelId, messagesJson, type AnthropicEffort } from '@/lib/server/anthropic';
import { chatCompletionJson, checkKeyBalance } from '@/lib/server/openrouter';
import { UNKNOWN_BALANCE, type KeyBalance, type TokenUsage } from '@/lib/server/llm-types';

export type LlmProvider = 'anthropic' | 'openrouter';

/**
 * `anthropic/*` geht direkt an Anthropic, sobald ANTHROPIC_API_KEY gesetzt ist;
 * alles andere (DeepSeek fürs Social-Modul) und alles ohne diesen Key an
 * OpenRouter. Die Env wird bei jedem Aufruf gelesen, nicht beim Import, damit
 * Tests sie umschalten können.
 */
export function providerFor(model: string): LlmProvider {
  return process.env.ANTHROPIC_API_KEY && anthropicModelId(model) ? 'anthropic' : 'openrouter';
}

/** Server-Key des Anbieters für `model` (ohne Request-Header-Fallback). */
export function envKeyFor(model: string): string | undefined {
  return providerFor(model) === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : process.env.OPENROUTER_API_KEY || undefined;
}

/**
 * ANTHROPIC_EFFORT, Default `max`: dieselbe Stufe, mit der das Korpus in-chat
 * bewertet wird (eine Neubewertung mit niedrigem Effort lag am 2026-10-22 im
 * Mittel 0,039 daneben). Opus 5.5 liefe ohne Angabe auf `medium`.
 */
function anthropicEffort(): AnthropicEffort {
  const raw = process.env.ANTHROPIC_EFFORT;
  return raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'xhigh' ? raw : 'max';
}

/** Rein: USD aus der Token-Aufteilung und den Preisen je Richtung. */
export function costFromUsage(usage: TokenUsage, pricing: ModelPricing): number {
  return (
    (usage.promptTokens * pricing.promptUsd + usage.completionTokens * pricing.completionUsd) /
    1_000_000
  );
}

/**
 * Was ein Aufruf gekostet hat, zu den LIVE-Preisen von OpenRouter (24-h-Cache
 * in lib/server/llm-pricing.ts, fail-open auf die statischen Werte). Gilt auch
 * für den Anthropic-Transport: OpenRouter reicht Anthropics Listenpreise 1:1
 * durch (Live-Check 2026-10-24, Opus 5.5 4/20 USD je Mio.).
 *
 * Bis 2026-07-21 rechnete diese Funktion mit einem 50/50-Mischpreis aus den
 * hartkodierten Fallback-Werten. Beides war falsch: die Preise veralten (genau
 * die Motivation der Live-Preisliste), und beim Scoring überwiegen die
 * Prompt-Tokens deutlich — ein Mix, der die teure Ausgaberichtung mit 50 %
 * gewichtet, überschätzt systematisch. Der Betrag landet nicht nur im Modal,
 * sondern in publications.analysis_cost / events.analysis_cost.
 */
export async function estimateCost(usage: TokenUsage, model: string): Promise<number> {
  const live = await getLiveModelPricing();
  return costFromUsage(usage, live[model] ?? fallbackPricingFor(model));
}

export interface CompleteJsonOptions {
  system: string;
  user: string;
  /** Key des Anbieters, den providerFor(model) wählt (getLLMKey in lib/server/llm.ts). */
  apiKey: string;
  model: string;
  /** Antwortbudget für OpenRouter; der 402-Back-off kann es senken. Anthropic
   *  rechnet mit eigener Obergrenze, weil Thinking mitzählt. */
  maxTokens: number;
  /** Nur OpenRouter; Anthropic lehnt Sampling-Parameter seit 2026-10-21 ab. */
  temperature?: number;
  /** Nur Anthropic: Denktiefe für diesen Aufruf statt ANTHROPIC_EFFORT. Für
   *  Extraktion (Social, Orte) `low`; die Bewertung lässt es weg. */
  effort?: AnthropicEffort;
}

export interface CompleteJsonResult {
  /** Roher Antworttext (JSON-String, mit parseJsonContent parsen). */
  content: string;
  tokensUsed: number;
  cost: number;
}

/** Ein JSON-Aufruf über den Transport, den providerFor(model) wählt. */
export async function completeJson(opts: CompleteJsonOptions): Promise<CompleteJsonResult> {
  const { content, usage } =
    providerFor(opts.model) === 'anthropic'
      ? await messagesJson({ ...opts, effort: opts.effort ?? anthropicEffort() })
      : await chatCompletionJson(opts);
  return {
    content,
    tokensUsed: usage.promptTokens + usage.completionTokens,
    cost: await estimateCost(usage, opts.model),
  };
}

/**
 * Guthaben für den Pre-flight. Anthropic hat für normale API-Keys keinen
 * Guthaben-Endpunkt: der Stand bleibt unbekannt, der Lauf startet, und ein
 * leeres Konto stoppt ihn beim ersten Batch (isFatalLlmError).
 */
export async function getKeyBalance(apiKey: string, model: string): Promise<KeyBalance> {
  return providerFor(model) === 'anthropic' ? UNKNOWN_BALANCE : checkKeyBalance(apiKey);
}

/** Fatal (Lauf stoppen, um Guthaben zu sparen) oder vorübergehend (Batch
 *  überspringen, weiter). Eine Regel für alle Pipelines und beide Anbieter. */
export function isFatalLlmError(message: string): boolean {
  return (
    (/\b402\b/.test(message) && /credits|afford|max_tokens|Budget|Guthaben/i.test(message)) ||
    // Anthropic meldet ein leeres Konto als 400, nicht als 402.
    /credit balance is too low/i.test(message) ||
    (/\b401\b/.test(message) && /unauthorized|invalid/i.test(message))
  );
}

/** Parse a JSON object out of an assistant message via the hardened shared
 *  parser (fences, surrounding prose, trailing commas, truncation). Logs +
 *  rethrows a generic error so the batch loop surfaces it like any other. */
export function parseJsonContent<T>(content: string): T {
  try {
    return parseLooseJson<T>(content);
  } catch {
    log.error('llm_json_parse_failed', {
      responseLength: content.length,
      head: content.slice(0, 200),
    });
    throw new Error('Failed to parse LLM response as JSON');
  }
}
