import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// latestRuns ohne DB: die Query-Kette wird abgefangen, das ORDER/DISTINCT-SQL
// gerendert und eine feste Zeilenmenge zurückgegeben.
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: [] as Array<{ on: unknown[]; where: unknown; order: unknown[] }>,
}));

vi.mock('@/lib/server/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/server/db/schema')>('@/lib/server/db/schema');
  return {
    scoringRuns: schema.scoringRuns,
    db: {
      selectDistinctOn: (on: unknown[]) => ({
        from: () => ({
          where: (where: unknown) => ({
            orderBy: async (...order: unknown[]) => {
              h.calls.push({ on, where, order });
              return h.rows;
            },
          }),
        }),
      }),
    },
  };
});

const { applyStaleRule, latestRuns, STALE_RUNNING_MINUTES } = await import('./journal');
type Row = Parameters<typeof applyStaleRule>[0];

const NOW = new Date('2026-10-28T06:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function row(over: Partial<Row>): Row {
  return {
    id: 'r1',
    entity: 'publications',
    trigger: 'nightly',
    status: 'ok',
    startedAt: minutesAgo(30),
    finishedAt: minutesAgo(10),
    model: 'anthropic/claude-opus-5.5',
    modelTag: 'anthropic/claude-opus-5.5-auto',
    effort: 'max',
    candidates: 0,
    scored: 0,
    failed: 0,
    skipped: 0,
    haikuRejected: 0,
    lektoratFlags: 0,
    lektoratChanges: 0,
    costUsd: 0,
    costCapUsd: 25,
    costCapHit: false,
    medianScore: null,
    summary: null,
    errorClass: null,
    errorMessage: null,
    report: {},
    ...over,
  };
}

describe('applyStaleRule', () => {
  it('meldet einen Knopf-Lauf, der länger als 120 Minuten auf running steht, als failed/aborted', () => {
    const stale = applyStaleRule(
      row({ trigger: 'button', status: 'running', startedAt: minutesAgo(STALE_RUNNING_MINUTES.button + 5), finishedAt: null }),
      NOW,
    );
    expect(stale).toMatchObject({ status: 'failed', errorClass: 'aborted' });
    expect(stale.errorMessage).toMatch(/125 Minuten/);
  });

  it('lässt einem Nachtlauf über die Batch-API die Batch-Frist, danach gilt er als abgebrochen', () => {
    const waiting = row({ status: 'running', startedAt: minutesAgo(STALE_RUNNING_MINUTES.button + 5), finishedAt: null });
    expect(applyStaleRule(waiting, NOW)).toBe(waiting);
    const stale = applyStaleRule(row({ status: 'running', startedAt: minutesAgo(STALE_RUNNING_MINUTES.batch + 5), finishedAt: null }), NOW);
    expect(stale).toMatchObject({ status: 'failed', errorClass: 'aborted' });
    expect(stale.errorMessage).toMatch(new RegExp(`${STALE_RUNNING_MINUTES.batch + 5} Minuten`));
  });

  it('lässt einen frischen running-Lauf und abgeschlossene Läufe unverändert', () => {
    const fresh = row({ status: 'running', startedAt: minutesAgo(30), finishedAt: null });
    expect(applyStaleRule(fresh, NOW)).toBe(fresh);
    const done = row({ status: 'partial', startedAt: minutesAgo(600) });
    expect(applyStaleRule(done, NOW)).toBe(done);
  });
});

describe('latestRuns', () => {
  beforeEach(() => {
    h.calls.length = 0;
  });

  it('nimmt je Entität den jüngsten abgeschlossenen und den laufenden Lauf aus einer Abfrage', async () => {
    h.rows = [
      { ...row({ id: 'p-done', status: 'partial' }), live: false },
      { ...row({ id: 'p-live', status: 'running', finishedAt: null }), live: true },
      { ...row({ id: 'e-stale', entity: 'events', status: 'running', startedAt: '2020-01-01T00:00:00Z', finishedAt: null }), live: false },
    ];
    const out = await latestRuns();
    expect(out.publications.latest?.id).toBe('p-done');
    expect(out.publications.running?.id).toBe('p-live');
    expect(out.events.running).toBeNull();
    expect(out.events.latest).toMatchObject({ id: 'e-stale', status: 'failed', errorClass: 'aborted' });
    expect(out.publications.latest).not.toHaveProperty('live');

    const dialect = new PgDialect();
    const live = dialect.sqlToQuery(h.calls[0].on[1] as SQL);
    expect(live.sql).toContain(
      `"status" = 'running' AND "scoring_runs"."started_at" > now() - make_interval(mins => CASE WHEN "trigger" = 'button' THEN ${STALE_RUNNING_MINUTES.button} ELSE ${STALE_RUNNING_MINUTES.batch} END)`,
    );
    // DISTINCT ON und ORDER BY müssen textgleich sein (Postgres 42P10); ein
    // gebundener Parameter bekäme in beiden eine andere Nummer.
    expect(live.params).toEqual([]);
    expect(dialect.sqlToQuery(h.calls[0].order[1] as SQL).sql).toBe(live.sql);
  });

  it('übergeht Läufe, die am belegten Lock scheiterten (sie verdeckten sonst das Nachtergebnis)', async () => {
    h.rows = [];
    await latestRuns();
    const where = new PgDialect().sqlToQuery(h.calls[0].where as SQL);
    expect(where.sql).toBe(`"scoring_runs"."error_class" IS DISTINCT FROM 'lock_busy'`);
  });

  it('liefert leere Einträge, wenn es noch keinen Lauf gibt', async () => {
    h.rows = [];
    expect(await latestRuns()).toEqual({
      publications: { latest: null, running: null },
      events: { latest: null, running: null },
    });
  });
});
