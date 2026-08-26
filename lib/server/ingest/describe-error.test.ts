import { describe, it, expect } from 'vitest';
import { describeError, MAX_ERROR_CHARS } from './describe-error';

describe('describeError', () => {
  it('prefers the deepest cause: the Postgres message, not the Drizzle wrapper', () => {
    // Exakt das Bild aus der Nacht auf den 2026-08-22: Drizzle haengt das
    // komplette Query-Payload an seine Meldung, Postgres selbst sagt in einer
    // Zeile, was los ist. Genau die soll im Alarm stehen.
    const pg = new Error(
      'apply_publications_delta: 2474 publications exceeds max_delta_pubs=2000 ' +
        '(looks like a full dump) — pass force to override',
    );
    const drizzle = new Error(
      'Failed query: SELECT apply_publications_delta($1::jsonb, $2::jsonb) AS report\n' +
        `params: {"meta":{"generated_at_timestamp":1787361677},"upsert":${'x'.repeat(50_000)}}`,
      { cause: pg },
    );

    const out = describeError(drizzle);

    expect(out).toBe(pg.message);
    expect(out).not.toContain('params:');
    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
  });

  it('caps a runaway single-line message', () => {
    const out = describeError(new Error('x'.repeat(50_000)));

    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_CHARS + 12);
    expect(out.endsWith('… [gekürzt]')).toBe(true);
  });

  it('drops the params tail even without a cause to fall back on', () => {
    const out = describeError(
      new Error(`Failed query: SELECT 1\nparams: ${'y'.repeat(50_000)}`),
    );

    expect(out).toBe('Failed query: SELECT 1');
  });

  it('survives a cause cycle instead of hanging', () => {
    const a = new Error('outer');
    const b = new Error('inner', { cause: a });
    (a as { cause?: unknown }).cause = b;

    expect(describeError(a)).toBe('inner');
  });

  it('falls back to String() for non-errors and empty messages', () => {
    expect(describeError('kaputt')).toBe('kaputt');
    expect(describeError({ message: '   ' })).toBe('[object Object]');
    expect(describeError(null)).toBe('null');
  });
});
