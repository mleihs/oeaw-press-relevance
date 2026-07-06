import { describe, it, expect } from 'vitest';
import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { filtersForEventsTab } from './list';
import { EVENTS_TAB_VALUES, isEventsTab } from '@/lib/shared/events-filter';

// Render a Drizzle filter to its parameterized text + params without a DB, so
// we can assert the band thresholds, ILIKE-escaping and predicate composition.
const dialect = new PgDialect();
const render = (s: SQL) => {
  const { sql, params } = dialect.sqlToQuery(s);
  return { sql, params: params.map(String) };
};

describe('isEventsTab', () => {
  it('accepts every value in EVENTS_TAB_VALUES', () => {
    for (const v of EVENTS_TAB_VALUES) {
      expect(isEventsTab(v)).toBe(true);
    }
  });

  it('rejects unknown strings + non-strings (defensively typed as unknown)', () => {
    expect(isEventsTab('nope')).toBe(false);
    expect(isEventsTab('')).toBe(false);
    expect(isEventsTab(undefined)).toBe(false);
    expect(isEventsTab(null)).toBe(false);
    expect(isEventsTab(42)).toBe(false);
    expect(isEventsTab({})).toBe(false);
  });

  it('keeps `upcoming` as the first/default tab so the page-level fallback stays correct', () => {
    expect(EVENTS_TAB_VALUES[0]).toBe('upcoming');
  });
});

describe('filtersForEventsTab — list filters (F)', () => {
  it('high band gates on analyzed and uses the 0.7 threshold', () => {
    const { sql, params } = render(filtersForEventsTab('upcoming', { band: 'high' }));
    expect(sql).toContain("'analyzed'");
    expect(sql).toContain('>=');
    expect(params).toContain('0.7');
  });

  it('mid band brackets [0.5, 0.7)', () => {
    const { params } = render(filtersForEventsTab('upcoming', { band: 'mid' }));
    expect(params).toContain('0.5');
    expect(params).toContain('0.7');
  });

  it('unscored band is the parenthesised non-analyzed / NULL complement', () => {
    const { sql } = render(filtersForEventsTab('upcoming', { band: 'unscored' }));
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).toContain('IS NULL');
    expect(sql).toContain(' OR ');
  });

  it('search escapes ILIKE wildcards and substring-wraps the term', () => {
    const { sql, params } = render(filtersForEventsTab('upcoming', { search: 'a%b_c' }));
    expect(sql.toLowerCase()).toContain('ilike');
    expect(params).toContain('%a\\%b\\_c%');
  });

  it('blank search is a no-op (no ILIKE emitted)', () => {
    const { sql } = render(filtersForEventsTab('upcoming', { search: '   ' }));
    expect(sql.toLowerCase()).not.toContain('ilike');
  });

  it('institute filters by exact label', () => {
    const { params } = render(filtersForEventsTab('upcoming', { institute: 'IMBA' }));
    expect(params).toContain('IMBA');
  });

  it('a decision tab adds the decision predicate', () => {
    const { params } = render(filtersForEventsTab('pitch', {}));
    expect(params).toContain('pitch');
  });

  it('excludes the main-news folder by default, includes it on opt-in', () => {
    expect(render(filtersForEventsTab('upcoming', {})).params).toContain('OEAW - Home');
    expect(
      render(filtersForEventsTab('upcoming', { includeMainNews: true })).params,
    ).not.toContain('OEAW - Home');
  });
});
