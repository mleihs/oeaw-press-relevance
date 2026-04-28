#!/usr/bin/env node
// Session-based enrichment + scoring pipeline.
//
// Sub-commands:
//   status              Read-only DB summary (enrichment + analysis counts).
//   enrich-free         WebDB-native enrichment (summary_de/en → enriched_abstract).
//                       DRY-RUN by default. Pass --apply to actually UPDATE.
//   candidates [N]      Emit a JSON batch of N pending pubs to stdout, formatted
//                       for the in-session scoring model. Status logs go to stderr.
//   apply <file|->      Read evaluation JSON (file path or "-" for stdin),
//                       validate, optionally UPDATE. DRY-RUN by default.
//
// Default model tag written to publications.llm_model when scored via this
// path: 'anthropic/claude-opus-4.7-session'. Cost = 0 (no external API call).
//
// Env: PG_DATABASE_URL (default postgresql://postgres:postgres@127.0.0.1:54422/postgres)

import pg from 'pg';
import { readFileSync } from 'fs';

const PG_URL = process.env.PG_DATABASE_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

// MUST stay in sync with lib/constants.ts SCORE_WEIGHTS.
const SCORE_WEIGHTS = {
  public_accessibility: 0.20,
  societal_relevance:   0.25,
  novelty_factor:       0.20,
  storytelling_potential: 0.20,
  media_timeliness:     0.15,
};

const SESSION_MODEL_TAG = 'anthropic/claude-opus-4.7-session';
const WEBDB_SOURCE_TAG = 'hebowebdb_summary';

