import { describe, it, expect } from 'vitest';
import { is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { publications } from '@/lib/server/db/schema';
import { buildUpsertSet } from './upsert';

// Render a Drizzle SQL fragment to its parameterized text without a DB — lets
// us assert the EXCLUDED reference resolves to the real column name.
const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q).sql;

describe('buildUpsertSet', () => {
  it('returns null when there are no update columns (caller emits DO NOTHING)', () => {
    expect(buildUpsertSet(publications, [])).toBeNull();
  });

  it('maps each update key to excluded.<resolved-db-column>', () => {
    const set = buildUpsertSet(publications, ['title', 'enrichedKeywords']);
    expect(set).not.toBeNull();
    // Keys are the Drizzle property names, in the given order.
    expect(Object.keys(set!)).toEqual(['title', 'enrichedKeywords']);
    expect(is(set!.title, SQL)).toBe(true);
    // The EXCLUDED ref uses the DB column name: a camelCase JS key
    // (enrichedKeywords) must resolve to its snake_case column.
    expect(render(set!.title)).toBe('excluded."title"');
    expect(render(set!.enrichedKeywords)).toBe('excluded."enriched_keywords"');
  });

  it('throws on an update key that is not a column of the table', () => {
    expect(() => buildUpsertSet(publications, ['not_a_col'])).toThrow(
      /unknown update column "not_a_col"/,
    );
  });
});
