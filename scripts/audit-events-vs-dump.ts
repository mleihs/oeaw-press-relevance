#!/usr/bin/env tsx
// Gegenprobe: welche TYPO3-Events kennt der WebDB-Dump, die NIE über die
// nächtliche Schnittstelle in unsere DB gekommen sind?
//
// Warum es das braucht: der Nacht-Ingest liest den JSON-Export
// (`event_news_grouped`), nicht die WebDB. Ein Event, das der Export nicht
// ausliefert — weil es nach dem Export-Lauf angelegt/geändert wurde, weil es
// auf einer Seite liegt, die der Export nicht einsammelt, oder weil der Lauf
// an dem Tag leer war — taucht bei uns nie auf und fällt niemandem auf: es
// fehlt ja nur etwas, das nie da war. Der Dump ist die einzige Quelle, in der
// man diese Lücke SEHEN kann.
//
// Der Vergleich läuft über `webdb_uid` ↔ `tx_news_domain_model_news.uid` —
// die einzige über beide Systeme stabile Identität. UUIDs sind es NICHT
// (local und prod haben seit prod-first verschiedene).
//
// ZWEITER BEFUND vom selben Tag, deshalb `--drift`: der Export liefert nur bei
// der ANLAGE aus, nie bei einer Änderung. Von 74 Auslieferungen in 35
// archivierten Tagen wurden 74 am Tag des `crdate` geliefert und keine einzige
// wegen eines neuen `tstamp`. Eine Veranstaltung, die nach dem Anlegen
// bearbeitet wird, erreicht uns also nie wieder — und 81 % aller künftigen
// Events werden nachbearbeitet, im Mittel 133 Tage später. Ein reiner
// Existenz-Abgleich sieht diese Lücke nicht: die Zeile IST da, sie ist nur
// veraltet. `--drift` vergleicht deshalb zusätzlich die Felder, die der
// nächtliche Upsert ohnehin pflegen würde.
//
// Voraussetzung: der Dump liegt im lokalen MySQL-Container (Port 54499,
// db `webdb`) — Aufbau siehe docs/WEBDB_IMPORT.md Schritt 2. Es genügt, die
// Tabellen `tx_news_domain_model_news`, `pages` und die beiden
// `tx_eventnews_domain_model_*` einzuspielen; alles andere braucht die
// Institutsauflösung nicht.
//
// Nur lesend — das Skript schreibt NICHTS. Es ist bewusst kein Import:
// `sync-events --target=prod` würde künftige Events löschen, die der Dump
// nicht kennt (Runbook-Warnung), deshalb bleibt das Nachziehen eine
// bewusste Handbewegung.
//
// Verwendung:
//   npx tsx scripts/audit-events-vs-dump.ts                  # prod, ab heute
//   npx tsx scripts/audit-events-vs-dump.ts --target=local
//   npx tsx scripts/audit-events-vs-dump.ts --from=2026-01-01   # auch Vergangenes
//   npx tsx scripts/audit-events-vs-dump.ts --to=2026-12-31
//   npx tsx scripts/audit-events-vs-dump.ts --institute=GMI
//   npx tsx scripts/audit-events-vs-dump.ts --title=Schrödinger
//   npx tsx scripts/audit-events-vs-dump.ts --json > fehlende.json
//   npx tsx scripts/audit-events-vs-dump.ts --limit=20
//   npx tsx scripts/audit-events-vs-dump.ts --drift        # zusätzlich veraltete Felder
//   npx tsx scripts/audit-events-vs-dump.ts --drift-only    # NUR veraltete Felder

import mysql from 'mysql2/promise';
import {
  bootstrapScript, redactedDatabaseUrl, captureScriptError, flushAndExit,
} from './lib/bootstrap';
// Bewusst node-pg (connectDb) statt Drizzle: Drizzle/postgres-js scheitert am
// selbstsignierten Zertifikat des Prod-Poolers und braeuchte `npm run db:tunnel`
// + PROD_DB_TUNNEL=1. connectDb setzt die Ausnahme pro Verbindung und erreicht
// Prod direkt — fuer eine einzige lesende Abfrage ist der Tunnel Ballast.
import { connectDb } from './lib/db.mjs';

const { target, flags } = bootstrapScript('audit-events-vs-dump');