// ITA-Subtree-Exclusion: Pubs die zu ITA oder einer Sub-Unit gehören werden
// per Default aus Scoring + Enrichment ausgeschlossen. ITA-Scores kommen aus
// der Prod-DB (siehe HANDOVER). --include-ita überschreibt das.
const ITA_EXCLUDE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM orgunit_publications op
  WHERE op.publication_id = p.id
    AND op.orgunit_id IN (
      WITH RECURSIVE ita_tree AS (
        SELECT id FROM orgunits WHERE akronym_de = 'ITA'
        UNION ALL
        SELECT o.id FROM orgunits o JOIN ita_tree it ON o.parent_id = it.id
      )
      SELECT id FROM ita_tree
    )
)`;

function itaCondition(includeIta) {
  return includeIta ? '1=1' : ITA_EXCLUDE_CLAUSE;
}
const REQUIRED_EVAL_FIELDS = [
  'id', 'public_accessibility', 'societal_relevance', 'novelty_factor',
  'storytelling_potential', 'media_timeliness',
  'pitch_suggestion', 'target_audience', 'suggested_angle', 'reasoning',
];
const NUM_DIMS = [
  'public_accessibility', 'societal_relevance', 'novelty_factor',
  'storytelling_potential', 'media_timeliness',
];

function calculatePressScore(dims) {
  let s = 0;
  for (const [k, w] of Object.entries(SCORE_WEIGHTS)) {
    if (typeof dims[k] === 'number') s += dims[k] * w;
  }
  return Math.round(s * 10000) / 10000;
}

const log = (msg) => process.stderr.write(msg + '\n');
const out = (msg) => process.stdout.write(msg + '\n');

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { args, positional };
}

async function withClient(fn) {
  const client = new pg.Client({ connectionString: PG_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function cmdStatus() {
  await withClient(async (c) => {
    const r1 = await c.query(`
      SELECT enrichment_status, count(*)::int AS count
      FROM publications WHERE archived = false
      GROUP BY enrichment_status ORDER BY count DESC
    `);
    const r2 = await c.query(`
      SELECT analysis_status, count(*)::int AS count
      FROM publications WHERE archived = false
      GROUP BY analysis_status ORDER BY count DESC
    `);
    // Pool counts berücksichtigen die ITA-Exclusion (Default-Workflow).
    const r3 = await c.query(`
      SELECT
        count(*) FILTER (WHERE p.summary_de IS NOT NULL)                         AS with_de,
        count(*) FILTER (WHERE p.summary_en IS NOT NULL)                         AS with_en,
        count(*) FILTER (WHERE p.press_score IS NOT NULL)                        AS with_score,
        count(*) FILTER (WHERE p.llm_model = $1)                                 AS by_session,
        -- WITH ITA (volle Pools)
        count(*) FILTER (WHERE p.enrichment_status IN ('enriched', 'partial') AND p.analysis_status = 'pending') AS pool_a_all,
        count(*) FILTER (WHERE p.enrichment_status = 'pending')                                                  AS pool_b_all,
        count(*) FILTER (WHERE p.enrichment_status = 'pending' AND p.doi IS NOT NULL)                            AS pool_b_doi_all,
        -- WITHOUT ITA (Default-Scope für Scoring)
        count(*) FILTER (WHERE p.enrichment_status IN ('enriched', 'partial') AND p.analysis_status = 'pending' AND ${ITA_EXCLUDE_CLAUSE}) AS pool_a_no_ita,
        count(*) FILTER (WHERE p.enrichment_status = 'pending' AND ${ITA_EXCLUDE_CLAUSE})                                                  AS pool_b_no_ita,
        count(*) FILTER (WHERE p.enrichment_status = 'pending' AND p.doi IS NOT NULL AND ${ITA_EXCLUDE_CLAUSE})                            AS pool_b_doi_no_ita
      FROM publications p WHERE p.archived = false
    `, [SESSION_MODEL_TAG]);

    log('=== Enrichment status ===');
    for (const row of r1.rows) log(`  ${row.enrichment_status.padEnd(10)} ${row.count}`);
    log('=== Analysis status ===');
    for (const row of r2.rows) log(`  ${row.analysis_status.padEnd(10)} ${row.count}`);
    log('=== WebDB / scoring summary ===');
    log(`  Pubs mit summary_de:                       ${r3.rows[0].with_de}`);
    log(`  Pubs mit summary_en:                       ${r3.rows[0].with_en}`);
    log(`  Pubs mit press_score:                      ${r3.rows[0].with_score}`);
    log(`  Davon via Session-Modell:                  ${r3.rows[0].by_session}`);

    const poolA = parseInt(r3.rows[0].pool_a, 10);
    const poolB = parseInt(r3.rows[0].pool_b, 10);
    const poolC = parseInt(r3.rows[0].pool_c, 10);
    const poolBwithDoi = parseInt(r3.rows[0].pool_b_with_doi, 10);

    const poolAall   = parseInt(r3.rows[0].pool_a_all, 10);
    const poolBall   = parseInt(r3.rows[0].pool_b_all, 10);
    const poolBdoi   = parseInt(r3.rows[0].pool_b_doi_all, 10);
    const poolAnoIta = parseInt(r3.rows[0].pool_a_no_ita, 10);
    const poolBnoIta = parseInt(r3.rows[0].pool_b_no_ita, 10);
    const poolBdoiNoIta = parseInt(r3.rows[0].pool_b_doi_no_ita, 10);
    const itaInPoolA = poolAall - poolAnoIta;

    log('=== Workflow-Pools (Default-Scope: OHNE ITA) ===');
    log(`  Pool A (scoring-ready, ohne ITA):     ${poolAnoIta}    [mit ITA: ${poolAall}, ITA-Anteil: ${itaInPoolA}]`);
    log(`  Pool B (enrichment-pending, ohne ITA): ${poolBnoIta}    [mit ITA: ${poolBall}]`);
    log(`     ↳ davon mit DOI (API-Chance):       ${poolBdoiNoIta}    [mit ITA: ${poolBdoi}]`);
    log(`  ITA-Subtree wird per Default ausgeschlossen — Scores kommen aus Prod-Sync.`);

    if (poolAnoIta > 0) {
      log('=== Session-Kapazitätsprognose (Pool A no ITA → Scoring) ===');
      log(`  Bei 50 Pubs/Session:  ~${Math.ceil(poolAnoIta / 50)} Sessions`);
      log(`  Bei 100 Pubs/Session: ~${Math.ceil(poolAnoIta / 100)} Sessions`);
    }
    if (poolBnoIta > 0) {
      log('=== API-Enrichment-Prognose (Pool B no ITA → Pool A no ITA) ===');
      const seconds = poolBdoiNoIta * 15;
      log(`  Geschätzte Dauer (DOI-Pubs × 15s):  ~${Math.round(seconds / 3600)}h`);
      log(`  Anstoßen mit: node scripts/session-pipeline.mjs enrich-api --apply`);
    }

    log(`  Session-Modell-Tag: ${SESSION_MODEL_TAG}`);
  });
}

async function cmdEnrichFree(opts) {
  const apply = opts.apply === true || opts.apply === 'true';
  await withClient(async (c) => {
    const cnt = await c.query(`
      SELECT count(*)::int AS n FROM publications
      WHERE archived = false
        AND enrichment_status = 'pending'
        AND (summary_de IS NOT NULL OR summary_en IS NOT NULL)
    `);
    const n = cnt.rows[0].n;
    log(`Free WebDB-Enrichment: ${n} Publikationen kandidieren (pending + summary_de/en).`);
    if (n === 0) return;
    if (!apply) {
      log('[DRY-RUN] keine UPDATEs ausgeführt. Mit --apply tatsächlich schreiben.');
      return;
    }
    const r = await c.query(`
      UPDATE publications SET
        enrichment_status = 'enriched',
        enriched_abstract = COALESCE(enriched_abstract, summary_de, summary_en),
        enriched_source = CASE
          WHEN enriched_source IS NULL OR enriched_source = '' THEN $1
          WHEN position($1 in enriched_source) > 0 THEN enriched_source
          ELSE $1 || '+' || enriched_source
        END,
        word_count = CASE
          WHEN word_count > 0 THEN word_count
          ELSE COALESCE(
            ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(COALESCE(summary_de, summary_en, '')), ' '), 1),
            0
          )
        END,
        updated_at = NOW()
      WHERE archived = false
        AND enrichment_status = 'pending'
        AND (summary_de IS NOT NULL OR summary_en IS NOT NULL)
    `, [WEBDB_SOURCE_TAG]);
    log(`Updated ${r.rowCount} Publikationen → enrichment_status='enriched'.`);
  });
}

async function cmdCandidates(opts, positional) {
  const limit = parseInt(opts.limit ?? positional[0] ?? '10', 10);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    log('limit muss zwischen 1 und 200 liegen.');
    process.exit(1);
  }
  const onlySummaryDe = opts['only-summary-de'] === true || opts['only-summary-de'] === 'true';
  const requireMahighlight = opts['mahighlight'] === true || opts['mahighlight'] === 'true';
  const requirePopSci = opts['popular-science'] === true || opts['popular-science'] === 'true';
  const includeIta = opts['include-ita'] === true || opts['include-ita'] === 'true';
  const fromDate = opts['from'] || null;
  const toDate = opts['to'] || null;

  // Default: nur Pubs mit tatsächlich vorhandener Inhalts-Substanz.
  // Ein Status 'enriched' allein reicht nicht — manche Pubs haben den Loop ohne
  // Quellen-Treffer durchlaufen und haben leere Abstract-Felder. Solche Pubs
  // dürfen nicht bewertet werden, sonst entstehen aus Titeln freie Fabrikationen.
  const MIN_CONTENT_LEN = 120; // Mindestlänge in Zeichen für „bewertbar".
  const conditions = [
    'p.archived = false',
    "p.analysis_status = 'pending'",
    "p.enrichment_status IN ('enriched', 'partial')",
    `GREATEST(
      length(COALESCE(p.summary_de,'')),
      length(COALESCE(p.summary_en,'')),
      length(COALESCE(p.enriched_abstract,'')),
      length(COALESCE(p.abstract,''))
    ) >= ${MIN_CONTENT_LEN}`,
  ];
  if (!includeIta) {
    conditions.push(ITA_EXCLUDE_CLAUSE);
  }
  const params = [];
  if (onlySummaryDe) {
    conditions.push('p.summary_de IS NOT NULL');
  }
  if (requirePopSci) {
    conditions.push('p.popular_science = true');
  }
  if (fromDate) {
    params.push(fromDate);
    conditions.push(`p.published_at >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    conditions.push(`p.published_at <= $${params.length}`);
  }
  if (requireMahighlight) {
    conditions.push(`EXISTS (
      SELECT 1 FROM person_publications pp
      WHERE pp.publication_id = p.id AND pp.mahighlight = true
    )`);
  }

  await withClient(async (c) => {
    const sql = `
      SELECT
        p.id,
        p.webdb_uid,
        p.title,
        p.original_title,
        p.lead_author,
        p.authors,
        p.institute,
        p.published_at::text AS published_at,
        p.peer_reviewed,
        p.popular_science,
        p.summary_de,
        p.summary_en,
        p.enriched_abstract,
        p.abstract,
        p.enriched_keywords,
        EXISTS (
          SELECT 1 FROM person_publications pp
          WHERE pp.publication_id = p.id AND pp.mahighlight = true
        ) AS is_mahighlight,
        ARRAY(
          SELECT DISTINCT ou.akronym_de
          FROM orgunit_publications op
          JOIN orgunits ou ON ou.id = op.orgunit_id
          WHERE op.publication_id = p.id AND ou.akronym_de IS NOT NULL
        ) AS institute_akronyms
      FROM publications p
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        ${requireMahighlight ? '' : 'p.popular_science DESC,'}
        p.published_at DESC NULLS LAST,
        p.webdb_uid
      LIMIT ${limit}
    `;
    const r = await c.query(sql, params);

    const pubs = r.rows.map((row) => {
      let contentSource = null;
      let content = null;
      if (row.summary_de?.trim()) { contentSource = 'summary_de'; content = row.summary_de.trim(); }
      else if (row.summary_en?.trim()) { contentSource = 'summary_en'; content = row.summary_en.trim(); }
      else if (row.enriched_abstract?.trim()) { contentSource = 'enriched_abstract'; content = row.enriched_abstract.trim(); }
      else if (row.abstract?.trim()) { contentSource = 'abstract'; content = row.abstract.trim(); }

      if (content) {
        const words = content.split(/\s+/);
        if (words.length > 500) content = words.slice(0, 500).join(' ') + '…';
      }

      let coAuthors = [];
      if (row.authors && row.lead_author) {
        const all = row.authors.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        const leadFirst = row.lead_author.split(',')[0].trim();
        coAuthors = all.filter((a) => !a.includes(leadFirst)).slice(0, 2);
      } else if (row.authors) {
        coAuthors = row.authors.split(/[;,]/).slice(0, 3).map((s) => s.trim()).filter(Boolean);
      }

      return {
        id: row.id,
        webdb_uid: row.webdb_uid,
        title: row.title,
        original_title: row.original_title && row.original_title !== row.title ? row.original_title : null,
        lead_author: row.lead_author,
        co_authors: coAuthors,
        institute: row.institute,
        institute_akronyms: row.institute_akronyms || [],
        published_at: row.published_at,
        peer_reviewed: row.peer_reviewed,
        popular_science: row.popular_science,
        is_mahighlight: row.is_mahighlight,
        enriched_keywords: row.enriched_keywords,
        content_source: contentSource,
        content,
      };
    });

    out(JSON.stringify({
      model: SESSION_MODEL_TAG,
      weights: SCORE_WEIGHTS,
      count: pubs.length,
      filters: {
        only_summary_de: onlySummaryDe,
        require_mahighlight: requireMahighlight,
        require_popular_science: requirePopSci,
        include_ita: includeIta,
        from: fromDate,
        to: toDate,
      },
      publications: pubs,
    }, null, 2));
  });
}

