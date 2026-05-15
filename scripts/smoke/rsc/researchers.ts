/**
 * Smoke test for the /researchers data path. The list and beeswarm tabs
 * call `top_researchers()` and `researcher_distribution()` SQL functions
 * via /api/researchers/{top,distribution}. The route files are thin
 * parameter parsers — the smoke exercises the SQL functions directly,
 * matching the production query shape.
 *
 *   1. top_researchers happy path (count_high, scope=all)
 *   2. metric=sum_score                       — different shape (numeric value)
 *   3. authorship_scope=lead                  — subset of scope=all
 *   4. include_deceased=false vs true         — deceased flag has effect (or no-op)
 *   5. researcher_distribution happy path     — points array, value range
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/researchers.ts
 */

import { sql } from 'drizzle-orm';
import { db } from '../../../lib/server/db';
import type {
  TopResearcherRow,
  DistributionPoint,
} from '../../../lib/shared/researchers';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const SINCE = '2025-01-01';

async function callTop(opts: {
  metric?: string;
  scope?: 'all' | 'lead';
  includeDeceased?: boolean;
  limit?: number;
} = {}): Promise<TopResearcherRow[]> {
  const metric = opts.metric ?? 'count_high';
  const scope = opts.scope ?? 'all';
  const includeDeceased = opts.includeDeceased ?? false;
  const limit = opts.limit ?? 50;
  return (await db.execute(
    sql`SELECT * FROM top_researchers(
      ${SINCE}::date,
      ${metric},
      ${scope},
      ${sql.param(null as never)}::text[],
      ${false},
      ${includeDeceased},
      ${false},
      ${1}::numeric,
      ${limit}::int,
      ${true},
      ${true}
    )`,
  )) as unknown as TopResearcherRow[];
}

async function callDistribution(): Promise<DistributionPoint[]> {
  return (await db.execute(
    sql`SELECT * FROM researcher_distribution(
      ${SINCE}::date,
      ${'count_high'},
      ${'all'},
      ${sql.param(null as never)}::text[],
      ${false},
      ${false},
      ${false},
      ${1}::numeric,
      ${500}::int,
      ${true},
      ${true}
    )`,
  )) as unknown as DistributionPoint[];
}

async function main() {
  // 1. top_researchers happy path — TopResearcherRow has per-metric columns
  // (count_high / sum_score / avg_score / pubs_total), not a single metric_value.
  const top = await callTop();
  assert(Array.isArray(top), 'top_researchers result not an array');
  for (const row of top) {
    assert(row.person_id, `row missing person_id: ${JSON.stringify(row)}`);
    assert(typeof row.count_high === 'number',
      `count_high not number: ${typeof row.count_high}`);
    assert(typeof row.pubs_total === 'number',
      `pubs_total not number: ${typeof row.pubs_total}`);
  }
  console.log(`  ok: top count_high → ${top.length} researchers`);

  // 2. metric=sum_score — different ranking column, same shape
  const sumScore = await callTop({ metric: 'sum_score' });
  assert(Array.isArray(sumScore), 'sum_score not array');
  for (const row of sumScore) {
    assert(typeof row.sum_score === 'string' || typeof row.sum_score === 'number',
      `sum_score type: ${typeof row.sum_score}`);
  }
  console.log(`  ok: top sum_score → ${sumScore.length} researchers`);

  // 3. scope=lead is subset of scope=all (typically smaller; can equal if every pub is lead-authored)
  const lead = await callTop({ scope: 'lead' });
  assert(lead.length <= top.length,
    `scope=lead has ${lead.length} rows, more than scope=all (${top.length}) — unexpected`);
  console.log(`  ok: scope=lead → ${lead.length} (subset of all=${top.length})`);

  // 4. include_deceased flag toggles set membership (or is a no-op if no deceased researchers ranked)
  const withDeceased = await callTop({ includeDeceased: true });
  assert(withDeceased.length >= top.length,
    `include_deceased=true (${withDeceased.length}) < default (${top.length}) — should be superset`);
  console.log(`  ok: include_deceased → ${withDeceased.length} (>= default ${top.length})`);

  // 5. researcher_distribution happy path
  const points = await callDistribution();
  assert(Array.isArray(points), 'distribution result not array');
  // Postgres numeric → JS string when raw-execute; client-side coercion
  // happens in the route's typed wrapper. Accept either form here.
  for (const p of points) {
    assert(p.person_id, 'distribution point missing person_id');
    const v = typeof p.metric_value === 'string' ? Number(p.metric_value) : p.metric_value;
    assert(Number.isFinite(v), `metric_value not finite: ${p.metric_value}`);
    assert(v >= 0, `negative metric_value: ${v}`);
  }
  console.log(`  ok: distribution → ${points.length} points (all non-negative)`);

  console.log('PASS — researchers SQL-function smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
