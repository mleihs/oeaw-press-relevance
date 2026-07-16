import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedEvent } from '@/lib/server/ingest/adapters/typo3-events';

// ---------------------------------------------------------------------------
// Same strategy as enrichment/batch.test.ts: keep the REAL Drizzle schema (so
// `db.insert(events)` and the conflict target are real Columns) and replace
// only the query executor with a chainable, awaitable builder. Importing the
// real schema via vi.importActual avoids pulling in ./drizzle (which would
// construct a postgres client), so no DB connection is ever attempted.
//
// upsertEvents' contract is enforced by the SET-list *construction*, not by SQL
// semantics: a maintainer/score column that is absent from the SET list simply
// cannot be touched by `ON CONFLICT DO UPDATE` — that's Postgres' guarantee, not
// ours to re-test. So the test pins exactly the SET keys + the xmax=0 accounting.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const captured: { target?: unknown; set?: Record<string, unknown> } = {};
  let returningRows: Array<{ inserted: boolean }> = [];

  function insertBuilder() {
    const b: Record<string, unknown> = {};
    b.values = () => b;
    b.onConflictDoUpdate = (cfg: { target: unknown; set: Record<string, unknown> }) => {
      captured.target = cfg.target;
      captured.set = cfg.set;
      return b;
    };
    b.returning = () => Promise.resolve(returningRows);
    return b;
  }

  return {
    captured,
    insertBuilder,
    setReturning(rows: Array<{ inserted: boolean }>) {
      returningRows = rows;
    },
  };
});

vi.mock('@/lib/server/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/server/db/schema')>(
    '@/lib/server/db/schema',
  );
  return {
    ...schema,
    db: { insert: vi.fn(() => h.insertBuilder()) },
  };
});

import { upsertEvents } from './sync';
import { db, events } from '@/lib/server/db';

const insertSpy = vi.mocked(db.insert);

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    webdbUid: 1,
    title: 'Test Event',
    teaser: null,
    bodytext: null,
    eventInformation: null,
    eventAt: '2026-07-01T10:00:00+00:00',
    eventEndAt: null,
    locationTitle: null,
    organizerTitle: null,
    institute: null,
    url: null,
    lang: null,
    availableLangs: [],
    ...overrides,
  };
}

// Content columns the sync ALWAYS overwrites on re-sync (fresh content from the
// source of truth), written as a bare `excluded.<col>`.
const CONTENT_SET_COLUMNS = [
  'title',
  'teaser',
  'bodytext',
  'eventInformation',
  'eventAt',
  'eventEndAt',
  'locationTitle',
  'organizerTitle',
  'institute',
  'url',
  'lang',
  'availableLangs',
  'syncedAt',
];

// LLM-analysis columns present in the SET list but ONLY as a guarded reset:
// a CASE that nulls them (analysis_status→'pending') iff scoring-relevant content
// of a still-upcoming event changed, so the event is re-scored; an idempotent
// re-sync leaves them intact. See upsertEvents' `rescore` predicate.
const RESCORE_RESET_COLUMNS = [
  'analysisStatus',
  'eventScore',
  'publicAppeal',
  'scientificSignificance',
  'reach',
  'timeliness',
  'pitchSuggestion',
  'suggestedAngle',
  'targetAudience',
  'reasoning',
  'llmModel',
  'analysisCost',
];

// The full SET list. Exact-equality below means ANY column added to the SET list
// reds this test — the author then has to consciously confirm it should resync.
const EXPECTED_SET_COLUMNS = [...CONTENT_SET_COLUMNS, ...RESCORE_RESET_COLUMNS].sort();

// Maintainer-triage columns (property names from the `events` table in
// lib/server/db/schema.ts). A re-sync from ANY source must leave these fully
// untouched — never overwritten AND never reset — so they must be ABSENT from
// the UPSERT SET list. (The LLM-analysis columns are NO LONGER here: they are in
// the SET list as a guarded re-score reset — see RESCORE_RESET_COLUMNS.)
const PROTECTED_COLUMNS = [
  'decision',
  'decidedAt',
  'flagNotes',
  'createdAt',
  'analyzedAt',
];

beforeEach(() => {
  insertSpy.mockClear();
  h.captured.set = undefined;
  h.captured.target = undefined;
  h.setReturning([]);
});

describe('upsertEvents — maintainer/score-column protection', () => {
  it('omits every maintainer column from the ON CONFLICT SET list', async () => {
    h.setReturning([{ inserted: true }]);
    await upsertEvents([makeEvent()]);

    const setKeys = Object.keys(h.captured.set ?? {});
    for (const col of PROTECTED_COLUMNS) {
      expect(
        setKeys,
        `protected column "${col}" leaked into the UPSERT SET list`,
      ).not.toContain(col);
    }
  });

  it('includes the re-score reset columns as guarded CASE expressions, not bare overwrites', async () => {
    h.setReturning([{ inserted: true }]);
    await upsertEvents([makeEvent()]);

    const set = (h.captured.set ?? {}) as Record<string, unknown>;
    const rawSql = (v: unknown): string =>
      ((v as { queryChunks?: unknown[] }).queryChunks ?? [])
        .map((c) => {
          const cv = (c as { value?: unknown }).value;
          return Array.isArray(cv) ? cv.join('') : typeof cv === 'string' ? cv : '';
        })
        .join(' ')
        .toUpperCase();
    for (const col of RESCORE_RESET_COLUMNS) {
      expect(set, `re-score column "${col}" missing from SET`).toHaveProperty(col);
      expect(rawSql(set[col]), `re-score column "${col}" must be a guarded CASE, not a blind overwrite`)
        .toContain('CASE WHEN');
    }
  });

  it('updates exactly the content + re-score columns on conflict (snapshot of the contract)', async () => {
    h.setReturning([{ inserted: true }]);
    await upsertEvents([makeEvent()]);

    expect(Object.keys(h.captured.set ?? {}).sort()).toEqual(EXPECTED_SET_COLUMNS);
  });

  it('resolves the conflict on the webdb_uid unique key', async () => {
    h.setReturning([{ inserted: true }]);
    await upsertEvents([makeEvent()]);
    expect(h.captured.target).toBe(events.webdbUid);
  });
});

describe('upsertEvents — inserted/updated accounting (xmax = 0)', () => {
  it('counts xmax=0 rows as inserted and the rest as updated', async () => {
    h.setReturning([
      { inserted: true },
      { inserted: false },
      { inserted: true },
      { inserted: false },
      { inserted: false },
    ]);
    const res = await upsertEvents([
      makeEvent({ webdbUid: 1 }),
      makeEvent({ webdbUid: 2 }),
      makeEvent({ webdbUid: 3 }),
      makeEvent({ webdbUid: 4 }),
      makeEvent({ webdbUid: 5 }),
    ]);
    expect(res).toEqual({ imported: 2, updated: 3 });
  });

  it('short-circuits on empty input without touching the database', async () => {
    const res = await upsertEvents([]);
    expect(res).toEqual({ imported: 0, updated: 0 });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
