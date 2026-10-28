#!/usr/bin/env tsx
// Vergleichslauf (Plan §6, Checkpoint 3): bewertet die zuletzt in-chat
// bewerteten Publikationen und Events mit dem Bewertungskern neu, ohne etwas
// zu schreiben (kein Journal, kein Lock, keine Zeile), und misst, wie weit der
// Kern von der In-Chat-Bewertung abweicht: Scores, Dimensionen, Haikus, Texte.
// Ein Teil der Publikationen läuft ein zweites Mal (Test-Retest, der
// Rausch-Boden). Liest nur; schreibt nur die Report-Dateien. Über die
// Batch-API wie die Nacht (halber Preis); `--direct` ruft sofort.
//
//   npm run db:tunnel &
//   PROD_DB_TUNNEL=1 npx tsx scripts/scoring-compare.ts --target=prod --pubs=40 --events=30 --retest=10 --out=<datei>.json
//
// Flags: --pubs=N --events=N --retest=N (Default 40/30/10), --cost-cap=USD je
// Teillauf (Default 20), --direct, --out=DATEI (Pflicht). Schreibt DATEI (alles,
// auch die Texte) und DATEI ohne .json plus .md (Zusammenfassung, Schwellen,
// Sprachprobe zum Lesen).

import { writeFileSync } from 'node:fs';
import { bootstrapScript, captureScriptError, flushAndExit, redactedDatabaseUrl } from './lib/bootstrap';
import { checkHaikus, countWord as countWordVoters, espeakCounts } from './lib/haiku-syllables.mjs';

const { target, flags } = bootstrapScript('scoring-compare');
process.env.LOG_LEVEL ??= 'warn';

const flag = (name: string): string | undefined => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string): boolean => flags.includes(`--${name}`);
const fail = (message: string): never => {
  console.error(`[scoring-compare] ${message}`);
  process.exit(1);
};
const count = (name: string, fallback: number): number => {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fail(`--${name}=${raw}: erwartet eine ganze Zahl ≥ 0.`);
};

type Row = Record<string, unknown>;
type Entity = 'publications' | 'events';

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ränge mit gemittelten Bindungen. */
function ranks(xs: readonly number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    for (let t = k; t <= j; t++) out[order[t].i] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return out;
}

function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length < 3) return NaN;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

const BINS = [-Infinity, -0.1, -0.05, -0.02, 0.02, 0.05, 0.1, Infinity];
function histogram(deltas: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let b = 0; b < BINS.length - 1; b++) {
    const lo = BINS[b];
    const hi = BINS[b + 1];
    const label = `${Number.isFinite(lo) ? lo : '−∞'} … ${Number.isFinite(hi) ? hi : '∞'}`;
    out[label] = deltas.filter((d) => d >= lo && d < hi).length;
  }
  return out;
}

/** Feste Zufallsauswahl (Sprachprobe): dieselbe Stichprobe bei gleicher Eingabe. */
function sample<T extends { id: string }>(items: readonly T[], n: number): T[] {
  const key = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return [...items].sort((a, b) => key(a.id) - key(b.id)).slice(0, n);
}

