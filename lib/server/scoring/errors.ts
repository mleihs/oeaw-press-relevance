// Typisierte Fehler des Bewertungskerns. Jeder trägt seine Fehlerklasse als
// Eigenschaft `errorClass`; errorClassFor (lib/shared/scoring/run-classify.ts)
// liest sie von dort, ohne die Klassen importieren zu müssen. Die Fehler des
// Transports (LlmRefusalError, LlmMaxTokensError in lib/server/llm-types.ts)
// und des Locks (RunLockBusyError in lib/server/run-lock.ts) erkennt es am Namen.

import type { ScoringErrorClass } from '@/lib/shared/scoring/run-classify';

abstract class ScoringError extends Error {
  abstract readonly errorClass: ScoringErrorClass;
}

/** Kein Anthropic-Transport: Modell nicht `anthropic/*` oder kein ANTHROPIC_API_KEY. */
export class ScoringProviderError extends ScoringError {
  readonly errorClass = 'provider_gate' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ScoringProviderError';
  }
}

/** Modell ist kein Opus. Bewertet wird nur mit dem Modell, gegen das kalibriert ist. */
export class ScoringModelError extends ScoringError {
  readonly errorClass = 'model_gate' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ScoringModelError';
  }
}

/** ANTHROPIC_EFFORT steht auf etwas anderem als `max`. */
export class ScoringEffortError extends ScoringError {
  readonly errorClass = 'effort_gate' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ScoringEffortError';
  }
}

/** Der Kostendeckel des Laufs ist erreicht; der Lauf endet als `partial`. */
export class CostCapError extends ScoringError {
  readonly errorClass = 'cost_cap' as const;
  constructor(
    public readonly spentUsd: number,
    public readonly capUsd: number,
  ) {
    super(`Kostendeckel erreicht: ${spentUsd.toFixed(2)} von ${capUsd.toFixed(2)} USD`);
    this.name = 'CostCapError';
  }
}