const flagValue = (name: string): string | undefined => {
  const hit = flags.find((f) => f.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
};
const hasFlag = (name: string): boolean => flags.includes(`--${name}`);

/** `--from`/`--to` als Unix-Sekunden. Ohne `--from` beginnt das Fenster JETZT:
 *  das ist der Ausschnitt, der operativ zählt (was noch stattfindet, kann noch
 *  bepitcht werden), und zugleich derselbe Ausschnitt, den der Adapter fährt. */
function boundary(name: string, fallback: number | null): number | null {
  const raw = flagValue(name);
  if (!raw) return fallback;
  const ms = Date.parse(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(ms)) {
    throw new Error(`--${name}=${raw} ist kein Datum (erwartet YYYY-MM-DD)`);
  }
  return Math.floor(ms / 1000);
}

interface DumpEvent {
  uid: number;
  title: string;
  datetime: number;
  institute: string | null;
  location_title: string | null;
  organizer_title: string | null;
  crdate: number | null;
  tstamp: number | null;
  sys_language_uid: number;
}

/** Dieselbe Instituts-Auflösung wie der Adapter (rekursiver Seitenbaum-Walk
 *  bis zum Siteroot), aber mit freiem Zeitfenster statt `>= UNIX_TIMESTAMP()`
 *  und mit `crdate`/`tstamp` zusätzlich: erst die beiden Zeitstempel machen
 *  sichtbar, OB ein fehlendes Event überhaupt jemals in einem Export-Fenster
 *  lag oder erst danach angelegt wurde. */
const DUMP_EVENTS_SQL = `
  WITH RECURSIVE event_page_walk AS (
    SELECT n.uid AS event_uid, p.uid AS page_uid, p.pid,
           p.title AS page_title, p.is_siteroot, 0 AS depth
    FROM tx_news_domain_model_news n
    JOIN pages p ON p.uid = n.pid
    WHERE n.is_event = 1 AND n.deleted = 0 AND n.hidden = 0
    UNION ALL
    SELECT ep.event_uid, p.uid, p.pid, p.title, p.is_siteroot, ep.depth + 1
    FROM event_page_walk ep
    JOIN pages p ON p.uid = ep.pid
    WHERE ep.is_siteroot = 0 AND ep.depth < 12
  ),
  siteroot_per_event AS (
    SELECT event_uid, page_title AS root_title, depth AS root_depth
    FROM event_page_walk WHERE is_siteroot = 1
  ),
  subroot_per_event AS (
    SELECT ep.event_uid, ep.page_title AS sub_title
    FROM event_page_walk ep
    JOIN siteroot_per_event sr ON sr.event_uid = ep.event_uid
    WHERE ep.depth = sr.root_depth - 1
  ),
  institute_per_event AS (
    SELECT sr.event_uid,
      CASE WHEN sr.root_title IN (
             'Österreichische Akademie der Wissenschaften',
             'Austrian Academy of Sciences'
           ) AND sub.sub_title IS NOT NULL
           THEN sub.sub_title ELSE sr.root_title END AS institute
    FROM siteroot_per_event sr
    LEFT JOIN subroot_per_event sub ON sub.event_uid = sr.event_uid
  )
  SELECT
    n.uid, n.title, n.datetime, n.crdate, n.tstamp, n.sys_language_uid,
    COALESCE(NULLIF(n.location_simple, ''), loc.title)  AS location_title,
    COALESCE(NULLIF(n.organizer_simple, ''), org.title) AS organizer_title,
    ipe.institute
  FROM tx_news_domain_model_news n
  LEFT JOIN tx_eventnews_domain_model_location loc
    ON loc.uid = n.location AND loc.deleted = 0
  LEFT JOIN tx_eventnews_domain_model_organizer org
    ON org.uid = n.organizer AND org.deleted = 0
  LEFT JOIN institute_per_event ipe ON ipe.event_uid = n.uid
  WHERE n.is_event = 1
    AND n.deleted = 0
    AND n.hidden = 0
    AND n.l10n_parent = 0
    AND n.datetime > 0
    AND n.datetime >= ?
    AND (? = 0 OR n.datetime <= ?)
  ORDER BY n.datetime ASC
`;

const iso = (unix: number | null): string =>
  unix && unix > 0 ? new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—';

interface ProdEvent {
  webdb_uid: number;
  title: string;
  event_at: string | Date;
  event_end_at: string | Date | null;
  location_title: string | null;
  organizer_title: string | null;
  institute: string | null;
}

interface Abweichung {
  feld: string;
  beiUns: string;
  inTypo3: string;
}

const norm = (v: string | null | undefined): string => (v ?? '').trim();

/** Sekundengenauer Vergleich: TYPO3 hält den Start als Unix-Sekunde, Postgres
 *  als timestamptz. Ein Vergleich der Textform verglich sonst Formatierungen. */
const gleicheZeit = (unix: number | null, ts: string | Date | null): boolean => {
  if (!unix || unix <= 0) return ts == null;
  if (ts == null) return false;
  return Math.floor(new Date(ts).getTime() / 1000) === Math.floor(unix);
};

/** Nur Felder, die TYPO3 auch wirklich führt. Ein leeres TYPO3-Feld gegen einen
 *  gefüllten Prod-Wert ist KEINE Drift: Ort und Organisator zieht der Adapter
 *  teils aus dem Sidebar-HTML, das der Dump so nicht kennt. */
function drift(t: DumpEvent, p: ProdEvent): Abweichung[] {
  const out: Abweichung[] = [];
  if (norm(t.title) !== norm(p.title)) {
    out.push({ feld: 'Titel', beiUns: norm(p.title), inTypo3: norm(t.title) });
  }
  if (!gleicheZeit(t.datetime, p.event_at)) {
    out.push({
      feld: 'Termin',
      beiUns: p.event_at ? new Date(p.event_at).toISOString().slice(0, 16).replace('T', ' ') : '—',
      inTypo3: iso(t.datetime),
    });
  }
  if (norm(t.location_title) && norm(t.location_title) !== norm(p.location_title)) {
    out.push({ feld: 'Ort', beiUns: norm(p.location_title) || '—', inTypo3: norm(t.location_title) });
  }
  if (norm(t.organizer_title) && norm(t.organizer_title) !== norm(p.organizer_title)) {
    out.push({ feld: 'Organisator', beiUns: norm(p.organizer_title) || '—', inTypo3: norm(t.organizer_title) });
  }
  if (norm(t.institute) && norm(t.institute) !== norm(p.institute)) {
    out.push({ feld: 'Institut', beiUns: norm(p.institute) || '—', inTypo3: norm(t.institute) });
  }
  return out;
}

async function main(): Promise<void> {
  const from = boundary('from', Math.floor(Date.now() / 1000))!;
  const to = boundary('to', null) ?? 0;
  const instituteFilter = flagValue('institute')?.toLowerCase();
  const titleFilter = flagValue('title')?.toLowerCase();
  const limit = Number(flagValue('limit') ?? 0);
  const asJson = hasFlag('json');
  const nurDrift = hasFlag('drift-only');
  const mitDrift = nurDrift || hasFlag('drift');

  const conn = await mysql.createConnection({
    host: process.env.WEBDB_MYSQL_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.WEBDB_MYSQL_PORT || process.env.MYSQL_PORT || 54499),
    user: process.env.WEBDB_MYSQL_USER || process.env.MYSQL_USER || 'root',
    password: process.env.WEBDB_MYSQL_PASSWORD ?? process.env.MYSQL_PASSWORD ?? 'root',
    database: process.env.WEBDB_MYSQL_DATABASE || process.env.MYSQL_DATABASE || 'webdb',
    charset: 'utf8mb4',
  });
  let dump: DumpEvent[];
  try {
    const [rows] = await conn.query(DUMP_EVENTS_SQL, [from, to, to]);
    dump = rows as DumpEvent[];
  } finally {
    await conn.end();
  }

  const pg = await connectDb({ target });
  let bekannt: Map<number, ProdEvent>;
  try {
    // Die Felder, die der nächtliche Upsert pflegen WÜRDE, wenn der Export sie
    // nachliefern würde. Genau daran misst sich, was uns entgeht.
    const known = await pg.query(
      `SELECT webdb_uid, title, event_at, event_end_at, location_title,
              organizer_title, institute
         FROM events`,
    );
    bekannt = new Map(
      (known.rows as ProdEvent[]).map((r) => [r.webdb_uid, r]),
    );
  } finally {
    await pg.end();
  }
  const knownUids = new Set(bekannt.keys());

  let missing = dump.filter((e) => !knownUids.has(e.uid));
  if (instituteFilter) {
    missing = missing.filter((e) => (e.institute ?? '').toLowerCase().includes(instituteFilter));
  }
  if (titleFilter) {
    missing = missing.filter((e) => e.title.toLowerCase().includes(titleFilter));
  }
  const shown = limit > 0 ? missing.slice(0, limit) : missing;

  // Veraltete Zeilen: vorhanden, aber inhaltlich hinter TYPO3 zurück. Dieselben
  // Filter wie oben, damit --institute/--title beide Listen gleich einschränken.
  let veraltet: Array<{ t: DumpEvent; p: ProdEvent; abw: Abweichung[] }> = [];
  if (mitDrift) {
    for (const t of dump) {
      const pe = bekannt.get(t.uid);
      if (!pe) continue;
      if (instituteFilter && !(t.institute ?? '').toLowerCase().includes(instituteFilter)) continue;
      if (titleFilter && !t.title.toLowerCase().includes(titleFilter)) continue;
      const abw = drift(t, pe);
      if (abw.length) veraltet.push({ t, p: pe, abw });
    }
    if (limit > 0) veraltet = veraltet.slice(0, limit);
  }

  if (asJson) {
    console.log(JSON.stringify(
      shown.map((e) => ({
        webdb_uid: e.uid,
        title: e.title,
        event_at: new Date(e.datetime * 1000).toISOString(),
        institute: e.institute,
        location: e.location_title,
        organizer: e.organizer_title,
        created_at: e.crdate ? new Date(e.crdate * 1000).toISOString() : null,
        changed_at: e.tstamp ? new Date(e.tstamp * 1000).toISOString() : null,
        sys_language_uid: e.sys_language_uid,
      })),
      null, 2,
    ));
    if (mitDrift) {
      console.log(JSON.stringify(
        veraltet.map((v) => ({
          webdb_uid: v.t.uid,
          title: v.t.title,
          changed_at: v.t.tstamp ? new Date(v.t.tstamp * 1000).toISOString() : null,
          abweichungen: v.abw,
        })),
        null, 2,
      ));
    }
    return;
  }

  console.log(`[audit-events-vs-dump] target=${target} db=${redactedDatabaseUrl()}`);
  console.log(
    `Fenster ab ${iso(from)}${to ? ` bis ${iso(to)}` : ''} — ` +
    `Dump: ${dump.length} Events · DB kennt ${knownUids.size} uids · ` +
    `NUR IM DUMP: ${missing.length}` +
    (shown.length !== missing.length ? ` (gezeigt: ${shown.length})` : '') +
    (mitDrift ? ` · VERALTET: ${veraltet.length}` : ''),
  );

  if (mitDrift) {
    if (!veraltet.length) {
      console.log('\nKeine veralteten Felder.');
    } else {
      console.log('\n=== VERALTET (bei uns vorhanden, aber hinter TYPO3 zurück) ===');
      for (const v of veraltet) {
        console.log(`uid ${String(v.t.uid).padEnd(7)} ${iso(v.t.datetime)}  ${v.p.title}`);
        console.log(`${' '.repeat(12)}zuletzt in TYPO3 geändert: ${iso(v.t.tstamp)}`);
        for (const a of v.abw) {
          console.log(`${' '.repeat(12)}${a.feld.padEnd(12)} bei uns: ${a.beiUns}`);
          console.log(`${' '.repeat(12)}${' '.repeat(12)} TYPO3  : ${a.inTypo3}`);
        }
      }
      const proFeld = new Map<string, number>();
      for (const v of veraltet) for (const a of v.abw) proFeld.set(a.feld, (proFeld.get(a.feld) ?? 0) + 1);
      console.log('\nAbweichungen nach Feld:');
      for (const [f, n] of [...proFeld].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${f}`);
      }
    }
  }
  if (nurDrift) return;
  if (!missing.length) {
    console.log('\nNichts fehlt.');
    return;
  }

  console.log('\n=== NUR IM DUMP (nie über den Feed gekommen) ===');
  for (const e of shown) {
    console.log(
      `uid ${String(e.uid).padEnd(7)} ${iso(e.datetime)}  ${e.title}`,
    );
    console.log(
      `${' '.repeat(12)}Institut: ${e.institute ?? '—'} · Ort: ${e.location_title ?? '—'}` +
      ` · angelegt: ${iso(e.crdate)} · geändert: ${iso(e.tstamp)}`,
    );
  }

  // Gruppierung nach Institut: eine Häufung an EINER Stelle heißt, dass der
  // Export einen Seitenzweig gar nicht einsammelt — ein anderer Defekt als
  // verstreute Einzelfälle (die auf das Export-Zeitfenster deuten).
  const byInstitute = new Map<string, number>();
  for (const e of missing) {
    const k = e.institute ?? '(ohne Institut)';
    byInstitute.set(k, (byInstitute.get(k) ?? 0) + 1);
  }
  console.log('\nNach Institut:');
  for (const [inst, n] of [...byInstitute].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${inst}`);
  }
}

main().catch((err: unknown) => {
  console.error('[audit-events-vs-dump] failed:', err);
  captureScriptError(err);
  void flushAndExit(1);
});
