/** Cross-feature primitives shared by publications, events and the UI shell.
 *  Feature-specific wire DTOs live in the sibling files (publications.ts,
 *  events.ts, …); this file only holds types that genuinely span features. */

/** Triage-loop decision states — single source of truth for both server (API
 *  queue handlers) and client (badges, toolbar, tab navigation).
 *
 *  The const tuples are exported so callers can iterate, validate URL params
 *  and build records without re-typing the literal list. `Decision` is derived
 *  from the tuple so adding a state means one edit, not five. */
export const DECIDED_DECISIONS = ['pitch', 'hold', 'skip'] as const;
export const DECISIONS = ['undecided', ...DECIDED_DECISIONS] as const;
export type Decision = (typeof DECISIONS)[number];

/** Type guard for narrowing arbitrary strings (URL params, body fields)
 *  to `Decision` at runtime. */
export function isDecision(v: string): v is Decision {
  return (DECISIONS as readonly string[]).includes(v);
}

/** Language tag used by press_releases.lang and DOI/title language detection. */
export type Lang = 'de' | 'en';

/** Event language tag — `Lang` plus 'mul' (multilingual). Used by the events
 *  wire DTO (`Event`) and the TYPO3-events ingest adapter. */
export type EventLang = Lang | 'mul';

/** Status state-machine shared by the analysis-batch and enrichment-batch
 *  progress modals. Identical in both, so kept central. */
export type ModalStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error';

export interface FlagNote {
  by: string;
  note: string;
  at: string;
}
