/**
 * Smoke test for `lib/server/env.ts`.
 *
 * Pure-function — no DB / no network. Exercises `parseEnv()` against
 * synthetic env inputs to verify the schema, refines (Supabase URL/key
 * pairs, Gate token/password, MeisterTask token/section, MeisterTask
 * label pair) and the empty-string-as-unset normalization.
 *
 * The boot-time `process.exit` branch in `validateEnv()` is verified
 * manually via `npm run dev` with deliberately broken env (see
 * commit body / Architecture Plan Cross-cutting closeout) — exiting
 * from a smoke test would abort the rest of the assertions.
 *
 * Run:
 *   npx tsx scripts/smoke/env/validation.ts
 *
 * Cases:
 *   1  happy-path                       — minimal valid env returns ok=true; defaults applied
 *   2  missing DATABASE_URL
 *   3  missing SUPABASE_URL pair
 *   4  missing SUPABASE_ANON_KEY pair
 *   5  missing SUPABASE_SERVICE_ROLE_KEY
 *   6  missing GATE_TOKEN
 *   6b missing GATE_PASSWORD
 *   7  MEISTERTASK_API_TOKEN without DEFAULT_SECTION_ID
 *   8  MEISTERTASK_HIGH_LABEL_ID without MID
 *   9  MEISTERTASK_MID_LABEL_ID without HIGH
 *  10  Multiple errors aggregated in one pass
 *  11  Legacy NEXT_PUBLIC_* fallback satisfies the pair refine
 *  12  Empty-string disables optional features (no false refine fire)
 *  13  Explicit overrides (LLM_DEFAULT_MODEL, NODE_ENV) win over defaults
 */

import { parseEnv } from '../../../lib/server/env';
import { DEFAULT_LLM_MODEL } from '../../../lib/shared/constants';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    const tail = detail ? ` — ${detail}` : '';
    console.error(`FAIL  ${name}${tail}`);
  }
}

const minimalValid: Record<string, string> = {
  DATABASE_URL: 'postgresql://x:y@h:5432/d',
  SUPABASE_URL: 'http://localhost:54421',
  SUPABASE_ANON_KEY: 'anon-key-stub',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-stub',
  GATE_TOKEN: 'gate-token-stub',
  GATE_PASSWORD: 'gate-password-stub',
};

// 1
{
  const r = parseEnv(minimalValid);
  ok('1 happy-path returns ok=true', r.ok);
  if (r.ok) {
    ok('1 default LLM_DEFAULT_MODEL applied', r.env.LLM_DEFAULT_MODEL === DEFAULT_LLM_MODEL);
    ok('1 default NODE_ENV applied', r.env.NODE_ENV === 'development');
  }
}

// 2
{
  const r = parseEnv({ ...minimalValid, DATABASE_URL: '' });
  ok('2 missing DATABASE_URL → fail', !r.ok);
  if (!r.ok) ok('2 error names DATABASE_URL', r.errors.some((e) => e.startsWith('DATABASE_URL')));
}

// 3
{
  const r = parseEnv({ ...minimalValid, SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '' });
  ok('3 missing SUPABASE_URL pair → fail', !r.ok);
  if (!r.ok) ok('3 error mentions SUPABASE_URL', r.errors.some((e) => e.includes('SUPABASE_URL')));
}

