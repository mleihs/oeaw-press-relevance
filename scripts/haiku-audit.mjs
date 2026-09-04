#!/usr/bin/env node
// Prüft die gespeicherten Haikus einer Datenbank gegen das Gate.
//
//   node scripts/haiku-audit.mjs --target=prod
//   node scripts/haiku-audit.mjs --target=prod --model=anthropic/claude-opus-5-session
//   node scripts/haiku-audit.mjs --target=local --strict     # Exit 1 bei Verstoessen
//
// Der Nachtlauf und das In-Chat-Apply lassen nichts Kaputtes mehr herein; dieses
// Skript ist fuer den Altbestand da, der vor dem Gate entstanden ist, und als
// Regressionswaechter. `--strict` macht es zum Gate (fuer CI), sonst berichtet es
// nur — der Altbestand wuerde sonst jeden Lauf rot faerben.

import { connectDb } from './lib/db.mjs';
import { checkHaikus } from './lib/haiku-syllables.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const target = flag('target', 'local');
const model = flag('model');
const limit = Number(flag('limit', '25'));
const strict = args.includes('--strict');

const db = await connectDb({ target });
try {
  const params = [];
  let where = "haiku IS NOT NULL AND haiku <> ''";
  if (model) {
    params.push(model);
    where += ` AND llm_model = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT id, title, llm_model, haiku FROM publications WHERE ${where} ORDER BY updated_at DESC`,
    params,
  );
  if (rows.length === 0) {
    console.log(`Keine Haikus in ${target}${model ? ` fuer ${model}` : ''}.`);
    process.exit(0);
  }

  console.log(`Pruefe ${rows.length} Haikus in ${target} …`);
  const results = await checkHaikus(rows.map((r) => r.haiku));

  const perModel = new Map();
  const classes = new Map();
  const offenders = [];
  results.forEach((res, i) => {
    const row = rows[i];
    const m = perModel.get(row.llm_model) ?? { n: 0, ok: 0, struktur: 0, silben: 0, unklar: 0 };
    m.n++;
    if (res.ok) m.ok++;
    else {
      const kinds = new Set(res.issues.map((x) => (x.code === 'unklar' ? 'unklar' : x.kind)));
      if (kinds.has('struktur')) m.struktur++;
      if (kinds.has('silben')) m.silben++;
      if (kinds.has('unklar')) m.unklar++;
      for (const issue of res.issues) classes.set(issue.code, (classes.get(issue.code) ?? 0) + 1);
      offenders.push({ row, res });
    }
    perModel.set(row.llm_model, m);
  });

  console.log('\nProb Modell:');
  for (const [name, m] of perModel) {
    const quote = ((100 * m.ok) / m.n).toFixed(1);
    console.log(
      `  ${String(name).padEnd(36)} n=${String(m.n).padEnd(5)} ok=${String(m.ok).padEnd(5)} (${quote} %)  Struktur=${m.struktur} Silben=${m.silben} unklar=${m.unklar}`,
    );
  }

  console.log('\nVerstoesse nach Art:');
  for (const [code, n] of [...classes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(18)} ${n}`);
  }

  console.log(`\nErste ${Math.min(limit, offenders.length)} von ${offenders.length} beanstandeten:`);
  for (const { row, res } of offenders.slice(0, limit)) {
    console.log(`\n  ${row.id}  ${String(row.title).slice(0, 70)}`);
    console.log(`  ${res.text}`);
    for (const issue of res.issues) console.log(`    ! ${issue.message}`);
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\nGesamt: ${ok}/${results.length} sauber (${((100 * ok) / results.length).toFixed(1)} %).`);
  if (strict && ok < results.length) process.exit(1);
} finally {
  await db.end();
}
