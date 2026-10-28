import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// Der Schreibpfad ohne DB: die Update-Kette wird abgefangen, SET-Werte und das
// gerenderte WHERE werden geprüft. `returning` liefert je id, was der Test als
// „getroffen" vorgibt.
const h = vi.hoisted(() => ({
  updates: [] as Array<{ set: Record<string, unknown>; where: SQL }>,
  missing: new Set<string>(),
}));

vi.mock('@/lib/server/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/server/db/schema')>('@/lib/server/db/schema');
  return {
    publications: schema.publications,
    events: schema.events,
    db: {
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: (where: SQL) => ({
            returning: async () => {
              h.updates.push({ set, where });
              const id = new PgDialect().sqlToQuery(where).params[0] as string;
              return h.missing.has(id) ? [] : [{ id }];
            },
          }),
        }),
      }),
    },
  };
});

vi.mock('@/lib/server/events/score-weights', () => ({
  getCurrentEventScoreWeights: vi.fn(async () => ({
    public_appeal: 0.25,
    scientific_significance: 0.25,
    reach: 0.25,
    timeliness: 0.25,
  })),
}));

const { writePublicationEvaluations, writeEventEvaluations, eventScores } = await import('./persist');
const dialect = new PgDialect();
const where = (i: number) => dialect.sqlToQuery(h.updates[i].where).sql;

const pub = (pitch = 'Pitch') => ({
  publication_index: 1,
  public_accessibility: 0.4,
  societal_relevance: 0.6,
  novelty_factor: 0.2,
  storytelling_potential: 0.5,
  media_timeliness: 0.1,
  pitch_suggestion: pitch,
  target_audience: 'ORF Wissenschaft',
  suggested_angle: 'Winkel',
  reasoning: 'Begründung',
  haiku: 'roh',
});

beforeEach(() => {
  h.updates.length = 0;
  h.missing.clear();
});

describe('writePublicationEvaluations', () => {
  it('schützt ohne force einen vorhandenen Score im WHERE und überschreibt mit force', async () => {
    const ctx = { modelTag: 'anthropic/claude-opus-5.5-auto', pitchRevised: new Set<string>() };
    await writePublicationEvaluations([{ id: 'a', result: pub(), haiku: null, cost: 0.1 }], { ...ctx, force: false });
    await writePublicationEvaluations([{ id: 'a', result: pub(), haiku: null, cost: 0.1 }], { ...ctx, force: true });
    expect(where(0)).toContain('"press_score" is null');
    expect(where(1)).not.toContain('press_score');
  });

  it('schreibt das geprüfte Haiku, den Tag, die Kosten und pitch_revision nur bei Lektorat-Pitch', async () => {
    const written = await writePublicationEvaluations(
      [
        { id: 'a', result: pub(), haiku: 'eins / zwei / drei', cost: 0.12 },
        { id: 'b', result: pub(), haiku: null, cost: 0.08 },
      ],
      { modelTag: 'anthropic/claude-opus-5.5-auto', force: false, pitchRevised: new Set(['b']) },
    );
    expect(written).toEqual(['a', 'b']);
    expect(h.updates[0].set).toMatchObject({
      analysisStatus: 'analyzed',
      haiku: 'eins / zwei / drei',
      llmModel: 'anthropic/claude-opus-5.5-auto',
      analysisCost: 0.12,
      pitchRevision: 0,
    });
    expect(h.updates[0].set.pressScore).toEqual(expect.any(Number));
    expect(h.updates[1].set).toMatchObject({ haiku: null, pitchRevision: 1 });
  });

  it('meldet nur die ids, deren Update eine Zeile getroffen hat', async () => {
    h.missing.add('b');
    const written = await writePublicationEvaluations(
      [
        { id: 'a', result: pub(), haiku: null, cost: 0 },
        { id: 'b', result: pub(), haiku: null, cost: 0 },
      ],
      { modelTag: 't', force: false, pitchRevised: new Set() },
    );
    expect(written).toEqual(['a']);
  });
});

describe('writeEventEvaluations', () => {
  const ev = {
    event_index: 1,
    public_appeal: 1.4,
    scientific_significance: 0.5,
    reach: 0.5,
    timeliness: 0.5,
    pitch_suggestion: '  Teaser  ',
    suggested_angle: '',
    target_audience: 'breite Öffentlichkeit',
    reasoning: 'Grund',
  };

  it('begrenzt Dimensionen, rechnet mit der Team-Gewichtung und schützt event_score', async () => {
    const written = await writeEventEvaluations([{ id: 'e1', result: ev, cost: 0.05 }], {
      modelTag: 'anthropic/claude-opus-5.5-auto',
      force: false,
    });
    expect(written).toEqual(['e1']);
    expect(where(0)).toContain('"event_score" is null');
    expect(h.updates[0].set).toMatchObject({
      publicAppeal: 1,
      eventScore: (1 + 0.5 + 0.5 + 0.5) / 4,
      pitchSuggestion: 'Teaser',
      suggestedAngle: null,
      llmModel: 'anthropic/claude-opus-5.5-auto',
      analysisCost: 0.05,
    });
    expect(await eventScores([ev])).toEqual([(1 + 0.5 + 0.5 + 0.5) / 4]);
  });
});