// 4
{
  const r = parseEnv({ ...minimalValid, SUPABASE_ANON_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' });
  ok('4 missing SUPABASE_ANON_KEY pair → fail', !r.ok);
  if (!r.ok) ok('4 error mentions SUPABASE_ANON_KEY', r.errors.some((e) => e.includes('SUPABASE_ANON_KEY')));
}

// 5
{
  const r = parseEnv({ ...minimalValid, SUPABASE_SERVICE_ROLE_KEY: '' });
  ok('5 missing SERVICE_ROLE_KEY → fail', !r.ok);
  if (!r.ok) ok('5 error names SERVICE_ROLE_KEY', r.errors.some((e) => e.includes('SUPABASE_SERVICE_ROLE_KEY')));
}

// 6
{
  const r = parseEnv({ ...minimalValid, GATE_TOKEN: '' });
  ok('6 missing GATE_TOKEN → fail', !r.ok);
  if (!r.ok) ok('6 error names GATE_TOKEN', r.errors.some((e) => e.startsWith('GATE_TOKEN')));
}

// 6b
{
  const r = parseEnv({ ...minimalValid, GATE_PASSWORD: '' });
  ok('6b missing GATE_PASSWORD → fail', !r.ok);
  if (!r.ok) ok('6b error names GATE_PASSWORD', r.errors.some((e) => e.startsWith('GATE_PASSWORD')));
}

// 7
{
  const r = parseEnv({ ...minimalValid, MEISTERTASK_API_TOKEN: 'mt-stub' });
  ok('7 MT token without DEFAULT_SECTION_ID → fail', !r.ok);
  if (!r.ok) ok('7 error names DEFAULT_SECTION_ID', r.errors.some((e) => e.startsWith('MEISTERTASK_DEFAULT_SECTION_ID')));
}

// 8
{
  const r = parseEnv({ ...minimalValid, MEISTERTASK_HIGH_LABEL_ID: '1' });
  ok('8 MT HIGH_LABEL_ID without MID → fail', !r.ok);
  if (!r.ok) ok('8 error names MID_LABEL_ID', r.errors.some((e) => e.startsWith('MEISTERTASK_MID_LABEL_ID')));
}

// 9
{
  const r = parseEnv({ ...minimalValid, MEISTERTASK_MID_LABEL_ID: '2' });
  ok('9 MT MID_LABEL_ID without HIGH → fail', !r.ok);
  if (!r.ok) ok('9 error names HIGH_LABEL_ID', r.errors.some((e) => e.startsWith('MEISTERTASK_HIGH_LABEL_ID')));
}

// 10
{
  const r = parseEnv({
    DATABASE_URL: '',
    SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_ANON_KEY: 'k',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  });
  ok('10 multiple errors → fail', !r.ok);
  if (!r.ok) {
    ok('10 includes DATABASE_URL', r.errors.some((e) => e.startsWith('DATABASE_URL')));
    ok('10 includes SUPABASE_URL', r.errors.some((e) => e.startsWith('SUPABASE_URL')));
    ok('10 includes SERVICE_ROLE_KEY', r.errors.some((e) => e.startsWith('SUPABASE_SERVICE_ROLE_KEY')));
    ok('10 aggregates ≥3 errors in one pass', r.errors.length >= 3, `got ${r.errors.length}: ${r.errors.join(' | ')}`);
  }
}

// 11
{
  const r = parseEnv({
    ...minimalValid,
    SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_URL: 'http://legacy',
    SUPABASE_ANON_KEY: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon',
  });
  ok('11 NEXT_PUBLIC_* legacy fallback → ok', r.ok, r.ok ? '' : r.errors.join(' | '));
}

// 12 — empty-string disable for OPTIONAL features only; GATE_* are
// required now and cannot be empty.
{
  const r = parseEnv({
    ...minimalValid,
    MEISTERTASK_API_TOKEN: '',
    MEISTERTASK_HIGH_LABEL_ID: '',
    MEISTERTASK_MID_LABEL_ID: '',
  });
  ok('12 empty-string disables optional features → ok', r.ok, r.ok ? '' : r.errors.join(' | '));
}

// 13
{
  const r = parseEnv({
    ...minimalValid,
    LLM_DEFAULT_MODEL: 'custom/model',
    NODE_ENV: 'production',
  });
  ok('13 LLM_DEFAULT_MODEL override wins', r.ok && r.env.LLM_DEFAULT_MODEL === 'custom/model');
  ok('13 NODE_ENV override wins', r.ok && r.env.NODE_ENV === 'production');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('Smoke OK');
