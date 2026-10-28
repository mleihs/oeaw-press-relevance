import { describe, it, expect } from 'vitest';
import { classifyScoringRun, errorClassFor, type ScoringRunCounts } from './run-classify';

const counts = (over: Partial<ScoringRunCounts> = {}): ScoringRunCounts => ({
  candidates: 62,
  scored: 62,
  failed: 0,
  skipped: 0,
  haikuRejected: 0,
  lektoratFlags: 0,
  lektoratChanges: 4,
  costUsd: 9.8,
  costCapUsd: 25,
  costCapHit: false,
  ...over,
});

describe('classifyScoringRun', () => {
  it('is ok when everything was scored cleanly', () => {
    expect(classifyScoringRun(counts(), null)).toEqual({
      status: 'ok',
      summary: '62 Kandidaten, 62 bewertet, 9,80 USD',
      alarm: false,
    });
  });

  it('is partial, without alarm, for rejected haikus and open lektorat flags', () => {
    const r = classifyScoringRun(counts({ scored: 60, failed: 2, haikuRejected: 2, lektoratFlags: 1 }), null);
    expect(r).toEqual({
      status: 'partial',
      summary: '62 Kandidaten, 60 bewertet, 2 fehlgeschlagen, 2 Haikus verworfen, 1 Lektorat-Hinweis, 9,80 USD',
      alarm: false,
    });
  });

  it('is skipped when there is nothing to score', () => {
    expect(classifyScoringRun(counts({ candidates: 0, scored: 0, costUsd: 0 }), null)).toMatchObject({
      status: 'skipped',
      alarm: false,
    });
  });

  it('fails with alarm on a fatal error', () => {
    const r = classifyScoringRun(counts({ scored: 10 }), { errorClass: 'credits', message: 'credit balance is too low' });
    expect(r.status).toBe('failed');
    expect(r.alarm).toBe(true);
    expect(r.summary).toContain('credits');
    expect(r.summary).toContain('10 bewertet');
  });

  it('skips without alarm when another run holds the lock', () => {
    expect(classifyScoringRun(counts({ scored: 0 }), { errorClass: 'lock_busy', message: 'busy' })).toMatchObject({
      status: 'skipped',
      alarm: false,
    });
  });

  it('treats the cost cap as a deliberate stop: partial, no alarm', () => {
    const r = classifyScoringRun(
      counts({ scored: 40, costUsd: 25.1, costCapHit: true }),
      { errorClass: 'cost_cap', message: 'Deckel' },
    );
    expect(r).toEqual({
      status: 'partial',
      summary: 'Kostendeckel erreicht: 62 Kandidaten, 40 bewertet, 25,10 USD von 25,00 USD',
      alarm: false,
    });
  });

  it('treats an abort by the caller as partial without alarm', () => {
    const r = classifyScoringRun(counts({ scored: 5, costUsd: 0.8 }), { errorClass: 'aborted', message: 'abgebrochen' });
    expect(r).toEqual({ status: 'partial', summary: 'abgebrochen: 62 Kandidaten, 5 bewertet, 0,80 USD', alarm: false });
  });
});

describe('errorClassFor', () => {
  const named = (name: string, message = '') => Object.assign(new Error(message), { name });

  it('prefers an explicit errorClass property', () => {
    expect(errorClassFor(Object.assign(new Error('x'), { errorClass: 'effort_gate' }))).toBe('effort_gate');
    expect(errorClassFor(Object.assign(new Error('x'), { errorClass: 'not-a-class' }))).toBe('unknown');
  });

  it('maps the known error names', () => {
    expect(errorClassFor(named('RunLockBusyError'))).toBe('lock_busy');
    expect(errorClassFor(named('AbortError'))).toBe('aborted');
    expect(errorClassFor(named('LlmRefusalError'))).toBe('refusal');
    expect(errorClassFor(named('LlmMaxTokensError'))).toBe('max_tokens');
  });

  it('recognises Postgres errors by SQLSTATE', () => {
    expect(errorClassFor(Object.assign(new Error('boom'), { code: '23505', severity: 'ERROR' }))).toBe('db');
  });

  it('falls back to the message, with the shared fatal-LLM rule first', () => {
    expect(errorClassFor(new Error('Anthropic API error 400: Your credit balance is too low'))).toBe('credits');
    expect(errorClassFor(new Error('Anthropic API error 401: invalid x-api-key'))).toBe('auth');
    expect(errorClassFor(new Error('Anthropic: Anfrage abgelehnt (refusal, cyber)'))).toBe('refusal');
    expect(errorClassFor(new Error('Anthropic: Antwort bei max_tokens=64000 abgeschnitten'))).toBe('max_tokens');
    expect(errorClassFor(new Error('Failed to parse LLM response as JSON'))).toBe('json_parse');
    expect(errorClassFor(new Error('Failed query: update "publications"'))).toBe('db');
    expect(errorClassFor(new Error('fetch failed'))).toBe('transport');
    expect(errorClassFor(new Error('Anthropic API error 529: Overloaded'))).toBe('transport');
    expect(errorClassFor(new Error('This operation was aborted'))).toBe('aborted');
    expect(errorClassFor(new Error('something odd'))).toBe('unknown');
    expect(errorClassFor('fetch failed')).toBe('transport');
    expect(errorClassFor(undefined)).toBe('unknown');
  });
});
