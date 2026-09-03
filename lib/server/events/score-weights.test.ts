import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { EVENT_SCORE_DIMENSIONS, EVENT_SCORE_WEIGHTS } from '@/lib/shared/constants';
import { weightedScore } from '@/lib/shared/scoring';

// Lockstep-Test für den JS/SQL-Dual-Path in saveEventScoreWeights: das
// Set-basierte UPDATE rechnet die gespeicherten Sub-Scores in SQL neu
// (COALESCE(col, 0)), während neue Analysen über weightedScore() (`?? 0`)
// laufen. Diese Drift gab es real (Doku .35/.30/.20/.15 vs. DB .32/.32/.21/.15)
// — der Test rendert das generierte SQL per PgDialect().sqlToQuery() OHNE DB
// (Muster wie lib/server/ingest/upsert.test.ts) und nagelt Formel-Struktur,
// Parameter-Reihenfolge und die numerische Übereinstimmung fest.

interface Captured {
  updateSet: Record<string, unknown> | null;
  updateWhere: SQL | null;
  inserted: Record<string, unknown> | null;
}
const captured: Captured = { updateSet: null, updateWhere: null, inserted: null };

/** Zeilen, die der select()-Pfad (getCurrent…/…State) zurückgeben soll. */
let selectRows: unknown[] = [];
/** Ergebnis des UPDATE … RETURNING (bestimmt `recomputed`). */
let updatedRows: Array<{ id: string }> = [];

vi.mock('@/lib/server/db', async () => {
  const schema = await import('@/lib/server/db/schema');
  const tx = {
    update: (_table: unknown) => ({
      set: (setArg: Record<string, unknown>) => {
        captured.updateSet = setArg;
        return {
          where: (w: SQL) => {
            captured.updateWhere = w;
            return { returning: async () => updatedRows };
          },
        };
      },
    }),
    insert: (_table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        captured.inserted = v;
        return {
          returning: async () => [
            {
              id: 42,
              publicAppeal: v.publicAppeal,
              scientificSignificance: v.scientificSignificance,
              reach: v.reach,
              timeliness: v.timeliness,
              note: v.note ?? null,
              recomputedCount: v.recomputedCount ?? null,
              createdAt: '2026-08-31T00:00:00.000Z',
            },
          ],
        };
      },
    }),
  };
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    select: () => ({
      from: () => ({
        orderBy: () => ({ limit: async () => selectRows }),
      }),
    }),
  };
  return { db, events: schema.events, eventScoreWeights: schema.eventScoreWeights };
});

const { saveEventScoreWeights, getCurrentEventScoreWeights, getEventScoreWeightsState } =
  await import('./score-weights');

const dialect = new PgDialect();
const render = (s: SQL) => {
  const { sql, params } = dialect.sqlToQuery(s);
  return { sql: sql.replace(/\s+/g, ' ').trim(), params };
};

/** Spalten-Namen der Events-Tabelle je Dimension (snake_case wie in der DB). */
const DIM_COLUMNS: Record<(typeof EVENT_SCORE_DIMENSIONS)[number], string> = {
  public_appeal: 'public_appeal',
  scientific_significance: 'scientific_significance',
  reach: 'reach',
  timeliness: 'timeliness',
};

beforeEach(() => {
  captured.updateSet = null;
  captured.updateWhere = null;
  captured.inserted = null;
  selectRows = [];
  updatedRows = [];
});

