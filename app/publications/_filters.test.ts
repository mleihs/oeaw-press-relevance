import { describe, expect, test } from 'vitest';
import {
  FILTER_DEFAULTS,
  buildApiParams,
  buildUrl,
  hasAnyActiveFilter,
  loadFilters,
  type FilterValues,
} from './_filters';

// `_filters.ts` is the bridge between the nuqs URL surface (UI shape) and
// `listPublications`' API surface. These translations diverge intentionally
// (TriState ↔ Bool, showAll ↔ inverted default_eligible, minScore 0-100 ↔
// 0-1.0). Pure-function tests so any drift surfaces here, not in production.

function withDefaults(patch: Partial<FilterValues>): FilterValues {
  return { ...FILTER_DEFAULTS, ...patch };
}

describe('buildApiParams', () => {
  test('defaults: page/pageSize/sort/order + default_eligible=true', () => {
    const p = buildApiParams(FILTER_DEFAULTS);
    expect(p.get('page')).toBe('1');
    expect(p.get('pageSize')).toBe('20');
    expect(p.get('sort')).toBe('published_at');
    expect(p.get('order')).toBe('desc');
    expect(p.get('default_eligible')).toBe('true');
  });

  test('showAll=true → default_eligible omitted', () => {
    const p = buildApiParams(withDefaults({ showAll: true }));
    expect(p.get('default_eligible')).toBeNull();
  });

  test('peer tri-state encodes to peer_reviewed bool', () => {
    expect(buildApiParams(withDefaults({ peer: 'yes' })).get('peer_reviewed')).toBe('true');
    expect(buildApiParams(withDefaults({ peer: 'no' })).get('peer_reviewed')).toBe('false');
    expect(buildApiParams(withDefaults({ peer: 'any' })).get('peer_reviewed')).toBeNull();
  });

  test('popsci/oa/pressReleased follow the same tri-state pattern', () => {
    expect(buildApiParams(withDefaults({ popsci: 'yes' })).get('popular_science')).toBe('true');
    expect(buildApiParams(withDefaults({ oa: 'no' })).get('open_access')).toBe('false');
    expect(buildApiParams(withDefaults({ pressReleased: 'yes' })).get('press_released')).toBe('true');
  });

  test('flagged=true forwarded (regression-guard for the pre-A4 missing-emit bug)', () => {
    expect(buildApiParams(withDefaults({ flagged: true })).get('flagged')).toBe('true');
    expect(buildApiParams(FILTER_DEFAULTS).get('flagged')).toBeNull();
  });

  test('minScore is normalised from 0-100 (UI) to 0-1.0 (API)', () => {
    expect(buildApiParams(withDefaults({ minScore: 70 })).get('min_score')).toBe('0.7');
    expect(buildApiParams(withDefaults({ minScore: 0 })).get('min_score')).toBeNull();
  });

  test('array fields join with comma', () => {
    expect(buildApiParams(withDefaults({ types: ['a', 'b', 'c'] })).get('pub_type_ids')).toBe('a,b,c');
    expect(buildApiParams(withDefaults({ units: ['u1', 'u2'] })).get('orgunit_ids')).toBe('u1,u2');
    expect(buildApiParams(withDefaults({ oestat: ['o1'] })).get('oestat6_ids')).toBe('o1');
    expect(buildApiParams(withDefaults({ oestat3: [101, 202] })).get('oestat3_domains')).toBe('101,202');
  });

  test('preset is UI-only — never forwarded to API', () => {
    expect(buildApiParams(withDefaults({ preset: 'pitch' })).get('preset')).toBeNull();
  });

  test('boolean flags only present when true', () => {
    expect(buildApiParams(withDefaults({ hasSumDe: true })).get('has_summary_de')).toBe('true');
    expect(buildApiParams(FILTER_DEFAULTS).get('has_summary_de')).toBeNull();
    expect(buildApiParams(withDefaults({ maHl: true })).get('mahighlight')).toBe('true');
    expect(buildApiParams(withDefaults({ hl: true })).get('highlight')).toBe('true');
  });

  test('journal venue forwarded verbatim, only when set', () => {
    expect(buildApiParams(withDefaults({ journal: 'Nature' })).get('journal')).toBe('Nature');
    // Commas survive: venue names contain them, hence a single string param
    // (not a comma-joined array like types/units).
    expect(
      buildApiParams(withDefaults({ journal: 'Monumenta Germaniae Historica, Scriptores' })).get('journal'),
    ).toBe('Monumenta Germaniae Historica, Scriptores');
    expect(buildApiParams(FILTER_DEFAULTS).get('journal')).toBeNull();
  });
});

