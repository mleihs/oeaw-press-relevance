#!/usr/bin/env tsx
// Bewertungskern auf der Kommandozeile (lib/server/scoring/run.ts): derselbe
// Ablauf wie Nacht und Bewerten-Knopf, mit Anthropic, Opus und Effort max,
// Haiku-Prüfung, Lektorat, Journal und Kostendeckel. Wie die Nacht über die
// Message Batches API (halber Preis, Minuten Wartezeit je Runde); `--direct`
// ruft sofort und zum vollen Preis. Ersetzt scripts/analyze-events.ts (lief
// seit dem Umzug auf Anthropic nicht mehr).
//
//   npm run scoring-run -- --entity=beides --limit=3 --dry-run     # bewertet, schreibt nichts
//   npm run scoring-run -- --entity=pubs --limit=3                 # schreibt lokal, mit Journal
//   npm run scoring-run -- --target=prod --yes --entity=events     # schreibt auf Prod
//   npm run scoring-run -- --target=prod --report-latest           # Nachkontrolle: letzte Läufe
//
// Flags:
//   --target=local|prod   Ziel-DB (Default local; prod über scripts/lib/db.mjs, Tunnel per PROD_DB_TUNNEL=1)
//   --entity=pubs|events|beides   (Default beides)
//   --limit=N             Obergrenze je Entität (Default SCORING_DEFAULTS.limit)
//   --cost-cap=USD        Kostendeckel des Laufs (Default SCORING_DEFAULTS.costCapUsd)
//   --dry-run             bewerten ohne zu schreiben: kein Journal, kein Lock (die Modellaufrufe kosten trotzdem)
//   --direct              direkt statt über die Batch-API: sofort, aber zum vollen Preis
//   --force               auch bereits Bewertetes neu bewerten und überschreiben
//   --ids=a,b,c           genau diese Einträge (nur mit einer Entität)
//   --rescore-tag=TAG     eine Kohorte neu bewerten (llm_model = TAG, impliziert --force)
//   --since=YYYY-MM-DD    nur Einträge, die seitdem geändert (Pubs) bzw. bewertet (Events) wurden
//   --out=DATEI           Ergebnis samt Texten je Eintrag als JSON schreiben
//   --report-latest       je Entität den letzten Lauf mit verworfenen Haikus und Lektorat-Hinweisen zeigen
//   --yes                 Prod-Rückfrage überspringen

import { writeFileSync } from 'node:fs';
// Gemeinsame Präambel: Flags → .env.local → Sentry → DATABASE_URL-Override.
// Die App-Module danach DYNAMISCH laden: lib/server/db liest DATABASE_URL beim Import.
import { bootstrapScript, captureScriptError, flushAndExit, redactedDatabaseUrl } from './lib/bootstrap';

const { target, isProd, flags, confirmProd } = bootstrapScript('scoring-run');

const flag = (name: string): string | undefined =>
  flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string): boolean => flags.includes(`--${name}`);
const fail = (message: string): never => {
  console.error(`[scoring-run] ${message}`);
  process.exit(1);
};

// Der Kern loggt JSON-Zeilen; im Terminal reichen Warnungen und Fehler.
process.env.LOG_LEVEL ??= 'warn';

const ENTITY_FLAG = { pubs: ['publications'], events: ['events'], beides: ['publications', 'events'] } as const;

function parseNumber(name: string): number | undefined {
  const raw = flag(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) fail(`--${name}=${raw}: erwartet eine positive Zahl.`);
  return n;
}

async function reportLatest(): Promise<void> {
  const { latestRuns } = await import('@/lib/server/scoring/journal');
  const runs = await latestRuns();
  for (const [entity, { latest, running }] of Object.entries(runs)) {
    console.log(`\n== ${entity} ==`);
    if (running) console.log(`läuft seit ${running.startedAt} (${running.trigger}), ${running.scored}/${running.candidates} bewertet`);
    if (!latest) {
      console.log('noch kein abgeschlossener Lauf');
      continue;
    }
    console.log(
      `${latest.status} · ${latest.trigger} · ${latest.startedAt} → ${latest.finishedAt ?? '–'} · ${latest.summary ?? ''}`,
    );
    if (latest.errorClass) console.log(`Fehler: ${latest.errorClass}: ${latest.errorMessage ?? ''}`);
    const report = (latest.report ?? {}) as {
      haiku_rejected?: Array<{ id: string; title: string; attempts: number; last_issue: string }>;
      lektorat_flags?: Array<{ id: string; title: string; field: string; code: string; detail: string }>;
      failed_items?: Array<{ id: string; title: string; reason: string }>;
    };
    if (report.haiku_rejected?.length) {
      console.log('\nVerworfene Haikus (mit `session-pipeline apply --force` nachtragen):');
      console.table(report.haiku_rejected.map((h) => ({ id: h.id, titel: h.title.slice(0, 60), versuche: h.attempts, grund: h.last_issue.slice(0, 80) })));
    }
    if (report.lektorat_flags?.length) {
      console.log('\nLektorat-Hinweise (mit `session-pipeline repitch-apply` nachbessern):');
      console.table(report.lektorat_flags.map((f) => ({ id: f.id, titel: f.title.slice(0, 50), feld: f.field, code: f.code, detail: f.detail.slice(0, 60) })));
    }
    if (report.failed_items?.length) {
      console.log('\nNicht bewertet:');
      console.table(report.failed_items.map((f) => ({ id: f.id, titel: f.title.slice(0, 60), grund: f.reason.slice(0, 80) })));
    }
  }
}