describe('saveEventScoreWeights — SQL-Formel im Lockstep mit weightedScore()', () => {
  const patch = {
    public_appeal: 0.32,
    scientific_significance: 0.32,
    reach: 0.21,
    timeliness: 0.15,
  };

  it('rendert je Dimension GENAU EINEN Term $n * COALESCE(col, 0) — Reihenfolge = weightedScore-Iteration', async () => {
    await saveEventScoreWeights(patch);
    const frag = captured.updateSet?.eventScore as SQL;
    expect(frag).toBeTruthy();
    const { sql, params } = render(frag);

    // Genau 4 Parameter, in der Reihenfolge der Dimensions-Konstante — dieselbe
    // Reihenfolge, in der weightedScore über Object.keys(weights) iteriert.
    expect(params).toHaveLength(EVENT_SCORE_DIMENSIONS.length);
    EVENT_SCORE_DIMENSIONS.forEach((dim, i) => {
      // Term-Struktur: der i-te Parameter multipliziert die zur Dimension
      // gehörende Spalte, NULL zählt als 0 (COALESCE ↔ `?? 0`).
      expect(sql).toContain(`$${i + 1} * COALESCE("events"."${DIM_COLUMNS[dim]}", 0)`);
    });
    // Keine Dimension doppelt, keine fünfte dazuerfunden.
    expect(sql.match(/COALESCE/g)).toHaveLength(4);
    expect(sql.match(/\+/g)).toHaveLength(3);
  });

  it('SQL-Parameter == normalisierte Gewichte; Formel numerisch identisch mit weightedScore()', async () => {
    await saveEventScoreWeights(patch);
    const { params } = render(captured.updateSet?.eventScore as SQL);
    const weights = params.map(Number);

    // Normalisiert (Summe der Rohwerte hier schon 1) und positionsgenau.
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);

    // Numerischer Lockstep: dieselben Dimensionen durch die SQL-Formel
    // (COALESCE = ?? 0) und durch weightedScore gejagt — inkl. NULL-Sub-Score.
    const dims: Partial<Record<(typeof EVENT_SCORE_DIMENSIONS)[number], number>> = {
      public_appeal: 0.8,
      scientific_significance: 0.5,
      // reach fehlt (NULL in der DB) — muss beidseitig als 0 zählen.
      timeliness: 0.25,
    };
    const sqlResult = EVENT_SCORE_DIMENSIONS.reduce(
      (sum, dim, i) => sum + weights[i] * (dims[dim] ?? 0),
      0,
    );
    const weightsMap = Object.fromEntries(
      EVENT_SCORE_DIMENSIONS.map((dim, i) => [dim, weights[i]]),
    ) as Record<(typeof EVENT_SCORE_DIMENSIONS)[number], number>;
    expect(sqlResult).toBeCloseTo(weightedScore(dims, weightsMap), 12);
  });

  it('recomputet NUR analysierte Events (analysis_status = analyzed)', async () => {
    await saveEventScoreWeights(patch);
    const { sql, params } = render(captured.updateWhere as SQL);
    expect(sql).toBe('"events"."analysis_status" = $1');
    expect(params).toEqual(['analyzed']);
  });

  it('normalisiert Rohgewichte auf Summe 1 und schreibt sie so in die Historie', async () => {
    updatedRows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { current, recomputed } = await saveEventScoreWeights({
      public_appeal: 2,
      scientific_significance: 1,
      reach: 0.5,
      timeliness: 0.5,
      note: '  mehr Publikum  ',
    });
    // 2+1+0.5+0.5 = 4 → 0.5 / 0.25 / 0.125 / 0.125
    expect(captured.inserted).toMatchObject({
      publicAppeal: 0.5,
      scientificSignificance: 0.25,
      reach: 0.125,
      timeliness: 0.125,
      note: 'mehr Publikum',
      recomputedCount: 3,
    });
    expect(current.public_appeal).toBe(0.5);
    expect(current.note).toBe('mehr Publikum');
    expect(recomputed).toBe(3);

    // Die SQL-Parameter tragen dieselben normalisierten Werte.
    const { params } = render(captured.updateSet?.eventScore as SQL);
    expect(params.map(Number)).toEqual([0.5, 0.25, 0.125, 0.125]);
  });

  it('leere/fehlende Notiz wird zu null', async () => {
    await saveEventScoreWeights({ ...patch, note: '   ' });
    expect(captured.inserted?.note).toBeNull();
  });
});

describe('getCurrentEventScoreWeights — Fallback und Row-Mapping', () => {
  it('liefert die statischen EVENT_SCORE_WEIGHTS als Kopie, wenn die Historie leer ist', async () => {
    selectRows = [];
    const w = await getCurrentEventScoreWeights();
    expect(w).toEqual(EVENT_SCORE_WEIGHTS);
    // Kopie, kein Alias auf die Konstante (Mutation darf nicht durchschlagen).
    w.public_appeal = 0.99;
    expect(EVENT_SCORE_WEIGHTS.public_appeal).not.toBe(0.99);
  });

  it('mappt die jüngste Historien-Zeile auf die bare Gewichts-Map', async () => {
    selectRows = [
      {
        id: 7,
        publicAppeal: 0.4,
        scientificSignificance: 0.3,
        reach: 0.2,
        timeliness: 0.1,
        note: 'x',
        recomputedCount: 12,
        createdAt: '2026-08-30T00:00:00.000Z',
      },
    ];
    expect(await getCurrentEventScoreWeights()).toEqual({
      public_appeal: 0.4,
      scientific_significance: 0.3,
      reach: 0.2,
      timeliness: 0.1,
    });
  });
});

describe('getEventScoreWeightsState', () => {
  it('leere Historie → Default-Eintrag "Standard" als current UND history', async () => {
    selectRows = [];
    const state = await getEventScoreWeightsState();
    expect(state.current.note).toBe('Standard');
    expect(state.current.public_appeal).toBe(EVENT_SCORE_WEIGHTS.public_appeal);
    expect(state.history).toEqual([state.current]);
  });
});