describe('hasAnyActiveFilter', () => {
  test('defaults: false', () => {
    expect(hasAnyActiveFilter(FILTER_DEFAULTS)).toBe(false);
  });

  test('sort/order/page changes ignored', () => {
    expect(hasAnyActiveFilter(withDefaults({ page: 5 }))).toBe(false);
    expect(hasAnyActiveFilter(withDefaults({ sort: 'press_score' }))).toBe(false);
    expect(hasAnyActiveFilter(withDefaults({ order: 'asc' }))).toBe(false);
  });

  test('any modifier turns it true', () => {
    expect(hasAnyActiveFilter(withDefaults({ peer: 'yes' }))).toBe(true);
    expect(hasAnyActiveFilter(withDefaults({ q: 'foo' }))).toBe(true);
    expect(hasAnyActiveFilter(withDefaults({ types: ['a'] }))).toBe(true);
    expect(hasAnyActiveFilter(withDefaults({ journal: 'Nature' }))).toBe(true);
    expect(hasAnyActiveFilter(withDefaults({ showAll: true }))).toBe(true);
  });
});

describe('loadFilters', () => {
  test('empty searchParams → defaults', async () => {
    const f = await loadFilters(Promise.resolve({}));
    expect(f.q).toBe('');
    expect(f.page).toBe(1);
    expect(f.peer).toBe('any');
    expect(f.showAll).toBe(false);
    expect(f.preset).toBe('custom');
  });

  test('parses tri-state from string', async () => {
    const f = await loadFilters(Promise.resolve({ peer: 'yes', popsci: 'no' }));
    expect(f.peer).toBe('yes');
    expect(f.popsci).toBe('no');
  });

  test('parses page integer + array fields', async () => {
    const f = await loadFilters(Promise.resolve({
      page: '3',
      types: 'a,b,c',
      oestat3: '101,202',
    }));
    expect(f.page).toBe(3);
    expect(f.types).toEqual(['a', 'b', 'c']);
    expect(f.oestat3).toEqual([101, 202]);
  });
});

describe('buildUrl', () => {
  test('defaults → empty string (clearOnDefault)', () => {
    expect(buildUrl(FILTER_DEFAULTS)).toBe('');
  });

  test('with patch → only non-default params', () => {
    const url = buildUrl(FILTER_DEFAULTS, { page: 2 });
    expect(url).toBe('?page=2');
  });

  test('preserves current non-default filters when patching', () => {
    const filters = withDefaults({ q: 'hello', peer: 'yes' });
    const url = buildUrl(filters, { page: 2 });
    // Don't assert key order — URLSearchParams iterates insertion order but
    // we only care that all three params exist.
    const usp = new URLSearchParams(url.slice(1)); // strip leading '?'
    expect(usp.get('q')).toBe('hello');
    expect(usp.get('peer')).toBe('yes');
    expect(usp.get('page')).toBe('2');
  });

  test('patch overrides current non-default values', () => {
    const filters = withDefaults({ sort: 'press_score', order: 'asc' });
    const url = buildUrl(filters, { sort: 'press_similarity' });
    const usp = new URLSearchParams(url.slice(1));
    expect(usp.get('sort')).toBe('press_similarity');
    expect(usp.get('order')).toBe('asc');
  });

  test('patching a field back to its default removes it from the URL', () => {
    const filters = withDefaults({ sort: 'press_score', order: 'asc' });
    const url = buildUrl(filters, { sort: 'published_at', order: 'desc' });
    // Both back to defaults → URL is empty under clearOnDefault.
    expect(url).toBe('');
  });
});
