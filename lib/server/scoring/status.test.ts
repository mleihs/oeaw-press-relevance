import { describe, it, expect, vi, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ latestRuns: vi.fn() }));
vi.mock('./journal', () => ({ latestRuns: h.latestRuns }));

const { getScoringRunStatus, toEntityScoringRun } = await import('./status');
type Row = NonNullable<Parameters<typeof toEntityScoringRun>[0]>;

function row(over: Partial<Row>): Row {
  return {
    id: 'r1',
    entity: 'publications',
    trigger: 'nightly',
    status: 'partial',
    startedAt: '2026-10-28T05:40:00.000Z',
    finishedAt: '2026-10-28T06:05:00.000Z',
    model: 'anthropic/claude-opus-5.5',
    modelTag: 'anthropic/claude-opus-5.5-auto',
    effort: 'max',
    candidates: 62,
    scored: 60,
    failed: 0,
    skipped: 0,
    haikuRejected: 2,
    lektoratFlags: 1,
    lektoratChanges: 14,
    costUsd: 9.8,
    costCapUsd: 25,
    costCapHit: false,
    medianScore: 0.2735,
    summary: '62 Kandidaten, 60 bewertet',
    errorClass: null,
    errorMessage: null,
    report: {
      haiku_rejected: [{ id: 'p1', title: 'Pub 1', attempts: 3, last_issue: 'Zeile 2' }],
      lektorat_flags: [{ id: 'p2', title: 'Pub 2', field: 'reasoning', code: 'fallback_phrase', detail: 'für Laien' }],
    },
    ...over,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('toEntityScoringRun', () => {
  it('ist idle ohne jeden Lauf', () => {
    expect(toEntityScoringRun(null, null)).toMatchObject({ runState: 'idle', lastRunAt: null, progress: null });
  });

  it('bildet einen abgeschlossenen Lauf samt Listen für die Bubbles ab', () => {
    const run = toEntityScoringRun(row({}), null);
    expect(run).toMatchObject({
      runState: 'partial',
      lastRunAt: '2026-10-28T06:05:00.000Z',
      lastRunDurationMs: 25 * 60_000,
      lastRunTrigger: 'nightly',
      costUsd: 9.8,
      medianScore: 0.2735,
      progress: null,
      haikuRejectedItems: [{ id: 'p1', title: 'Pub 1' }],
      lektoratFlagItems: [{ id: 'p2', title: 'Pub 2', field: 'reasoning', code: 'fallback_phrase' }],
    });
  });

  it('zeigt einen laufenden Lauf mit Fortschritt vor dem letzten abgeschlossenen', () => {
    const running = row({ id: 'r2', status: 'running', finishedAt: null, candidates: 40, scored: 10, failed: 2, report: {} });
    expect(toEntityScoringRun(row({}), running)).toMatchObject({
      runState: 'running',
      lastRunAt: '2026-10-28T05:40:00.000Z',
      lastRunDurationMs: null,
      progress: { done: 12, total: 40 },
      haikuRejectedItems: [],
    });
  });

  it('zeigt einen übersprungenen Lauf als ok, mit seiner Fehlerklasse', () => {
    expect(toEntityScoringRun(row({ status: 'skipped', errorClass: 'lock_busy' }), null)).toMatchObject({
      runState: 'ok',
      errorClass: 'lock_busy',
    });
  });
});

describe('getScoringRunStatus', () => {
  it('meldet disabled ohne Journal-Abfrage, wenn die Instanz nicht bewertet', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    const status = await getScoringRunStatus();
    expect(status.publications.runState).toBe('disabled');
    expect(status.events.runState).toBe('disabled');
    expect(h.latestRuns).not.toHaveBeenCalled();
  });

  it('liest sonst das Journal je Entität', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    vi.stubEnv('SCORING_NIGHTLY_ENABLED', undefined);
    h.latestRuns.mockResolvedValue({
      publications: { latest: row({}), running: null },
      events: { latest: null, running: null },
    });
    const status = await getScoringRunStatus();
    expect(status.publications.runState).toBe('partial');
    expect(status.events.runState).toBe('idle');
  });
});