async function main(): Promise<number> {
  console.log(`[scoring-run] target=${target} db=${redactedDatabaseUrl()}`);
  if (has('report-latest')) {
    await reportLatest();
    return 0;
  }

  const entityFlag = flag('entity') ?? 'beides';
  const entities = ENTITY_FLAG[entityFlag as keyof typeof ENTITY_FLAG];
  if (!entities) fail(`--entity=${entityFlag}: erwartet pubs, events oder beides.`);
  const ids = flag('ids')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids?.length && entities.length !== 1) fail('--ids gilt für genau eine Entität (--entity=pubs oder --entity=events).');
  const since = flag('since');
  if (since !== undefined && Number.isNaN(Date.parse(since))) fail(`--since=${since}: kein Datum.`);
  const write = !has('dry-run');
  const limit = parseNumber('limit');

  const { SCORING_DEFAULTS } = await import('@/lib/server/scoring/config');
  const { SCORING_ADAPTERS } = await import('@/lib/server/scoring/adapters');
  const { runScoring } = await import('@/lib/server/scoring/run');
  const { DEFAULT_LLM_MODEL } = await import('@/lib/shared/constants');

  const costCapUsd = parseNumber('cost-cap') ?? SCORING_DEFAULTS.costCapUsd;
  const rescoreTag = flag('rescore-tag');
  const transport = has('direct') ? 'direct' : SCORING_DEFAULTS.transport;
  console.log(
    `[scoring-run] ${entities.join(' + ')} · ${DEFAULT_LLM_MODEL}, Effort max · ${
      transport === 'batch' ? 'Batch-API (halber Preis)' : 'direkt'
    } · Deckel ${costCapUsd} USD · ${write ? '[SCHREIBT]' : '[DRY-RUN]'}${has('force') || rescoreTag ? ' [FORCE]' : ''}${
      rescoreTag ? ` · Kohorte ${rescoreTag}` : ''
    }`,
  );
  if (write) await confirmProd('scoring-run');

  const out = await runScoring(
    {
      entities,
      trigger: 'cli',
      model: DEFAULT_LLM_MODEL,
      write,
      force: has('force'),
      ids,
      rescoreTag,
      since,
      limit: limit === undefined ? undefined : Object.fromEntries(entities.map((e) => [e, limit])),
      batchSize: SCORING_DEFAULTS.batchSize,
      concurrency: SCORING_DEFAULTS.concurrency,
      transport,
      costCapUsd,
      hooks: {
        onCandidates: (p) => console.log(`[scoring-run] ${p.entity}: ${p.total} Kandidaten${p.skipped ? `, ${p.skipped} benannte außerhalb der Gates` : ''}`),
        onBatchStart: (p) =>
          console.log(`[scoring-run]   Batch ${p.batchIndex}/${p.totalBatches} (${p.batch.length}): ${p.batch[0]?.title.slice(0, 70) ?? ''}`),
        onError: (e) => console.warn(`[scoring-run]   Fehler${e.fatal ? ' (fatal)' : ''}: ${e.message}`),
        onChunkWritten: (p) => console.log(`[scoring-run]   Chunk fertig: ${p.written} ${write ? 'geschrieben' : 'bewertet'}`),
      },
    },
    SCORING_ADAPTERS,
  );

  let failed = false;
  for (const [entity, run] of Object.entries(out)) {
    if (!run) continue;
    failed ||= run.status === 'failed';
    console.log(`\n== ${entity}: ${run.status.toUpperCase()} ${run.runId ? `(Journal ${run.runId})` : '(ohne Journal)'} ==`);
    console.log(run.summary);
    if (run.errorClass) console.log(`Fehlerklasse ${run.errorClass}: ${run.errorMessage ?? ''}`);
    console.table(
      run.outcomes.map((o) => ({
        id: o.id.slice(0, 8),
        score: Number(o.score.toFixed(4)),
        haiku: o.haiku ? `ok (${o.haikuAttempts}. Versuch)` : o.haikuAttempts ? 'verworfen' : '–',
        lektorat: o.lektoratFields.join(', ') || '–',
        geschrieben: o.written ? 'ja' : 'nein',
        titel: o.title.slice(0, 50),
      })),
    );
    for (const f of run.report.lektorat_flags) console.log(`  Hinweis ${f.id.slice(0, 8)} ${f.field} [${f.code}] ${f.detail}`);
    for (const f of run.report.failed_items) console.log(`  Nicht bewertet ${f.id.slice(0, 8)}: ${f.reason}`);
  }

  const outFile = flag('out');
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(`\n[scoring-run] Ergebnis geschrieben: ${outFile}`);
  }
  if (isProd && write) console.log('[scoring-run] Prod: Haikus prüfen mit `npm run haiku-audit -- --target=prod --model=anthropic/claude-opus-5.5-auto --strict`.');
  return failed ? 1 : 0;
}

main()
  .then((code) => flushAndExit(code))
  .catch((err: unknown) => {
    console.error('[scoring-run] failed:', err);
    captureScriptError(err);
    void flushAndExit(1);
  });