async function cmdEnrichApi(opts) {
  const apply = opts.apply === true || opts.apply === 'true';
  const perBatch = parseInt(opts['per-batch'] || '15', 10);
  const maxBatches = opts['max-batches'] ? parseInt(opts['max-batches'], 10) : Infinity;
  const includeNoDoi = opts['include-no-doi'] === true || opts['include-no-doi'] === 'true';
  const includePartial = opts['include-partial'] === true || opts['include-partial'] === 'true';
  const apiUrl = opts['api-url'] || 'http://localhost:3000/api/enrichment/batch';

  if (!apply) {
    log(`[DRY-RUN] enrich-api würde gegen ${apiUrl} loopen:`);
    log(`  per-batch=${perBatch}, max-batches=${maxBatches === Infinity ? '∞ (bis Pool leer)' : maxBatches}`);
    log(`  include-no-doi=${includeNoDoi}`);
    log(`  include-partial=${includePartial}`);
    log('Mit --apply den tatsächlichen Loop starten.');
    return;
  }

  try {
    const ping = await fetch('http://localhost:3000/', { signal: AbortSignal.timeout(5000) });
    if (!ping.ok) throw new Error(`Status ${ping.status}`);
  } catch (e) {
    log(`Server nicht erreichbar (${e.message}). Bitte 'npm run dev' starten.`);
    process.exit(1);
  }
  const includeIta = opts['include-ita'] === true || opts['include-ita'] === 'true';
  log(`Server OK. Starte Enrichment-Loop (per-batch=${perBatch}, include-no-doi=${includeNoDoi}, include-partial=${includePartial}, include-ita=${includeIta}).`);

  const statusInList = includePartial ? `('pending', 'partial')` : `('pending')`;
  // ITA-Filter wird im pendingCnt vorab gefiltert. Die API-Route selbst kennt
  // ITA nicht — wenn includeIta=false, müsste theoretisch die Route auch filtern.
  // Pragmatisch: API-Route nimmt einfach die nächsten N pending Pubs (egal ob ITA),
  // unsere ITA-Pubs würden auch enriched. Das ist verschwendete API-Zeit aber kein
  // Schaden. Echtes Filtern wäre eine Route-Änderung; für jetzt nur die pendingCnt
  // ohne ITA, sodass die Loop-Beendigung sauber ist.
  let batchN = 0;
  let totalProcessed = 0;
  let totalSuccessful = 0;
  while (batchN < maxBatches) {
    const pendingCnt = await withClient(async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM publications p
         WHERE p.archived = false AND p.enrichment_status IN ${statusInList}
         ${includeNoDoi ? '' : 'AND p.doi IS NOT NULL'}
         AND ${itaCondition(includeIta)}`,
      );
      return r.rows[0].n;
    });
    if (pendingCnt === 0) {
      log(`Queue leer (${includeNoDoi ? 'inkl. ohne DOI' : 'nur DOI-Pubs'}, status=${statusInList}) — fertig nach ${batchN} Batches. Total: ${totalProcessed} processed, ${totalSuccessful} successful.`);
      break;
    }
    batchN++;
    log(`[Batch ${batchN}] ${pendingCnt} pending; POST limit=${perBatch}…`);

    const t0 = Date.now();
    let resp;
    try {
      resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: perBatch,
          include_no_doi: includeNoDoi,
          include_partial: includePartial,
        }),
        signal: AbortSignal.timeout(360_000),
      });
    } catch (e) {
      log(`  Netzwerk-Fehler: ${e.message}. Pause 5s, dann nächster Batch.`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!resp.ok) {
      const body = await resp.text();
      log(`  API-Fehler ${resp.status}: ${body.slice(0, 200)}. Abbruch.`);
      break;
    }

    const reader = resp.body?.getReader();
    let lastComplete = null;
    if (reader) {
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Process line-by-line; SSE events arrive as `event: NAME\ndata: JSON\n\n`
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const ev of events) {
          const dataLine = ev.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            if (data.processed !== undefined && data.successful !== undefined && data.failed !== undefined) {
              lastComplete = data;
            }
          } catch { /* ignore non-JSON */ }
        }
      }
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (lastComplete) {
      totalProcessed += lastComplete.processed || 0;
      totalSuccessful += lastComplete.successful || 0;
      log(`  ✓ ${lastComplete.processed} processed, ${lastComplete.successful} successful, ${lastComplete.failed} failed, ${lastComplete.partial || 0} partial (${dt}s)`);
    } else {
      log(`  ✓ batch done (${dt}s, kein complete-event empfangen)`);
    }
    // small pause to be friendly to external APIs
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Pool-A-Augmentation: Pool A enriched Pubs mit DOI nochmal durch API-Cascade
// schicken, um Keywords/Journal/etc. additiv zu ergänzen. enriched_abstract
// (= summary_de) bleibt durch Merge-Logic geschützt.
async function cmdEnrichAugment(opts) {
  const apply = opts.apply === true || opts.apply === 'true';
  const includeIta = opts['include-ita'] === true || opts['include-ita'] === 'true';
  const perBatch = parseInt(opts['per-batch'] || '15', 10);
  const maxBatches = opts['max-batches'] ? parseInt(opts['max-batches'], 10) : Infinity;
  const apiUrl = opts['api-url'] || 'http://localhost:3000/api/enrichment/batch';

  // Augment-Ziel: Pool-A-/Phase-0-Pubs mit DOI, die noch keine API-Keywords haben.
  // Status-unabhängig: 'enriched' und 'partial' sind beide gleichwertig „mit Substanz".
  // Der frühere Hack (UPDATE auf partial + include_partial-Loop) ist ersetzt durch
  // gezielte ID-basierte Verarbeitung — keine Re-Run-Schleife auf jüngste Pubs.
  const candidatesQuery = `
    SELECT id::text FROM publications p
    WHERE p.archived = false
      AND p.enrichment_status IN ('enriched', 'partial')
      AND p.analysis_status = 'pending'
      AND p.doi IS NOT NULL
      AND p.enriched_keywords IS NULL
      AND ${itaCondition(includeIta)}
    ORDER BY p.published_at DESC NULLS LAST
  `;

  if (!apply) {
    await withClient(async (c) => {
      const r = await c.query(candidatesQuery);
      log(`[DRY-RUN] enrich-augment würde:`);
      log(`  - ${r.rows.length} Pool-A-Pubs (mit DOI, ohne API-Keywords) per ID an die Cascade schicken`);
      log(`  - per-batch=${perBatch}, max-batches=${maxBatches === Infinity ? '∞' : maxBatches}`);
      log(`  - enriched_abstract (= summary_de) wird durch Merge-Logic geschützt`);
      log(`  - finalStatus wird automatisch von der Cascade gesetzt (enriched/partial/failed)`);
      log(`Mit --apply ausführen.`);
    });
    return;
  }

  try {
    const ping = await fetch('http://localhost:3000/', { signal: AbortSignal.timeout(5000) });
    if (!ping.ok) throw new Error(`Status ${ping.status}`);
  } catch (e) {
    log(`Server nicht erreichbar (${e.message}). Bitte 'npm run dev' starten.`);
    process.exit(1);
  }

  // IDs einmal sammeln. Pubs, die im laufenden Augment Erfolg hatten, fallen aus
  // der Liste raus, weil enriched_keywords IS NULL nach Erfolg false wird — aber
  // wir holen nur einmal vor Beginn, damit Mehrfachverarbeitung ausgeschlossen ist.
  const ids = await withClient(async (c) => {
    const r = await c.query(candidatesQuery);
    return r.rows.map((row) => row.id);
  });

  if (ids.length === 0) {
    log(`Augment: keine Kandidaten — fertig.`);
    return;
  }
  log(`Augment: ${ids.length} Pool-A-Pubs identifiziert. Starte ID-basierten Loop.`);

  let batchN = 0;
  let totalProcessed = 0;
  let totalSuccessful = 0;
  let totalKwHits = 0;

  for (let offset = 0; offset < ids.length && batchN < maxBatches; offset += perBatch) {
    batchN++;
    const slice = ids.slice(offset, offset + perBatch);
    log(`[Batch ${batchN}] ${ids.length - offset} verbleibend; POST ids=[${slice.length}]…`);

    const t0 = Date.now();
    let resp;
    try {
      resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: slice, limit: slice.length }),
        signal: AbortSignal.timeout(360_000),
      });
    } catch (e) {
      log(`  Netzwerk-Fehler: ${e.message}. Pause 5s, dann nächster Batch.`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text();
      log(`  API-Fehler ${resp.status}: ${t.slice(0, 200)}. Abbruch.`);
      break;
    }

    const reader = resp.body?.getReader();
    let lastComplete = null;
    if (reader) {
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const ev of events) {
          const dataLine = ev.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            if (data.processed !== undefined && data.successful !== undefined && data.failed !== undefined) {
              lastComplete = data;
            }
          } catch { /* ignore */ }
        }
      }
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (lastComplete) {
      totalProcessed += lastComplete.processed || 0;
      totalSuccessful += lastComplete.successful || 0;
      log(`  ✓ ${lastComplete.processed} processed, ${lastComplete.successful} mit-Abstract-Treffer, ${lastComplete.partial || 0} partial, ${lastComplete.failed || 0} failed (${dt}s)`);
    } else {
      log(`  ✓ batch done (${dt}s, kein complete-event)`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Verifizieren wieviele dieser IDs danach Keywords haben
  await withClient(async (c) => {
    const r = await c.query(
      `SELECT count(*)::int AS n FROM publications WHERE id = ANY($1::uuid[]) AND enriched_keywords IS NOT NULL`,
      [ids],
    );
    totalKwHits = r.rows[0].n;
  });

  log(`Augment fertig: ${batchN} Batches, ${totalProcessed} processed, davon ${totalKwHits} mit Keywords-Hit.`);
}

async function cmdApply(opts, positional) {
  let raw;
  if (positional[0] && positional[0] !== '-') {
    raw = readFileSync(positional[0], 'utf8');
  } else {
    raw = readFileSync(0, 'utf8');
  }
  const data = JSON.parse(raw);
  const evals = Array.isArray(data) ? data : (data.evaluations || []);
  if (!Array.isArray(evals) || evals.length === 0) {
    log('Keine evaluations gefunden in Input.');
    process.exit(1);
  }

  // Sanitize textual fields: strip HTML, normalize ASCII quotes that often cause JSON breakage,
  // collapse whitespace. Applied to all string-valued fields in each evaluation.
  const TEXT_FIELDS = ['pitch_suggestion', 'target_audience', 'suggested_angle', 'reasoning', 'haiku'];
  function sanitizeText(s) {
    if (typeof s !== 'string') return s;
    let t = s
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return t;
  }
  for (const e of evals) {
    for (const key of TEXT_FIELDS) {
      if (key in e) e[key] = sanitizeText(e[key]);
    }
  }

  // Validate
  for (const e of evals) {
    for (const key of REQUIRED_EVAL_FIELDS) {
      if (!(key in e)) {
        log(`Evaluation für id=${e.id || '?'} fehlt Feld: ${key}`);
        process.exit(1);
      }
    }
    for (const dim of NUM_DIMS) {
      const v = e[dim];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        log(`Evaluation für id=${e.id} hat ungültigen ${dim}=${v} (erwartet number 0..1)`);
        process.exit(1);
      }
    }
    // Reasoning style guard: forbid variable-name leaks
    const reasoning = String(e.reasoning || '');
    const leaks = /(popular_science|peer_reviewed|mahighlight)\s*=/.exec(reasoning);
    if (leaks) {
      log(`! Evaluation für id=${e.id} enthält Variablennamen im Reasoning: "${leaks[0]}"`);
      process.exit(1);
    }
  }

  const apply = opts.apply === true || opts.apply === 'true';
  const force = opts.force === true || opts.force === 'true';
  log(`${evals.length} Evaluations geparst und validiert. ${apply ? '[APPLY]' : '[DRY-RUN]'}${force ? ' [FORCE]' : ''}`);

  if (!apply) {
    log('Vorschau (max 3):');
    for (const e of evals.slice(0, 3)) {
      const score = calculatePressScore(e);
      log(`  id=${String(e.id).slice(0, 8)}…  press_score=${score}  pitch="${String(e.pitch_suggestion).slice(0, 80)}…"`);
    }
    log('Mit --apply tatsächlich in DB schreiben.');
    log('Mit --force auch bereits analyzed Pubs überschreiben (default: skip).');
    return;
  }

  const MIN_CONTENT_LEN = 120; // mirrors candidates threshold

  await withClient(async (c) => {
    // Pre-check: which IDs already analyzed? Default behaviour: skip them.
    // Pre-check 2: every pub being scored MUST have actual content substance —
    // otherwise the evaluation is by definition fabricated from the title.
    const ids = evals.map((e) => e.id);
    const existing = await c.query(
      `SELECT id, analysis_status,
        GREATEST(
          length(COALESCE(summary_de,'')),
          length(COALESCE(summary_en,'')),
          length(COALESCE(enriched_abstract,'')),
          length(COALESCE(abstract,''))
        ) AS content_len
       FROM publications WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const statusById = new Map(existing.rows.map((r) => [r.id, r.analysis_status]));
    const contentLenById = new Map(existing.rows.map((r) => [r.id, r.content_len]));
    const missing = ids.filter((id) => !statusById.has(id));
    const alreadyAnalyzed = ids.filter((id) => statusById.get(id) === 'analyzed');
    const tooThin = ids.filter((id) => statusById.has(id) && contentLenById.get(id) < MIN_CONTENT_LEN);

    if (missing.length > 0) {
      log(`! ${missing.length} IDs existieren nicht in DB (werden übersprungen).`);
      for (const id of missing.slice(0, 5)) log(`    fehlt: ${id}`);
    }
    if (alreadyAnalyzed.length > 0 && !force) {
      log(`! ${alreadyAnalyzed.length} Pubs sind bereits analyzed (werden übersprungen — mit --force überschreiben).`);
      for (const id of alreadyAnalyzed.slice(0, 5)) log(`    skip:  ${id}`);
    }
    if (tooThin.length > 0) {
      log(`! ${tooThin.length} Pubs haben weniger als ${MIN_CONTENT_LEN} Zeichen Inhalt — werden NICHT bewertet.`);
      log(`  Eine Bewertung ohne Substanz ist Fabrikation. Diese Pubs erst durch enrich-augment laufen lassen.`);
      for (const id of tooThin.slice(0, 5)) log(`    skip (no content): ${id}`);
      process.exit(2);
    }

    let updated = 0;
    let skipped = 0;
    for (const e of evals) {
      const status = statusById.get(e.id);
      if (!status) { skipped++; continue; }
      if (status === 'analyzed' && !force) { skipped++; continue; }

      const score = calculatePressScore(e);
      const r = await c.query(`
        UPDATE publications SET
          analysis_status = 'analyzed',
          press_score = $1,
          public_accessibility = $2,
          societal_relevance = $3,
          novelty_factor = $4,
          storytelling_potential = $5,
          media_timeliness = $6,
          pitch_suggestion = $7,
          target_audience = $8,
          suggested_angle = $9,
          reasoning = $10,
          haiku = $11,
          llm_model = $12,
          analysis_cost = 0,
          updated_at = NOW()
        WHERE id = $13
      `, [
        score,
        e.public_accessibility,
        e.societal_relevance,
        e.novelty_factor,
        e.storytelling_potential,
        e.media_timeliness,
        String(e.pitch_suggestion),
        String(e.target_audience),
        String(e.suggested_angle),
        String(e.reasoning),
        e.haiku ? String(e.haiku) : null,
        SESSION_MODEL_TAG,
        e.id,
      ]);
      if (r.rowCount > 0) updated++;
      else skipped++;
    }
    log(`Updated ${updated}/${evals.length} Publikationen.${skipped ? ` (${skipped} übersprungen)` : ''}`);
  });
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    log(`Usage: node scripts/session-pipeline.mjs <command> [options]

Commands:
  status                                Enrichment + Analysis-Status, Pool A/B/C
  enrich-free [--apply]                 WebDB-native Enrichment (summary_de/en → enriched)
                                        Default dry-run; --apply schreibt UPDATE.
  enrich-api [--apply] [--per-batch N]  API-Cascade-Loop (CrossRef → OpenAlex → ...)
             [--max-batches N]          via POST gegen laufende /api/enrichment/batch.
             [--include-no-doi]         Default per-batch=15. Server muss laufen.
             [--include-partial]        Auch 'partial' Pubs durchschicken.
  enrich-augment [--apply]              Pool-A-mit-DOI durch API-Cascade (additiv).
                                        enriched_abstract (summary_de) bleibt geschützt.
                                        Setzt temporär auf 'partial', loopt enrich-api.
  candidates [N] [filters]              N Kandidaten als JSON auf stdout
                                        Default-Filter: enrichment_status IN (enriched,partial)
                                        Filters: --only-summary-de, --mahighlight,
                                                 --popular-science, --from YYYY-MM-DD,
                                                 --to YYYY-MM-DD
  apply [<file>|-] [--apply] [--force]  Evaluation-JSON aus Datei/stdin, validieren,
                                        mit --apply schreiben. Default skip wenn
                                        analysis_status='analyzed', --force überschreibt.

Modell-Tag bei Session-Scoring: ${SESSION_MODEL_TAG}
Env: PG_DATABASE_URL (default ${PG_URL})
`);
    process.exit(cmd ? 0 : 1);
  }

  const { args, positional } = parseArgs(rest);
  try {
    switch (cmd) {
      case 'status':         await cmdStatus(); break;
      case 'enrich-free':    await cmdEnrichFree(args); break;
      case 'enrich-api':     await cmdEnrichApi(args); break;
      case 'enrich-augment': await cmdEnrichAugment(args); break;
      case 'candidates':     await cmdCandidates(args, positional); break;
      case 'apply':          await cmdApply(args, positional); break;
      default:
        log(`Unbekanntes Kommando: ${cmd}`);
        process.exit(1);
    }
  } catch (e) {
    log(`Fehler: ${e?.message || e}`);
    if (e?.stack) log(e.stack);
    process.exit(1);
  }
}

main();
