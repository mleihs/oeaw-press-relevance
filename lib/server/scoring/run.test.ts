import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageBatcher } from '@/lib/server/anthropic-batch';
import { LlmMaxTokensError, LlmRefusalError } from '@/lib/server/llm-types';
import { RunLockBusyError } from '@/lib/server/run-lock';
import { checkHaiku } from '@/lib/shared/scoring/haiku-syllables';
import type { RunOptions, ScoringAdapter, ScoredRow, WriteContext } from './types';

// Der Kern mit gemockten Rändern: Adapter (Kandidaten, Modellaufruf, Schreiben),
// completeJson (Haiku-Nachforderung, Lektorat), Journal, Lock, Sentry. Die
// Gates (sanitize, Audit, Silben) laufen echt.
const h = vi.hoisted(() => ({
  completeJson: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(async () => {}),
  startRun: vi.fn(async () => 'run-1'),
  progressRun: vi.fn(async () => {}),
  finishRun: vi.fn(async () => {}),
  capture: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: h.capture }));
vi.mock('@/lib/server/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/server/llm-client', async (orig) => ({
  ...(await orig<typeof import('@/lib/server/llm-client')>()),
  completeJson: h.completeJson,
}));
vi.mock('@/lib/server/run-lock', async (orig) => ({
  ...(await orig<typeof import('@/lib/server/run-lock')>()),
  acquireRunLock: h.acquire,
}));
vi.mock('./journal', () => ({ startRun: h.startRun, progressRun: h.progressRun, finishRun: h.finishRun }));

const { runScoring } = await import('./run');

interface TItem {
  id: string;
  title: string;
  n: number;
}
interface TResult {
  idx?: number;
  n: number;
  a: number;
  pitch_suggestion: string;
  suggested_angle: string;
  target_audience: string;
  reasoning: string;
  haiku?: string;
}

const GOOD_HAIKU = 'Leise fällt der Schnee / über das stille Dorf hin / Kinder lachen laut';
const BAD_HAIKU = 'Schnee fällt leise';

const items = (count: number): TItem[] =>
  Array.from({ length: count }, (_, i) => ({ id: `i${i + 1}`, title: `Titel ${i + 1}`, n: i + 1 }));

/** Texte ohne Audit-Befund: eigene Wörter je Datensatz, eigene Schlüsse, Pitch über 110 Zeichen. */
function result(item: TItem, idx: number, haiku = GOOD_HAIKU): TResult {
  const n = item.n;
  return {
    idx,
    n,
    a: 0.4,
    pitch_suggestion: `${Array.from({ length: 16 }, (_, k) => `wort${n}x${k}`).join(' ')}.`,
    suggested_angle: `winkel${n} als aussage${n}.`,
    target_audience: `zielgruppe${n}`,
    reasoning: `grund${n} eins${n} zwei${n} drei${n}.`,
    haiku,
  };
}

type Adapter = ScoringAdapter<TItem, TResult> & {
  fetchCandidates: ReturnType<typeof vi.fn>;
  analyze: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
};

function adapter(over: Partial<ScoringAdapter<TItem, TResult>> = {}, count = 7): Adapter {
  return {
    entity: 'publications',
    requiresHaiku: true,
    fetchCandidates: vi.fn(async () => ({ items: items(count), skipped: 0 })),
    analyze: vi.fn(async (batch: TItem[]) => ({
      results: batch.map((item, i) => result(item, i + 1)),
      tokensUsed: 100,
      cost: 0.05,
    })),
    resultIndex: (r: TResult) => r.idx,
    problemsOf: (r: TResult) => (r.a >= 0 && r.a <= 1 ? [] : ['a außerhalb 0..1']),
    textsOf: (r: TResult) => ({
      pitch_suggestion: r.pitch_suggestion,
      suggested_angle: r.suggested_angle,
      target_audience: r.target_audience,
      reasoning: r.reasoning,
      haiku: r.haiku,
    }),
    withTexts: (r: TResult, t) => ({ ...r, ...t }),
    contentOf: (item: TItem) => `Inhalt von ${item.title}`,
    scores: async (results: TResult[]) => results.map((r) => r.a),
    write: vi.fn(async (rows: Array<ScoredRow<TItem, TResult>>) => rows.map((r) => r.item.id)),
    markFailed: vi.fn(async () => {}),
    ...over,
  } as Adapter;
}

