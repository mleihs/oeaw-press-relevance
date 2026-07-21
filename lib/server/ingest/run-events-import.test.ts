import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventNewsGroupedExport } from './adapters/typo3-events-json';

// Strategie wie sync.test.ts: die ECHTE Drizzle-Schema behalten (ingestRuns-
// Columns sind echt), aber db.transaction durch ein Mock ersetzen, das einen
// chainbaren tx liefert. So wird nie eine echte DB-Verbindung aufgebaut.
// upsertEvents wird als Feature-Seam gemockt (die Upsert-Semantik testet
// sync.test.ts). fetchJsonExport wird nie aufgerufen — wir übergeben `json`.

const h = vi.hoisted(() => {
  let existingRows: Array<{ id: string }> = [];
  const journalInserts: Array<Record<string, unknown>> = [];
  let transactionCalls = 0;

  function txSelectBuilder() {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => b;
    b.limit = () => Promise.resolve(existingRows);
    return b;
  }
  function txInsertBuilder() {
    const b: Record<string, unknown> = {};
    b.values = (v: Record<string, unknown>) => {
      journalInserts.push(v);
      return b;
    };
    b.onConflictDoUpdate = () => Promise.resolve(undefined);
    return b;
  }
  const tx = {
    select: () => txSelectBuilder(),
    insert: () => txInsertBuilder(),
  };

  return {
    tx,
    journalInserts,
    get transactionCalls() {
      return transactionCalls;
    },
    bumpTx() {
      transactionCalls++;
    },
    setExisting(rows: Array<{ id: string }>) {
      existingRows = rows;
    },
    reset() {
      existingRows = [];
      journalInserts.length = 0;
      transactionCalls = 0;
    },
  };
});

const upsertMock = vi.fn(async (..._args: unknown[]) => ({ imported: 2, updated: 1 }));

vi.mock('@/lib/server/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/server/db/schema')>(
    '@/lib/server/db/schema',
  );
  return {
    ...schema,
    db: {
      transaction: (fn: (tx: unknown) => Promise<unknown>) => {
        h.bumpTx();
        return fn(h.tx);
      },
    },
  };
});

vi.mock('@/lib/server/events/sync', () => ({
  upsertEvents: (...args: unknown[]) => upsertMock(...(args as [])),
}));

import { runEventsImport, EVENTS_FEED } from './run-events-import';

const GEN_TS = 1752300000;

function exportJson(
  events: Array<Record<string, unknown>> = [{ uid: 1, title: 'A', datetime: 1900000000 }],
  meta: Partial<EventNewsGroupedExport['meta']> = {},
): EventNewsGroupedExport {
  return {
    meta: { generated_at_timestamp: GEN_TS, generated_at_readable: 'fixture', ...meta },
    data: events.length ? { GMI: { events: events as never } } : {},
  };
}

beforeEach(() => {
  h.reset();
  upsertMock.mockClear();
  upsertMock.mockResolvedValue({ imported: 2, updated: 1 });
});

describe('runEventsImport', () => {
  it('applies a fresh feed: upsert + journal(applied), atomic in one transaction', async () => {
    const r = await runEventsImport({
      json: exportJson([
        { uid: 1, title: 'A', datetime: 1900000000 },
        { uid: 2, title: 'B', datetime: 1900000001 },
      ]),
    });

    expect(r.status).toBe('applied');
    expect(r.feed).toBe(EVENTS_FEED);
    expect(r.imported).toBe(2);
    expect(r.updated).toBe(1);
    expect(r.parsed).toBe(2);
    expect(r.generatedAtTimestamp).toBe(GEN_TS);

    // Upsert lief mit dem tx (atomar mit dem Journal).
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(upsertMock.mock.calls[0][1]).toBe(h.tx);

    // Genau eine Journal-Zeile, status 'applied', korrekter Cursor.
    expect(h.journalInserts).toHaveLength(1);
    expect(h.journalInserts[0]).toMatchObject({
      feed: EVENTS_FEED,
      status: 'applied',
      generatedAtTimestamp: GEN_TS,
    });
  });

  it('skips a feed whose (feed, generated_at_timestamp) is already applied', async () => {
    h.setExisting([{ id: 'existing-run' }]);

    const r = await runEventsImport({ json: exportJson() });

    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('already_applied');
    expect(r.imported).toBe(0);
    // Weder Upsert noch Journal-Insert bei Skip.
    expect(upsertMock).not.toHaveBeenCalled();
    expect(h.journalInserts).toHaveLength(0);
  });

  it('marks a structurally empty feed (no institute group) as failed, without upserting', async () => {
    const r = await runEventsImport({ json: exportJson([]) });

    expect(r.status).toBe('failed');
    expect(r.parsed).toBe(0);
    expect(r.reason).toMatch(/Institutsgruppe/);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(h.journalInserts).toHaveLength(1);
    expect(h.journalInserts[0]).toMatchObject({ status: 'failed' });
    expect(h.journalInserts[0].report).toMatchObject({
      reason: 'feed_structurally_empty',
    });
  });

  // Der Regressionstest zum Fehlalarm vom 2026-07-20: ein intakter Feed ohne
  // neues Event ist Normalbetrieb (der Export trägt real nur 1-2 Events/Tag)
  // und darf den Nachtlauf NICHT auf 'failed' kippen.
  it('treats an intact feed with no events as skipped, not failed', async () => {
    const json = {
      meta: { generated_at_timestamp: GEN_TS, generated_at_readable: 'fixture' },
      data: { GMI: { events: [] as never } },
    } as EventNewsGroupedExport;

    const r = await runEventsImport({ json });

    expect(r.status).toBe('skipped');
    expect(r.parsed).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
    // Journalisiert trotzdem — die Nacht bleibt nachweisbar.
    expect(h.journalInserts).toHaveLength(1);
    expect(h.journalInserts[0]).toMatchObject({ status: 'skipped' });
    expect(h.journalInserts[0].report).toMatchObject({ reason: 'no_new_events' });
  });

  it('fails when raw events existed but the adapter dropped them all', async () => {
    // Rohdaten da, aber ohne verwertbares Startdatum → Parser/Inhalt driften.
    const r = await runEventsImport({
      json: exportJson([{ uid: 1, title: 'A', datetime: 0, event_end: 0 }]),
    });

    expect(r.status).toBe('failed');
    expect(r.parsed).toBe(0);
    expect(r.droppedNoStart).toBe(1);
    expect(r.reason).toMatch(/verworfen/);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(h.journalInserts[0].report).toMatchObject({
      reason: 'all_events_dropped',
    });
  });

  it('dry-run parses only: no transaction, no upsert, no journal', async () => {
    const r = await runEventsImport({ json: exportJson(), dryRun: true });

    expect(r.status).toBe('applied');
    expect(r.imported).toBe(0);
    expect(h.transactionCalls).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(h.journalInserts).toHaveLength(0);
  });

  it('dry-run on a structurally empty feed reports failed (no write)', async () => {
    const r = await runEventsImport({ json: exportJson([]), dryRun: true });
    expect(r.status).toBe('failed');
    expect(h.transactionCalls).toBe(0);
  });
});
