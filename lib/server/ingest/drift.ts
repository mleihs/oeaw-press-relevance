import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { alarmRelevantDrift, DRIFT_ALARM_THRESHOLD } from './classify-run';

// Drift-Belege des letzten Publications-Laufs, aufbereitet fuer die Kopfzeile
// des Dashboards.
//
// WARUM UEBERHAUPT. Die Nacht-Reports trugen Drift bisher nur als Zahl, und die
// stand nirgends in der Oberflaeche. „13 verwaiste Verknuepfungen" nennt kein
// betroffenes Objekt und taucht nur im Journal auf, das niemand oeffnet. Beim
// Nachsehen am 2026-08-26 kam heraus, dass ueber 28 Tage 265 Personen von
// Verknuepfungen referenziert werden, die der Export nie mitliefert -- sichtbar
// wurde das erst durch eine Auswertung der Rohexport-Archive.
//
// `drift_details` liefert die Migration 20260826000001; aeltere Zeilen tragen
// den Schluessel nicht. Deshalb ist alles daran optional: fehlt er, bleiben die
// Zaehlungen (die es schon immer gab) und die Belegliste ist leer.

/** So viele Belege wandern in die Blase. Der Rest steht als „und N weitere" da:
 *  die Liste soll die Art des Problems zeigen, nicht es abarbeiten. */
const UI_SAMPLE_LIMIT = 6;

export type DriftSide = 'person' | 'orgunit' | 'publication' | 'both';

export interface DriftSample {
  publicationWebdbUid: number;
  /** Gesetzt bei Personen-Verknuepfungen. */
  personWebdbUid?: number;
  /** Gesetzt bei Orgunit-Verknuepfungen. */
  orgunitWebdbUid?: number;
  /** Welche Seite der Verknuepfung bei uns fehlt. */
  missing: DriftSide;
}

export interface ImportDrift {
  /** Formatiertes Datum des Laufs (Europe/Vienna). */
  appliedAt: string | null;
  personLinkOrphans: number;
  orgunitLinkOrphans: number;
  unresolvedLookups: number;
  /** Summe aller Belege (inkl. Personen-Waisen) -- das ist die ANGEZEIGTE Zahl.
   *  Das Alarmurteil rechnet seit 2026-08-31 OHNE die Personen-Waisen, außer ab
   *  der Kollaps-Schwelle (siehe alarmRelevantDrift in classify-run.ts +
   *  docs/WEBDB_PERSON_GAP.md §8). */
  total: number;
  threshold: number;
  samples: DriftSample[];
  /** Belege, die es nicht in `samples` geschafft haben. */
  more: number;
  /** true, sobald der Lauf die Alarmschwelle gerissen hat. */
  alarming: boolean;
}

interface Row extends Record<string, unknown> {
  applied_at: string | null;
  report: Record<string, unknown> | null;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export async function getLastImportDrift(): Promise<ImportDrift | null> {
  const rows = await db.execute<Row>(sql`
    SELECT applied_at, report
    FROM ingest_runs
    WHERE feed = 'publications_incremental_change_2' AND status = 'applied'
    ORDER BY applied_at DESC
    LIMIT 1
  `);
  const row = rows[0];
  if (!row?.report) return null;

  const r = row.report;
  const personLinkOrphans = num(r.person_link_orphans);
  const orgunitLinkOrphans = num(r.orgunit_link_orphans);
  const unresolvedLookups =
    num(r.unresolved_publication_type) + num(r.unresolved_member_type);
  const total = personLinkOrphans + orgunitLinkOrphans + unresolvedLookups;
  if (total === 0) return null;

  const details = (r.drift_details ?? {}) as Record<string, unknown>;
  const personLinks = Array.isArray(details.person_links) ? details.person_links : [];
  const orgunitLinks = Array.isArray(details.orgunit_links) ? details.orgunit_links : [];

  const samples: DriftSample[] = [
    ...personLinks.map((x) => {
      const o = x as Record<string, unknown>;
      return {
        publicationWebdbUid: num(o.publication_webdb_uid),
        personWebdbUid: num(o.person_webdb_uid),
        missing: side(!!o.person_missing, !!o.publication_missing, 'person'),
      };
    }),
    ...orgunitLinks.map((x) => {
      const o = x as Record<string, unknown>;
      return {
        publicationWebdbUid: num(o.publication_webdb_uid),
        orgunitWebdbUid: num(o.orgunit_webdb_uid),
        missing: side(!!o.orgunit_missing, !!o.publication_missing, 'orgunit'),
      };
    }),
  ];

  return {
    appliedAt: fmt(row.applied_at),
    personLinkOrphans,
    orgunitLinkOrphans,
    unresolvedLookups,
    total,
    threshold: DRIFT_ALARM_THRESHOLD,
    samples: samples.slice(0, UI_SAMPLE_LIMIT),
    // Gegen `total` rechnen, nicht gegen die Belegliste: die Migration deckelt
    // schon bei 50, ein Lauf mit 343 Orphans darf hier nicht „und 44 weitere"
    // behaupten.
    more: Math.max(0, total - Math.min(samples.length, UI_SAMPLE_LIMIT)),
    // Dieselbe Regel wie countDrift, single-sourced in classify-run.ts:
    // Personen-Waisen sind die dauerhafte WebDB-Personenlücke und zählen nicht
    // gegen die Alarmschwelle — außer ab der Kollaps-Schwelle.
    alarming: alarmRelevantDrift(r) >= DRIFT_ALARM_THRESHOLD,
  };
}

function side(entityMissing: boolean, pubMissing: boolean, entity: 'person' | 'orgunit'): DriftSide {
  if (entityMissing && pubMissing) return 'both';
  return entityMissing ? entity : 'publication';
}

function fmt(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Vienna',
  }).format(d);
}