/** completeJson: Lektorat und Haiku-Nachforderung unterscheiden sich am System-Prompt. */
function llm(opts: { haiku?: () => string; lektorat?: () => unknown } = {}) {
  h.completeJson.mockImplementation(async ({ system }: { system: string }) =>
    system.startsWith('Du bist Lektor:in')
      ? { content: JSON.stringify(opts.lektorat?.() ?? { changes: [] }), tokensUsed: 50, cost: 0.02 }
      : { content: JSON.stringify({ haiku: opts.haiku?.() ?? GOOD_HAIKU }), tokensUsed: 20, cost: 0.01 },
  );
}
const lektoratCalls = () =>
  h.completeJson.mock.calls.filter(([o]) => (o as { system: string }).system.startsWith('Du bist Lektor:in'));
const haikuCalls = () =>
  h.completeJson.mock.calls.filter(([o]) => !(o as { system: string }).system.startsWith('Du bist Lektor:in'));

const base = (over: Partial<RunOptions> = {}): RunOptions => ({
  entities: ['publications'],
  trigger: 'cli',
  model: 'anthropic/claude-opus-5.5',
  write: true,
  batchSize: 5,
  concurrency: 2,
  costCapUsd: 25,
  ...over,
});

const writtenRows = (a: Adapter) =>
  a.write.mock.calls.flatMap(([rows]) => rows as Array<ScoredRow<TItem, TResult>>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
  vi.stubEnv('ANTHROPIC_EFFORT', undefined);
  h.acquire.mockResolvedValue({ release: h.release });
  llm();
});
afterEach(() => vi.unstubAllEnvs());