async function main(): Promise<number> {
  const out = flag('out') ?? fail('--out=<datei>.json fehlt.');
  const nPubs = count('pubs', 40);
  const nEvents = count('events', 30);
  const nRetest = Math.min(count('retest', 10), nPubs);
  const costCapUsd = Number(flag('cost-cap') ?? 20);
  const transport = has('direct') ? ('direct' as const) : ('batch' as const);
  console.log(`[scoring-compare] target=${target} db=${redactedDatabaseUrl()} · ${transport} · pubs=${nPubs} events=${nEvents} retest=${nRetest}`);

  const { db } = await import('@/lib/server/db');
  const { sql } = await import('drizzle-orm');
  const { SCORING_ADAPTERS } = await import('@/lib/server/scoring/adapters');
  const { runScoring } = await import('@/lib/server/scoring/run');
  const { DEFAULT_LLM_MODEL, SCORE_DIMENSIONS, EVENT_SCORE_DIMENSIONS } = await import('@/lib/shared/constants');
  const { TEXT_FIELDS, auditBatch, auditItem, countFindings } = await import('@/lib/shared/scoring/text-audit');
  const { countWord: countWordApp, wordsOf } = await import('@/lib/shared/scoring/haiku-syllables');
  const { splitHaiku } = await import('@/lib/shared/haiku');
  const pubTag = (await import('@/lib/shared/session-model.json')).default.tag;
  const eventTag = (await import('@/lib/shared/event-session-model.json')).default.tag;

  const pubRefs = (await db.execute(sql`
    SELECT p.id, p.title, p.press_score AS score, ${sql.raw(SCORE_DIMENSIONS.map((d) => `p.${d}`).join(', '))},
           p.pitch_suggestion, p.suggested_angle, p.target_audience, p.reasoning, p.haiku
      FROM publications p
     WHERE p.llm_model = ${pubTag} AND p.id IN (SELECT id FROM publication_rescore_pool)
     ORDER BY p.updated_at DESC LIMIT ${nPubs}`)) as unknown as Row[];
  const eventRefs = (await db.execute(sql`
    SELECT e.id, e.title, e.event_score AS score, ${sql.raw(EVENT_SCORE_DIMENSIONS.map((d) => `e.${d}`).join(', '))},
           e.pitch_suggestion, e.suggested_angle, e.target_audience, e.reasoning
      FROM events e
     WHERE e.llm_model = ${eventTag} AND e.event_at >= now()
     ORDER BY e.analyzed_at DESC LIMIT ${nEvents}`)) as unknown as Row[];
  // Zulauf der letzten 60 Tage für die Hochrechnung (dieselben Gates wie die Nacht).
  const [inflow] = (await db.execute(sql`
    SELECT (SELECT count(*) FROM publication_rescore_pool WHERE created_at >= now() - interval '60 days') AS pubs,
           (SELECT count(DISTINCT created_at::date) FROM publication_rescore_pool WHERE created_at >= now() - interval '60 days') AS pub_days,
           (SELECT count(*) FROM events WHERE created_at >= now() - interval '60 days' AND event_at >= created_at) AS events,
           (SELECT count(DISTINCT created_at::date) FROM events WHERE created_at >= now() - interval '60 days' AND event_at >= created_at) AS event_days`)) as unknown as Row[];
  console.log(`[scoring-compare] Referenzen: ${pubRefs.length} Publikationen (${pubTag}), ${eventRefs.length} Events (${eventTag})`);

  const pubIds = pubRefs.map((r) => String(r.id));
  const eventIds = eventRefs.map((r) => String(r.id));
  const t0 = Date.now();
  const scoreRun = async (entity: Entity, ids: string[], label: string) => {
    if (ids.length === 0) return null;
    const started = Date.now();
    const res = await runScoring(
      {
        entities: [entity],
        trigger: 'compare',
        model: DEFAULT_LLM_MODEL,
        write: false,
        force: true,
        ids,
        limit: { [entity]: ids.length },
        transport,
        costCapUsd,
        hooks: {
          onBatchStart: (p) => console.log(`[scoring-compare] ${label}: Batch ${p.batchIndex}/${p.totalBatches} (${p.batch.length})`),
          onChunkWritten: (p) => console.log(`[scoring-compare] ${label}: Chunk fertig, ${p.written} bewertet`),
          onError: (e) => console.warn(`[scoring-compare] ${label}: Fehler${e.fatal ? ' (fatal)' : ''}: ${e.message}`),
        },
      },
      SCORING_ADAPTERS,
    );
    const run = res[entity] ?? null;
    console.log(`[scoring-compare] ${label}: ${run?.status} · ${run?.summary} · ${Math.round((Date.now() - started) / 60_000)} min`);
    return run ? { ...run, durationMs: Date.now() - started } : null;
  };
  const [pubRun, eventRun, retestRun] = await Promise.all([
    scoreRun('publications', pubIds, 'Publikationen'),
    scoreRun('events', eventIds, 'Events'),
    scoreRun('publications', pubIds.slice(0, nRetest), 'Retest'),
  ]);

  // ---- Auswertung je Entität ----
  const dimsOf = (entity: Entity) => (entity === 'publications' ? SCORE_DIMENSIONS : EVENT_SCORE_DIMENSIONS) as readonly string[];
  type Run = NonNullable<typeof pubRun>;
  function compare(entity: Entity, refs: Row[], run: Run | null) {
    if (!run) return null;
    const byId = new Map(run.outcomes.map((o) => [o.id, o]));
    const pairs = refs.flatMap((ref) => {
      const o = byId.get(String(ref.id));
      return o ? [{ ref, o, result: o.result as Row }] : [];
    });
    const deltas = pairs.map(({ ref, o }) => o.score - Number(ref.score));
    const dims = Object.fromEntries(
      dimsOf(entity).map((d) => {
        const ds = pairs.map(({ ref, result }) => Number(result[d]) - Number(ref[d]));
        return [d, { bias: r4(mean(ds)), meanAbs: r4(mean(ds.map(Math.abs))) }];
      }),
    );
    const textsOf = (r: Row) => Object.fromEntries(TEXT_FIELDS.map((f) => [f, String(r[f] ?? '')])) as Record<(typeof TEXT_FIELDS)[number], string>;
    const audit = (items: Array<{ id: string; texts: ReturnType<typeof textsOf> }>) =>
      countFindings([...items.flatMap((it) => auditItem(it, { entity })), ...auditBatch(items, { entity })]);
    const lektoratFields: Record<string, number> = {};
    for (const c of run.report.lektorat_changes) for (const f of c.fields) lektoratFields[f] = (lektoratFields[f] ?? 0) + 1;
    const scoringCost = run.report.batches.reduce((n, b) => n + b.cost, 0);
    return {
      n: pairs.length,
      notScored: refs.length - pairs.length,
      status: run.status,
      summary: run.summary,
      bias: r4(mean(deltas)),
      meanAbs: r4(mean(deltas.map(Math.abs))),
      medianAbs: r4(median(deltas.map(Math.abs))),
      maxAbs: r4(Math.max(...deltas.map(Math.abs))),
      spearman: r4(spearman(pairs.map((p) => Number(p.ref.score)), pairs.map((p) => p.o.score))),
      histogram: histogram(deltas),
      dims,
      auditOld: audit(pairs.map(({ ref }) => ({ id: String(ref.id), texts: textsOf(ref) }))),
      auditNew: audit(pairs.map(({ o, result }) => ({ id: o.id, texts: textsOf(result) }))),
      lektoratChangeRate: Object.fromEntries(Object.entries(lektoratFields).map(([f, k]) => [f, r4(k / Math.max(1, pairs.length))])),
      costUsd: r4(run.counts.costUsd),
      scoringCostUsd: r4(scoringCost),
      restCostUsd: r4(run.counts.costUsd - scoringCost),
      chunks: Math.ceil(pairs.length / 25),
      durationMin: Math.round(run.durationMs / 60_000),
      messageBatches: run.report.message_batches ?? [],
      haikuStats: run.report.haiku_stats,
      haikuRejected: run.report.haiku_rejected,
      lektoratFlags: run.report.lektorat_flags,
      failedItems: run.report.failed_items,
      pairs: pairs.map(({ ref, o, result }) => ({
        id: o.id,
        title: o.title,
        old: { score: Number(ref.score), ...Object.fromEntries(dimsOf(entity).map((d) => [d, Number(ref[d])])), ...textsOf(ref), haiku: ref.haiku ?? null },
        new: { score: r4(o.score), ...Object.fromEntries(dimsOf(entity).map((d) => [d, Number(result[d])])), ...textsOf(result), haiku: o.haiku },
        lektoratFields: o.lektoratFields,
        cost: o.cost,
      })),
    };
  }
  const pubs = compare('publications', pubRefs, pubRun);
  const events = compare('events', eventRefs, eventRun);

  // ---- Test-Retest (Rausch-Boden) ----
  let retest: { n: number; meanAbs: number; medianAbs: number } | null = null;
  if (pubRun && retestRun) {
    const first = new Map(pubRun.outcomes.map((o) => [o.id, o.score]));
    const ds = retestRun.outcomes.flatMap((o) => (first.has(o.id) ? [Math.abs(o.score - (first.get(o.id) as number))] : []));
    retest = { n: ds.length, meanAbs: r4(mean(ds)), medianAbs: r4(median(ds)) };
  }

  // ---- Haikus: App-Gate gegen die drei Wähler ----
  const haikus = (pubRun?.outcomes ?? []).flatMap((o) => (o.haiku ? [o.haiku] : []));
  const voters = await checkHaikus(haikus);
  const words = [...new Set(haikus.flatMap((h) => (splitHaiku(h) ?? []).flatMap(wordsOf)))];
  const espeak = words.length ? await espeakCounts(words) : new Map();
  const wordMismatches = words.filter((w) => countWordApp(w).count !== countWordVoters(w, espeak).count);
  const haiku = {
    checked: pubRun?.report.haiku_stats.checked ?? 0,
    firstTryRate: pubRun ? r4(pubRun.report.haiku_stats.first_try_ok / Math.max(1, pubRun.report.haiku_stats.checked)) : NaN,
    finalRate: pubRun ? r4(haikus.length / Math.max(1, pubRun.report.haiku_stats.checked)) : NaN,
    votersAgree: r4(voters.filter((v) => v.ok).length / Math.max(1, voters.length)),
    votersRejected: voters.flatMap((v, i) => (v.ok ? [] : [{ haiku: haikus[i], issues: v.issues.map((x) => x.message) }])),
    wordAgreement: r4(1 - wordMismatches.length / Math.max(1, words.length)),
    wordMismatches: wordMismatches.map((w) => ({ word: w, app: countWordApp(w).count, voters: countWordVoters(w, espeak).count })),
  };

  // ---- Zwillinge (Events) ----
  let twins: Array<{ ids: string[]; maxAbsDelta: number }> = [];
  const eventAdapter = SCORING_ADAPTERS.find((a) => a.entity === 'events');
  if (events && eventAdapter?.twinGroups) {
    const { items } = await eventAdapter.fetchCandidates({ limit: eventIds.length, ids: eventIds, force: true });
    const scoreOf = new Map(events.pairs.map((p) => [p.id, p.new.score]));
    twins = eventAdapter.twinGroups(items).flatMap((g) => {
      const s = g.flatMap((id) => (scoreOf.has(id) ? [scoreOf.get(id) as number] : []));
      return s.length > 1 ? [{ ids: g, maxAbsDelta: r4(Math.max(...s) - Math.min(...s)) }] : [];
    });
  }

  // ---- Hochrechnung ----
  const per = (x: number, n: number) => (n > 0 ? x / n : 0);
  const pubDays = Number(inflow.pub_days);
  const eventDays = Number(inflow.event_days);
  const month = {
    pubs: (Number(inflow.pubs) / 60) * 30,
    events: (Number(inflow.events) / 60) * 30,
    pubNights: (pubDays / 60) * 30,
    eventNights: (eventDays / 60) * 30,
  };
  const projection = {
    inflowPerMonth: { pubs: Math.round(month.pubs), events: Math.round(month.events) },
    usdPerMonth: r4(
      month.pubs * per(pubs?.scoringCostUsd ?? 0, pubs?.n ?? 0) +
        month.pubNights * per(pubs?.restCostUsd ?? 0, pubs?.chunks ?? 0) +
        month.events * per(events?.scoringCostUsd ?? 0, events?.n ?? 0) +
        month.eventNights * per(events?.restCostUsd ?? 0, events?.chunks ?? 0),
    ),
  };

  // ---- Schwellen (Plan §6) ----
  const after = (e: typeof pubs, code: string) => (e ? (e.auditNew as Record<string, number>)[code] ?? 0 : 0);
  const gates = [
    ['|Bias press_score| ≤ 0,015', pubs ? Math.abs(pubs.bias) <= 0.015 : null, pubs?.bias],
    ['mittlere |Δ| Pubs ≤ 0,035', pubs ? pubs.meanAbs <= 0.035 : null, pubs?.meanAbs],
    ['mittlere |Δ| Pubs ≤ 1,25 × Test-Retest', pubs && retest ? pubs.meanAbs <= 1.25 * retest.meanAbs : null, retest ? `${pubs?.meanAbs} vs ${r4(1.25 * retest.meanAbs)}` : null],
    ['Spearman Pubs ≥ 0,90', pubs ? pubs.spearman >= 0.9 : null, pubs?.spearman],
    ['Spearman Events ≥ 0,85', events ? events.spearman >= 0.85 : null, events?.spearman],
    ['keine Dimension |Bias| > 0,05', pubs || events ? [...Object.values(pubs?.dims ?? {}), ...Object.values(events?.dims ?? {})].every((d) => Math.abs(d.bias) <= 0.05) : null, null],
    ['Haiku 1. Versuch ≥ 90 %', pubRun ? haiku.firstTryRate >= 0.9 : null, haiku.firstTryRate],
    ['Haiku nach Nachforderung 100 %', pubRun ? haiku.finalRate >= 1 : null, haiku.finalRate],
    ['App-Gate = 3 Wähler ≥ 99 % der Wörter', words.length ? haiku.wordAgreement >= 0.99 : null, haiku.wordAgreement],
    ['nach Lektorat 0 closing_bigram_dup / fallback_phrase / leak / em_dash', pubs || events ? ['closing_bigram_dup', 'fallback_phrase', 'leak', 'em_dash'].every((c) => after(pubs, c) + after(events, c) === 0) : null, null],
    ['Events-Zwillinge |Δ| ≤ 0,02', twins.length ? twins.every((t) => t.maxAbsDelta <= 0.02) : null, twins.length ? Math.max(...twins.map((t) => t.maxAbsDelta)) : null],
    ['Hochrechnung ≤ 25 USD je Nacht', projection.usdPerMonth / 30 <= 25, r4(projection.usdPerMonth / 30)],
  ] as const;

  const report = { target, transport, startedAt: new Date(t0).toISOString(), durationMin: Math.round((Date.now() - t0) / 60_000), pubs, events, retest, haiku, twins, projection, gates };
  writeFileSync(out, JSON.stringify(report, null, 2));

  // ---- Markdown ----
  const md: string[] = [];
  const line = (s = '') => md.push(s);
  line(`# Vergleichslauf ${new Date(t0).toISOString().slice(0, 10)} (${target}, ${transport})`);
  line();
  line(`Dauer ${report.durationMin} min · Kosten Pubs ${pubs?.costUsd ?? 0} USD, Events ${events?.costUsd ?? 0} USD, Retest ${r4(retestRun?.counts.costUsd ?? 0)} USD`);
  line();
  line('| Schwelle | hält | Wert |');
  line('|---|---|---|');
  for (const [name, ok, value] of gates) line(`| ${name} | ${ok === null ? '–' : ok ? 'ja' : '**nein**'} | ${value ?? ''} |`);
  line();
  for (const [label, e] of [['Publikationen', pubs], ['Events', events]] as const) {
    if (!e) continue;
    line(`## ${label} (n=${e.n}${e.notScored ? `, ${e.notScored} ohne Bewertung` : ''}, ${e.status})`);
    line(`Bias ${e.bias} · mittlere |Δ| ${e.meanAbs} · Median |Δ| ${e.medianAbs} · max |Δ| ${e.maxAbs} · Spearman ${e.spearman}`);
    line(`Dimensionen: ${Object.entries(e.dims).map(([d, v]) => `${d} ${v.bias} (|Δ| ${v.meanAbs})`).join(' · ')}`);
    line(`Histogramm Δ: ${Object.entries(e.histogram).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
    line(`Audit alt: ${JSON.stringify(e.auditOld)} · neu: ${JSON.stringify(e.auditNew)}`);
    line(`Lektorat-Änderungsrate: ${JSON.stringify(e.lektoratChangeRate)} · Kosten ${e.costUsd} USD (Bewertung ${e.scoringCostUsd}, Rest ${e.restCostUsd}) · ${e.durationMin} min`);
    line();
  }
  if (retest) line(`Test-Retest (n=${retest.n}): mittlere |Δ| ${retest.meanAbs}, Median ${retest.medianAbs}`);
  line(`Haiku: 1. Versuch ${haiku.firstTryRate}, final ${haiku.finalRate}, 3 Wähler einverstanden ${haiku.votersAgree}, Wortgleichheit ${haiku.wordAgreement}`);
  for (const m of haiku.wordMismatches) line(`- Wort „${m.word}“: App ${m.app}, Wähler ${m.voters}`);
  line(`Hochrechnung: ${projection.inflowPerMonth.pubs} Pubs + ${projection.inflowPerMonth.events} Events im Monat → ${projection.usdPerMonth} USD/Monat`);
  line();
  line('## Sprachprobe (In-Chat links, Kern rechts)');
  for (const [label, e, k] of [['Publikation', pubs, 10], ['Event', events, 5]] as const) {
    for (const p of sample(e?.pairs ?? [], k)) {
      line();
      line(`### ${label}: ${p.title} (${p.id.slice(0, 8)}) · ${p.old.score} → ${p.new.score}`);
      for (const f of ['pitch_suggestion', 'suggested_angle', 'reasoning'] as const) {
        line(`- **${f} alt:** ${p.old[f]}`);
        line(`- **${f} neu:** ${p.new[f]}`);
      }
      if (label === 'Publikation') line(`- **haiku:** ${p.old.haiku ?? '–'} → ${p.new.haiku ?? '–'}`);
    }
  }
  const mdFile = out.replace(/\.json$/, '') + '.md';
  writeFileSync(mdFile, md.join('\n'));
  console.log(md.slice(0, 20).join('\n'));
  console.log(`\n[scoring-compare] Bericht: ${out} · ${mdFile}`);
  return 0;
}

main()
  .then((code) => flushAndExit(code))
  .catch((err: unknown) => {
    console.error('[scoring-compare] failed:', err);
    captureScriptError(err);
    void flushAndExit(1);
  });
