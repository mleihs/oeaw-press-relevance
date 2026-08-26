import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventNewsGroupedExport } from './adapters/typo3-events-json';

// Strategie wie sync.test.ts: die ECHTE Drizzle-Schema behalten (ingestRuns-
// Columns sind echt), aber db.transaction durch ein Mock ersetzen, das einen
// chainbaren tx liefert. So wird nie eine echte DB-Verbindung aufgebaut.
// upsertEvents wird als Feature-Seam gemockt (die Upsert-Semantik testet
// sync.test.ts). fetchJsonExport wird nie aufgerufen — wir übergeben `json`.

const h = vi.hoisted(() => {
  let existingRows: Array<{ id: string }> = [];
  let streakRows: Array<{ parsed: string | null }> = [];
  const journalInserts: Array<Record<string, unknown>> = [];
  let transactionCalls = 0;

  // Zwei Selects laufen im selben tx: der Idempotenz-Check (waehlt `id`) und
  // die Serien-Abfrage (waehlt `parsed`). An den Feldnamen unterscheidbar —
  // stabiler als eine Aufruf-Reihenfolge, die sich mit dem Code verschiebt.
  function txSelectBuilder(fields?: Record<string, unknown>) {
    const isStreak = !!fields && 'parsed' in fields;
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => b;
    b.orderBy = () => b;
    b.limit = () => Promise.resolve(isStreak ? streakRows : existingRows);
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
    select: (fields?: Record<string, unknown>) => txSelectBuilder(fields),
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
    /** Journal-Zeilen VOR dem aktuellen Lauf, juengste zuerst. */
    setStreak(parsedValues: Array<string | null>) {
      streakRows = parsedValues.map((parsed) => ({ parsed }));
    },
    reset() {
      existingRows = [];
      streakRows = [];
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

import {
  runEventsImport,
  classifyEmptyFeed,
  EVENTS_FEED,
  EMPTY_FEED_ALARM_STREAK,
  FEED_STALE_HOURS,
} from './run-events-import';

// Die Klassifikation rechnet gegen `now`, also muss die Uhr stehen. NOW ist eine
// echte Nacht (26.08.), GEN_TS der zugehoerige Export von 03:00 — genau der
// Abstand, den der Timer real erzeugt.
const NOW = new Date('2026-08-26T04:30:00Z');
const GEN_TS = Math.floor(NOW.getTime() / 1000) - 5400;
/** Export, der seit zwei Tagen nicht neu erzeugt wurde (Redmine #4165). */
const STALE_TS = Math.floor(NOW.getTime() / 1000) - (FEED_STALE_HOURS + 12) * 3600;

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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
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

  // KERN-REGRESSION zum Befund vom 2026-08-26. Beide Formen bedeuten fuer
  // diesen Feed dasselbe: „heute nichts Neues". `data: []` liefert TYPO3 real
  // an jedem Tag ohne Neuzugang; `data: {GMI:{events:[]}}` ist die Variante, die
  // der 07-20-Fix abfangen sollte. Frueher kippte die erste Form auf 'failed'
  // und alarmierte damit 14 von 41 Naechten, montags 6 von 6. Sie MUESSEN
  // identisch enden — sonst ist die alte Fehlklassifikation wieder da.
  it.each([
    ['data: [] (keine Institutsgruppe)', [] as never],
    ['data: {GMI:{events:[]}} (leere Gruppe)', { GMI: { events: [] } } as never],
  ])('treats a fresh but empty feed as skipped, not failed: %s', async (_label, data) => {
    const json = {
      meta: { generated_at_timestamp: GEN_TS, generated_at_readable: 'fixture' },
      data,
    } as EventNewsGroupedExport;

    const r = await runEventsImport({ json });

    expect(r.status).toBe('skipped');
    expect(r.parsed).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
    // Journalisiert trotzdem — die Nacht bleibt nachweisbar.
    expect(h.journalInserts).toHaveLength(1);
    expect(h.journalInserts[0]).toMatchObject({ status: 'skipped' });
    expect(h.journalInserts[0].report).toMatchObject({
      reason: 'no_new_events',
      empty_streak: 1,
    });
  });

  it('alarms once the empty runs reach EMPTY_FEED_ALARM_STREAK in a row', async () => {
    // Die Vorgaenger-Zeilen im Journal sind alle leer; dies ist der n-te Lauf.
    h.setStreak(new Array<string>(EMPTY_FEED_ALARM_STREAK - 1).fill('0'));

    const r = await runEventsImport({ json: exportJson([]) });

    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/in Folge ohne neues Event/);
    expect(h.journalInserts[0]).toMatchObject({ status: 'failed' });
    expect(h.journalInserts[0].report).toMatchObject({
      reason: 'feed_empty_streak',
      empty_streak: EMPTY_FEED_ALARM_STREAK,
    });
  });

  it('breaks the streak at the first non-empty predecessor', async () => {
    // Genug Leernaechte fuer den Alarm, aber die juengste trug Events.
    h.setStreak(['2', '0', '0', '0', '0']);

    const r = await runEventsImport({ json: exportJson([]) });

    expect(r.status).toBe('skipped');
    expect(h.journalInserts[0].report).toMatchObject({ empty_streak: 1 });
  });

  it('alarms in the very first night when the export stopped being regenerated', async () => {
    const r = await runEventsImport({
      json: exportJson([], { generated_at_timestamp: STALE_TS }),
    });

    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/nicht neu erzeugt/);
    expect(h.journalInserts[0]).toMatchObject({ status: 'failed' });
    expect(h.journalInserts[0].report).toMatchObject({ reason: 'feed_stale' });
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

  it('dry-run on a fresh but empty feed reports skipped (no write)', async () => {
    const r = await runEventsImport({ json: exportJson([]), dryRun: true });
    expect(r.status).toBe('skipped');
    expect(h.transactionCalls).toBe(0);
  });
});

// Die Regel selbst, ohne DB und ohne Adapter: hier stehen die Grenzwerte, an
// denen sich in Zukunft entscheidet, ob eine Nacht das Team weckt.
describe('classifyEmptyFeed', () => {
  const base = { droppedNoStart: 0, generatedAtTimestamp: GEN_TS, now: NOW };

  it('ranks a parser/content drift above everything else', () => {
    // Rohdaten da, aber alle verworfen — das ist ein Defekt, egal wie frisch
    // der Export ist und egal, wie die Serie steht.
    const v = classifyEmptyFeed({ ...base, droppedNoStart: 3, emptyStreak: 0 });
    expect(v.status).toBe('failed');
    expect(v.code).toBe('all_events_dropped');
  });

  it('stays quiet below the streak threshold and alarms exactly at it', () => {
    const below = classifyEmptyFeed({ ...base, emptyStreak: EMPTY_FEED_ALARM_STREAK - 2 });
    expect(below.status).toBe('skipped');

    const at = classifyEmptyFeed({ ...base, emptyStreak: EMPTY_FEED_ALARM_STREAK - 1 });
    expect(at.status).toBe('failed');
    expect(at.code).toBe('feed_empty_streak');
  });

  it('tolerates a late export but alarms once it stops being regenerated', () => {
    const secs = (h: number) => Math.floor(NOW.getTime() / 1000) - h * 3600;

    // Verschobener, aber gelaufener Export: kein Alarm.
    const late = classifyEmptyFeed({
      ...base,
      generatedAtTimestamp: secs(FEED_STALE_HOURS - 1),
      emptyStreak: 0,
    });
    expect(late.status).toBe('skipped');

    const stale = classifyEmptyFeed({
      ...base,
      generatedAtTimestamp: secs(FEED_STALE_HOURS + 1),
      emptyStreak: 0,
    });
    expect(stale.status).toBe('failed');
    expect(stale.code).toBe('feed_stale');
  });

  it('does not alarm on a missing timestamp alone', () => {
    // Ohne Zeitstempel ist die Staleness unbekannt — das allein ist kein
    // Defekt, sonst faellt der Feed bei einem Meta-Ausfall in den Dauer-Alarm.
    const v = classifyEmptyFeed({ ...base, generatedAtTimestamp: null, emptyStreak: 0 });
    expect(v.status).toBe('skipped');
  });
});