describe('runScoring', () => {
  it('Vorbedingung: das Test-Haiku hält die Prüfung', () => {
    expect(checkHaiku(GOOD_HAIKU).ok).toBe(true);
    expect(checkHaiku(BAD_HAIKU).ok).toBe(false);
  });

  it('(a) 7 Einträge, Batch 5: 2 Modellaufrufe, 1 Chunk, 1 Lektorat, 7 geschriebene Zeilen', async () => {
    const a = adapter();
    const out = await runScoring(base(), [a]);
    const run = out.publications!;

    expect(a.analyze.mock.calls.map(([batch]) => (batch as TItem[]).length)).toEqual([5, 2]);
    expect(lektoratCalls()).toHaveLength(1);
    expect(a.write).toHaveBeenCalledTimes(1);
    expect(writtenRows(a).map((r) => r.item.id)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']);
    expect(run).toMatchObject({ status: 'ok', runId: 'run-1', errorClass: null });
    expect(run.counts).toMatchObject({ candidates: 7, scored: 7, failed: 0, haikuRejected: 0, lektoratFlags: 0 });
    expect(run.report.scores).toHaveLength(7);

    // Tag, Effort und Journal
    const ctx = a.write.mock.calls[0][1] as WriteContext;
    expect(ctx.modelTag).toBe('anthropic/claude-opus-5.5-auto');
    expect(a.analyze.mock.calls[0][1]).toEqual({ apiKey: 'sk-ant-test', model: 'anthropic/claude-opus-5.5', effort: 'max' });
    // Das Lektorat mit high (ändert nur Texte), die Bewertung oben mit max.
    expect(lektoratCalls().map(([o]) => (o as { effort: string }).effort)).toEqual(['high']);
    expect(h.startRun).toHaveBeenCalledWith(expect.objectContaining({ entity: 'publications', trigger: 'cli', effort: 'max' }));
    expect(h.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'ok', medianScore: 0.4 }));
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('fordert Haikus mit Effort max nach, auch wenn das Lektorat mit high läuft', async () => {
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => ({
        results: batch.map((item, i) => result(item, i + 1, BAD_HAIKU)),
        tokensUsed: 100,
        cost: 0.05,
      })),
    }, 2);
    await runScoring(base(), [a]);
    expect(haikuCalls().map(([o]) => (o as { effort: string }).effort)).toEqual(['max', 'max']);
    expect(lektoratCalls().map(([o]) => (o as { effort: string }).effort)).toEqual(['high']);
  });

  it('(b) kaputtes Haiku: zwei Nachforderungen, der dritte Versuch wird gespeichert', async () => {
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => ({
        results: batch.map((item, i) => result(item, i + 1, item.id === 'i1' ? BAD_HAIKU : GOOD_HAIKU)),
        tokensUsed: 100,
        cost: 0.05,
      })),
    });
    const answers = [BAD_HAIKU, GOOD_HAIKU];
    llm({ haiku: () => answers.shift() ?? GOOD_HAIKU });

    const run = (await runScoring(base(), [a])).publications!;
    expect(haikuCalls()).toHaveLength(2);
    expect((haikuCalls()[1][0] as { user: string }).user).toContain('Versuch 2');
    expect(writtenRows(a).find((r) => r.item.id === 'i1')?.haiku).toBe(GOOD_HAIKU);
    expect(run.outcomes.find((o) => o.id === 'i1')?.haikuAttempts).toBe(3);
    expect(run.report.haiku_stats).toEqual({ checked: 7, first_try_ok: 6, retried_ok: 1 });
    expect(run.status).toBe('ok');
  });

  it('(c) Haiku dreimal kaputt: Feld bleibt leer, Bericht nennt es, Lauf ist partial', async () => {
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => ({
        results: batch.map((item, i) => result(item, i + 1, item.id === 'i1' ? BAD_HAIKU : GOOD_HAIKU)),
        tokensUsed: 100,
        cost: 0.05,
      })),
    });
    llm({ haiku: () => BAD_HAIKU });

    const run = (await runScoring(base(), [a])).publications!;
    expect(writtenRows(a).find((r) => r.item.id === 'i1')?.haiku).toBeNull();
    expect(run.report.haiku_rejected).toEqual([
      { id: 'i1', title: 'Titel 1', attempts: 3, last_issue: expect.stringContaining('Gefunden: 1 Zeile') },
    ]);
    expect(run.counts.haikuRejected).toBe(1);
    expect(run.status).toBe('partial');
    expect(h.capture).not.toHaveBeenCalled();
  });

  it('(d) Kostendeckel: Stopp nach Batch 1, der angefangene Chunk wird fertig, Klasse cost_cap', async () => {
    const a = adapter();
    const run = (await runScoring(base({ costCapUsd: 0.01, concurrency: 1 }), [a])).publications!;
    expect(a.analyze).toHaveBeenCalledTimes(1);
    expect(writtenRows(a)).toHaveLength(5);
    expect(run).toMatchObject({ status: 'partial', errorClass: 'cost_cap' });
    expect(run.counts.costCapHit).toBe(true);
    expect(h.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'partial' }));
    expect(h.capture).not.toHaveBeenCalled();
  });

  it('(e) jede Anfrage abgelehnt: failed, Klasse refusal, Lock frei, Sentry', async () => {
    const a = adapter({
      analyze: vi.fn(async () => {
        throw new LlmRefusalError('bio');
      }),
    });
    const run = (await runScoring(base(), [a])).publications!;
    expect(run).toMatchObject({ status: 'failed', errorClass: 'refusal', alarm: true });
    expect(a.write).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture.mock.calls[0][1]).toEqual({
      tags: { seam: 'scoring_run', entity: 'publications', trigger: 'cli', error_class: 'refusal' },
    });
    // Zwei Fünfer-Batches plus höchstens zwei Einzelaufrufe bis zur Grenze.
    expect(a.analyze.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('(e2) ein einzelner problematischer Eintrag: Batch wird zerlegt, der Rest bewertet', async () => {
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => {
        if (batch.some((item) => item.id === 'i3')) throw new LlmRefusalError('bio');
        return { results: batch.map((item, i) => result(item, i + 1)), tokensUsed: 100, cost: 0.05 };
      }),
    });
    const run = (await runScoring(base(), [a])).publications!;
    expect(writtenRows(a).map((r) => r.item.id).sort()).toEqual(['i1', 'i2', 'i4', 'i5', 'i6', 'i7']);
    expect(run).toMatchObject({ status: 'partial', alarm: false, errorClass: null });
    expect(run.counts).toMatchObject({ scored: 6, failed: 1 });
    expect(run.report.failed_items).toEqual([
      { id: 'i3', title: 'Titel 3', reason: expect.stringContaining('refusal, bio') },
    ]);
    expect(h.capture).not.toHaveBeenCalled();
  });

  it('(f) write:false: nichts geschrieben, kein Journal, kein Lock, Ergebnisse je Eintrag', async () => {
    const a = adapter();
    const run = (await runScoring(base({ write: false }), [a])).publications!;
    expect(a.write).not.toHaveBeenCalled();
    expect(a.markFailed).not.toHaveBeenCalled();
    expect(h.startRun).not.toHaveBeenCalled();
    expect(h.progressRun).not.toHaveBeenCalled();
    expect(h.finishRun).not.toHaveBeenCalled();
    expect(h.acquire).not.toHaveBeenCalled();
    expect(run.runId).toBeNull();
    expect(run.counts.scored).toBe(7);
    expect(run.outcomes).toHaveLength(7);
    expect(run.outcomes.every((o) => !o.written && o.haiku === GOOD_HAIKU)).toBe(true);
  });

  it('(g) Lektorat ändert nur Textfelder; pitch_revision nur bei geändertem Pitch', async () => {
    const a = adapter();
    const newPitch = `${Array.from({ length: 16 }, (_, k) => `neu2x${k}`).join(' ')}.`;
    llm({
      lektorat: () => ({
        changes: [
          { nr: 2, pitch_suggestion: newPitch, a: 0.99, haiku: 'drei / neue / zeilen' },
          { nr: 3, suggested_angle: 'Warum winkel3 als frage3?' },
        ],
      }),
    });
    const run = (await runScoring(base(), [a])).publications!;
    const rows = writtenRows(a);
    const i2 = rows.find((r) => r.item.id === 'i2')!;
    expect(i2.result.pitch_suggestion).toBe(newPitch);
    expect(i2.result.a).toBe(0.4);
    expect(i2.haiku).toBe(GOOD_HAIKU);
    expect(rows.find((r) => r.item.id === 'i3')!.result.suggested_angle).toBe('Warum winkel3 als frage3?');
    const ctx = a.write.mock.calls[0][1] as WriteContext;
    expect([...ctx.pitchRevised]).toEqual(['i2']);
    expect(run.report.lektorat_changes).toEqual([
      { id: 'i2', fields: ['pitch_suggestion'] },
      { id: 'i3', fields: ['suggested_angle'] },
    ]);
    expect(run.counts.lektoratChanges).toBe(2);
  });

  it('(h) Lock belegt: skipped, Journalzeile, kein Sentry, keine Kandidaten gezogen', async () => {
    h.acquire.mockRejectedValue(new RunLockBusyError());
    const a = adapter();
    const run = (await runScoring(base(), [a])).publications!;
    expect(run).toMatchObject({ status: 'skipped', errorClass: 'lock_busy', alarm: false });
    expect(h.startRun).toHaveBeenCalledTimes(1);
    expect(h.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'skipped' }));
    expect(a.fetchCandidates).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it('ordnet Antworten über den gemeldeten Index zu, nicht über die Position', async () => {
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => ({
        results: batch.map((item, i) => result(item, i + 1)).reverse(),
        tokensUsed: 100,
        cost: 0.05,
      })),
    });
    await runScoring(base(), [a]);
    expect(writtenRows(a).every((r) => r.result.n === r.item.n)).toBe(true);
  });

  it('hält Zwillinge im selben Batch und meldet ihre Positionen an analyze', async () => {
    const a = adapter({ twinGroups: () => [['i5', 'i6']] });
    await runScoring(base(), [a]);
    const calls = a.analyze.mock.calls.map(([batch, , extra]) => [
      (batch as TItem[]).map((b) => b.id).join(','),
      (extra as { twins: number[][] }).twins,
    ]);
    expect(calls).toEqual([
      ['i1,i2,i3,i4', []],
      ['i5,i6,i7', [[1, 2]]],
    ]);
  });

  it('wertet einen Lauf ohne eine einzige Bewertung als failed, auch bei vorübergehenden Fehlern', async () => {
    const a = adapter({
      analyze: vi.fn(async () => {
        throw new Error('Anthropic API error 529: Overloaded');
      }),
    });
    const run = (await runScoring(base(), [a])).publications!;
    expect(run).toMatchObject({ status: 'failed', errorClass: 'transport', alarm: true });
    expect(run.counts).toMatchObject({ scored: 0, failed: 7 });
    expect(a.markFailed).toHaveBeenCalledTimes(2);
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it('bricht auf das Signal hin ab: partial ohne Alarm, onCancelled einmal, nichts geschrieben', async () => {
    const ac = new AbortController();
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => {
        ac.abort();
        return { results: batch.map((item, i) => result(item, i + 1)), tokensUsed: 100, cost: 0.05 };
      }),
    });
    const onCancelled = vi.fn();
    const run = (await runScoring(base({ abortSignal: ac.signal, hooks: { onCancelled } }), [a])).publications!;
    expect(run).toMatchObject({ status: 'partial', errorClass: 'aborted', alarm: false });
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(a.write).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it('teilt den Kostendeckel über die Entitäten: ist er leer, bewertet die zweite nichts', async () => {
    const pubs = adapter({}, 3);
    const events = adapter({ entity: 'events', requiresHaiku: false }, 3);
    const out = await runScoring(base({ entities: ['publications', 'events'], costCapUsd: 0.04 }), [pubs, events]);
    expect(out.publications?.counts.scored).toBe(3);
    expect(events.analyze).not.toHaveBeenCalled();
    expect(out.events).toMatchObject({ status: 'partial', errorClass: 'cost_cap' });
    expect(out.events?.counts).toMatchObject({ candidates: 3, scored: 0 });
  });

  it('meldet die Kandidaten vor dem ersten Modellaufruf (Grundlage des SSE-Frames init)', async () => {
    const onCandidates = vi.fn();
    const a = adapter({ fetchCandidates: vi.fn(async () => ({ items: items(3), skipped: 2 })) });
    await runScoring(base({ hooks: { onCandidates } }), [a]);
    expect(onCandidates).toHaveBeenCalledWith({ entity: 'publications', total: 3, skipped: 2 });
    expect(onCandidates.mock.invocationCallOrder[0]).toBeLessThan(a.analyze.mock.invocationCallOrder[0]);
  });

  it('eine Kohorte neu bewerten heißt überschreiben: force an Kandidaten und Schreiben', async () => {
    const a = adapter();
    await runScoring(base({ rescoreTag: 'anthropic/claude-opus-5.5-auto' }), [a]);
    expect(a.fetchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, rescoreTag: 'anthropic/claude-opus-5.5-auto' }),
    );
    expect((a.write.mock.calls[0][1] as WriteContext).force).toBe(true);
  });

  it('wertet gleiche Schlüsse von Zwillingen nicht als Monotonie', async () => {
    // i2 trägt wortgleich die Texte von i1, wie eine Sprachversion desselben Termins.
    const twinTexts = vi.fn(async (batch: TItem[]) => ({
      results: batch.map((item, i) => (item.id === 'i2' ? { ...result(items(1)[0], i + 1), n: 2 } : result(item, i + 1))),
      tokensUsed: 100,
      cost: 0.05,
    }));
    const plain = (await runScoring(base(), [adapter({ analyze: twinTexts })])).publications!;
    expect(plain.report.audit_before.closing_bigram_dup).toBeGreaterThan(0);

    vi.clearAllMocks();
    h.acquire.mockResolvedValue({ release: h.release });
    llm();
    const twins = (await runScoring(base(), [adapter({ analyze: twinTexts, twinGroups: () => [['i1', 'i2']] })]))
      .publications!;
    expect(twins.report.audit_before.closing_bigram_dup).toBe(0);
    expect(twins.report.lektorat_flags).toEqual([]);
    expect(twins.status).toBe('ok');
  });

  it('nimmt ein mehrzeilig geschriebenes Haiku im ersten Versuch, ohne Nachforderung', async () => {
    // So schrieb Opus 5.5 im lokalen Lauf vom 2026-10-27 alle Erstversuche.
    const multiline = GOOD_HAIKU.split(' / ').join('\n');
    const a = adapter({
      analyze: vi.fn(async (batch: TItem[]) => ({
        results: batch.map((item, i) => result(item, i + 1, multiline)),
        tokensUsed: 100,
        cost: 0.05,
      })),
    });
    const run = (await runScoring(base(), [a])).publications!;
    expect(haikuCalls()).toHaveLength(0);
    expect(run.report.haiku_stats).toEqual({ checked: 7, first_try_ok: 7, retried_ok: 0 });
    expect(writtenRows(a).every((r) => r.haiku === GOOD_HAIKU)).toBe(true);
  });

  const stackSize = (user: string) => Number(/Stapel mit (\d+)/.exec(user)?.[1]);

  it('halbiert ein abgeschnittenes Lektorat und verbucht den Preis des Abbruchs', async () => {
    const a = adapter();
    h.completeJson.mockImplementation(async ({ system, user }: { system: string; user: string }) => {
      if (!system.startsWith('Du bist Lektor:in')) return { content: JSON.stringify({ haiku: GOOD_HAIKU }), tokensUsed: 20, cost: 0.01 };
      if (stackSize(user) > 4) {
        throw Object.assign(new LlmMaxTokensError(128_000, { promptTokens: 10, completionTokens: 128_000 }), { cost: 2.5 });
      }
      return { content: JSON.stringify({ changes: [] }), tokensUsed: 50, cost: 0.02 };
    });
    const run = (await runScoring(base(), [a])).publications!;
    expect(lektoratCalls().map(([o]) => stackSize((o as { user: string }).user))).toEqual([7, 4, 3]);
    expect(writtenRows(a)).toHaveLength(7);
    expect(run.status).toBe('ok');
    // Zwei Bewertungsaufrufe à 0,05, der abgeschnittene Aufruf 2,50, zwei Lektorate à 0,02.
    expect(run.counts.costUsd).toBeCloseTo(0.1 + 2.5 + 0.04, 6);
  });

  it('schreibt einen Eintrag nicht, dessen Lektorat auch einzeln abbricht, den Rest schon', async () => {
    const a = adapter({}, 3);
    h.completeJson.mockImplementation(async ({ system, user }: { system: string; user: string }) => {
      if (!system.startsWith('Du bist Lektor:in')) return { content: JSON.stringify({ haiku: GOOD_HAIKU }), tokensUsed: 20, cost: 0.01 };
      if (user.includes('Titel 2')) throw new LlmMaxTokensError(128_000);
      return { content: JSON.stringify({ changes: [] }), tokensUsed: 50, cost: 0.02 };
    });
    const run = (await runScoring(base(), [a])).publications!;
    // 3 → 2 + 1; die 2 → 1 + 1; der Problemfall einzeln zweimal.
    expect(lektoratCalls().map(([o]) => stackSize((o as { user: string }).user))).toEqual([3, 2, 1, 1, 1, 1]);
    expect(writtenRows(a).map((r) => r.item.id)).toEqual(['i1', 'i3']);
    expect(a.markFailed).toHaveBeenCalledWith(['i2']);
    expect(run.report.failed_items).toEqual([
      { id: 'i2', title: 'Titel 2', reason: expect.stringContaining('Lektorat gescheitert') },
    ]);
    expect(run).toMatchObject({ status: 'partial', alarm: false });
  });

  it('beginnt gar nicht erst, wenn das Effort-Gate greift', async () => {
    vi.stubEnv('ANTHROPIC_EFFORT', 'high');
    const a = adapter();
    await expect(runScoring(base(), [a])).rejects.toMatchObject({ errorClass: 'effort_gate' });
    expect(h.startRun).not.toHaveBeenCalled();
    expect(a.fetchCandidates).not.toHaveBeenCalled();
  });
});

