// Harte Vorbedingungen jeder automatischen Bewertung. Bewertet wird nur, wie
// das Korpus kalibriert ist: Anthropic direkt, ein Opus-Modell, Effort max.
//
// Warum hart und ohne Ausweichweg: ohne ANTHROPIC_API_KEY fiele providerFor()
// still auf OpenRouter zurück, und der OpenRouter-Transport reicht kein Effort
// durch; das Modell liefe auf `medium`. Genau so lag die Neubewertung vom
// 2026-10-22 im Mittel 0,039 daneben (Memory inchat-scoring-effort-max).
// Deshalb gibt es auch keinen Env-Schalter für ein niedrigeres Effort: der
// Kern reicht `max` an jeden Aufruf explizit durch, und wer ANTHROPIC_EFFORT
// anders setzt, bekommt einen Fehler statt einer leise schlechteren Bewertung.

import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';
import { providerFor } from '@/lib/server/llm-client';
import { ScoringEffortError, ScoringModelError, ScoringProviderError } from './errors';
import type { ScoringCall } from './types';

/** Nur Opus: neuere Generationen kommen über DEFAULT_LLM_MODEL plus erneuten
 *  Vergleichslauf (Plan §6), nie automatisch. */
const OPUS_MODEL = /^anthropic\/claude-opus-/;

/**
 * Prüft Anbieter, Modell und Effort und liefert, was jeder Modellaufruf des
 * Kerns mitbekommt. Wirft ScoringProviderError, ScoringModelError oder
 * ScoringEffortError (Klassen provider_gate, model_gate, effort_gate).
 */
export function assertScoringPreconditions(opts: { model: string; apiKey?: string }): ScoringCall {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ScoringProviderError(
      'Bewertung läuft nur direkt über Anthropic, auf dieser Instanz fehlt ANTHROPIC_API_KEY.',
    );
  }
  if (providerFor(opts.model) !== 'anthropic') {
    throw new ScoringProviderError(`Modell ${opts.model} läuft nicht über Anthropic.`);
  }
  if (!OPUS_MODEL.test(opts.model)) {
    throw new ScoringModelError(`Bewertet wird nur mit Opus, nicht mit ${opts.model}.`);
  }
  const effort = process.env.ANTHROPIC_EFFORT;
  if (effort && effort !== 'max') {
    throw new ScoringEffortError(
      `ANTHROPIC_EFFORT=${effort}: die Bewertung läuft nur mit Effort max.`,
    );
  }
  return { apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY, model: opts.model, effort: 'max' };
}

export type ScoringDisabledReason = 'switched_off' | 'no_anthropic';

/**
 * Warum diese Instanz nicht automatisch bewertet, oder null. `switched_off`:
 * Not-Aus SCORING_NIGHTLY_ENABLED=false. `no_anthropic`: kein Anthropic-Key
 * (der Vercel-Standby). Gelesen bei jedem Aufruf, damit Tests umschalten können.
 */
export function scoringDisabledReason(): ScoringDisabledReason | null {
  if (process.env.SCORING_NIGHTLY_ENABLED === 'false') return 'switched_off';
  if (providerFor(DEFAULT_LLM_MODEL) !== 'anthropic') return 'no_anthropic';
  return null;
}