describe('runScoring, Transport', () => {
  /** 12 Einträge (Batches 5 + 5 + 2), jedes Haiku braucht eine Nachforderung; zählt, wie viele Aufrufe zugleich laufen. */
  function measured() {
    const peak = { analyze: 0, haiku: 0 };
    const running = { analyze: 0, haiku: 0 };
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const a = adapter(
      {
        analyze: vi.fn(async (batch: TItem[]) => {
          peak.analyze = Math.max(peak.analyze, ++running.analyze);
          await tick();
          running.analyze--;
          return { results: batch.map((item, i) => result(item, i + 1, BAD_HAIKU)), tokensUsed: 100, cost: 0.05 };
        }),
      },
      12,
    );
    h.completeJson.mockImplementation(async ({ system }: { system: string }) => {
      if (system.startsWith('Du bist Lektor:in')) return { content: JSON.stringify({ changes: [] }), tokensUsed: 50, cost: 0.02 };
      peak.haiku = Math.max(peak.haiku, ++running.haiku);
      await tick();
      running.haiku--;
      return { content: JSON.stringify({ haiku: GOOD_HAIKU }), tokensUsed: 20, cost: 0.01 };
    });
    return { a, peak };
  }

  it('reicht über die Batch-API einen Batcher an jeden Modellaufruf und stellt die Aufrufe einer Phase zugleich', async () => {
    const { a, peak } = measured();
    const run = (await runScoring(base({ transport: 'batch' }), [a])).publications!;
    // Alle drei Bewertungs-Batches und alle zwölf Nachforderungen zugleich:
    // so landen sie je Phase in EINER Batch-Anfrage.
    expect(peak).toEqual({ analyze: 3, haiku: 12 });
    const batch = (a.analyze.mock.calls[0] as unknown[])[1] as { batch?: unknown };
    expect(batch.batch).toBeInstanceOf(MessageBatcher);
    for (const [o] of h.completeJson.mock.calls) expect((o as { batch?: unknown }).batch).toBe(batch.batch);
    expect(run.report.message_batches).toEqual([]);
    expect(run).toMatchObject({ status: 'ok', counts: { scored: 12, haikuRejected: 0 } });
  });

  it('ruft direkt ohne Batcher und mit der eingestellten Parallelität', async () => {
    const { a, peak } = measured();
    const run = (await runScoring(base(), [a])).publications!;
    expect(peak).toEqual({ analyze: 2, haiku: 2 });
    expect(((a.analyze.mock.calls[0] as unknown[])[1] as { batch?: unknown }).batch).toBeUndefined();
    expect(run.report).not.toHaveProperty('message_batches');
    expect(run).toMatchObject({ status: 'ok', counts: { scored: 12 } });
  });
});
