import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { countDrift } from './run-publications-delta';

/**
 * Integrationstest für die DB-Funktion `apply_publications_delta` (Migrationen
 * 20260710000001 + 20260826000001) gegen den LOKALEN Supabase-Stack — das
 * größte bislang ungetestete Stück Logik (>500 Zeilen plpgsql, nächtlich
 * unbeaufsichtigt im Einsatz). Self-Skip-Stil wie board-smoke.test.ts: läuft
 * nur, wenn DATABASE_URL auf die lokale Dev-DB (Port 54422) zeigt.
 *
 * Abgedeckt: Fixture-Delta mit Drift-Report (person/orgunit_link_orphans +
 * drift_details-Belegzeilen), Volldump-Guard (>2000 Pubs → Exception, kein
 * Journal-Eintrag), Idempotenz (gleiches (feed, generated_at) → No-op-Skip)
 * und das Personen-Kollaps-Szenario (Junctions ohne Personensätze → alle als
 * Orphans gezählt, keine Autorenschaft geschrieben).
 */
const dbUrl = process.env.DATABASE_URL || '';
const isLocal = /(?:127\.0\.0\.1|localhost):54422\b/.test(dbUrl);

// Weit über allen realen TYPO3-uids (Bestand ~6-stellig) — kollisionsfrei.
const B = 88_800_000;
const FEED = 'vitest_delta_smoke';
// Eindeutig je Testlauf, damit der Idempotenz-Skip nie von einem alten
// (abgestürzten) Lauf ausgelöst wird.
const GEN = Date.now();

interface Report {
  status: string;
  reason?: string;
  [k: string]: unknown;
}

async function apply(
  payload: Record<string, unknown>,
  opts: Record<string, unknown> = {},
): Promise<Report> {
  const rows = await db.execute<{ report: Report }>(
    sql`SELECT apply_publications_delta(${JSON.stringify(payload)}::jsonb, ${JSON.stringify({
      feed: FEED,
      source_label: 'vitest',
      ...opts,
    })}::jsonb) AS report`,
  );
  return rows[0].report;
}

const delta = (
  genTs: number,
  upsert: Record<string, unknown[]> = {},
  del: Record<string, unknown[]> = {},
) => ({
  meta: { generated_at_timestamp: genTs, generated_at_readable: 'vitest' },
  upsert: {
    publications: [],
    persons: [],
    person_publications: [],
    orgunit_publications: [],
    ...upsert,
  },
  delete: {
    publications: [],
    persons: [],
    person_publications: [],
    orgunit_publications: [],
    ...del,
  },
});

/** Fixture-Reste dieses (und eines evtl. abgestürzten früheren) Laufs räumen. */
async function cleanup() {
  await db.execute(sql`
    DELETE FROM person_publications pp USING publications p
    WHERE pp.publication_id = p.id AND p.webdb_uid BETWEEN ${B} AND ${B + 99_999}`);
  await db.execute(sql`
    DELETE FROM person_publications pp USING persons pe
    WHERE pp.person_id = pe.id AND pe.webdb_uid BETWEEN ${B} AND ${B + 99_999}`);
  await db.execute(
    sql`DELETE FROM persons WHERE webdb_uid BETWEEN ${B} AND ${B + 99_999}`,
  );
  await db.execute(
    sql`DELETE FROM publications WHERE webdb_uid BETWEEN ${B} AND ${B + 99_999}`,
  );
  await db.execute(sql`DELETE FROM ingest_runs WHERE feed = ${FEED}`);
}

describe.skipIf(!isLocal)('apply_publications_delta (lokaler Stack)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('wendet ein Fixture-Delta an und meldet Waisen samt drift_details-Belegen', async () => {
    const report = await apply(
      delta(GEN, {
        publications: [{ webdb_uid: B + 1, title: 'Vitest Delta Pub', peer_reviewed: true }],
        persons: [{ webdb_uid: B + 1, firstname: 'Viola', lastname: 'Vitest' }],
        person_publications: [
          // auflösbar: Person + Pub aus diesem Delta
          { person_webdb_uid: B + 1, publication_webdb_uid: B + 1, highlight: false, mahighlight: false, authorship: 'lead' },
          // Waise: Person wird vom Export nie geliefert (WebDB-Personenlücke)
          { person_webdb_uid: B + 999, publication_webdb_uid: B + 1, highlight: false, mahighlight: false, authorship: null },
        ],
        orgunit_publications: [
          // Waise: Orgunit-Stammsätze kommen nicht über den Feed
          { orgunit_webdb_uid: B + 998, publication_webdb_uid: B + 1, highlight: false },
        ],
      }),
    );

    expect(report.status).toBe('applied');
    expect(report.pubs_upserted).toBe(1);
    expect(report.persons_upserted).toBe(1);
    expect(report.person_links_upserted).toBe(1);
    expect(report.person_link_orphans).toBe(1);
    expect(report.orgunit_links_upserted).toBe(0);
    expect(report.orgunit_link_orphans).toBe(1);
    expect(report.matview_dirty).toBe(true);

    // Drift-Belege (Migration 20260826000001): WELCHE Verknüpfung ins Leere
    // zeigt, nicht nur wie viele.
    const details = report.drift_details as {
      person_links: Array<Record<string, unknown>>;
      orgunit_links: Array<Record<string, unknown>>;
      sample_limit: number;
    };
    expect(details.sample_limit).toBe(50);
    expect(details.person_links).toEqual([
      {
        person_webdb_uid: B + 999,
        publication_webdb_uid: B + 1,
        person_missing: true,
        publication_missing: false,
      },
    ]);
    expect(details.orgunit_links).toEqual([
      {
        orgunit_webdb_uid: B + 998,
        publication_webdb_uid: B + 1,
        orgunit_missing: true,
        publication_missing: false,
      },
    ]);

    // Der TS-Alarmpfad sieht diese Waisen NICHT als Alarm-Drift: 1 Personen-
    // Waise ist Quellenrauschen, nur die Orgunit-Waise zählt (unter Schwelle).
    expect(countDrift(report)).toBe(1);

    // Endzustand in der DB: Pub aktiv, Autorenschaft verknüpft, Journal steht.
    const [pubRow] = await db.execute<{ archived: boolean; title: string }>(
      sql`SELECT archived, title FROM publications WHERE webdb_uid = ${B + 1}`,
    );
    expect(pubRow).toMatchObject({ archived: false, title: 'Vitest Delta Pub' });
    const [linkCount] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM person_publications pp
          JOIN persons pe ON pe.id = pp.person_id
          WHERE pe.webdb_uid = ${B + 1}`,
    );
    expect(linkCount.n).toBe(1);
    const [run] = await db.execute<{ status: string }>(
      sql`SELECT status FROM ingest_runs
          WHERE feed = ${FEED} AND generated_at_timestamp = ${GEN}`,
    );
    expect(run.status).toBe('applied');
  });

  it('ist idempotent: gleicher (feed, generated_at) ist ein No-op-Skip', async () => {
    // Zweiter Lauf desselben Zeitstempels mit ANDEREM Inhalt — darf nichts tun.
    const report = await apply(
      delta(GEN, {
        publications: [{ webdb_uid: B + 1, title: 'DARF NICHT ANKOMMEN' }],
      }),
    );
    expect(report.status).toBe('skipped');
    expect(report.reason).toBe('already_applied');

    const [pubRow] = await db.execute<{ title: string }>(
      sql`SELECT title FROM publications WHERE webdb_uid = ${B + 1}`,
    );
    expect(pubRow.title).toBe('Vitest Delta Pub');
    // Kein zweiter Journal-Eintrag.
    const [runs] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ingest_runs WHERE feed = ${FEED}`,
    );
    expect(runs.n).toBe(1);
  });

  it('Volldump-Guard: >2000 Pubs ohne force → Exception, kein Journal, kein Write', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({
      webdb_uid: B + 10_000 + i,
      title: `Guard ${i}`,
    }));
    await expect(
      apply(delta(GEN + 1, { publications: many })),
    ).rejects.toThrow(/max_delta_pubs=2000/);

    // All-or-nothing: weder Journal-Zeile noch eine der 2001 Pubs.
    const [run] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ingest_runs
          WHERE feed = ${FEED} AND generated_at_timestamp = ${GEN + 1}`,
    );
    expect(run.n).toBe(0);
    const [pubs] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM publications
          WHERE webdb_uid BETWEEN ${B + 10_000} AND ${B + 12_000}`,
    );
    expect(pubs.n).toBe(0);
  });

  it('Personen-Kollaps-Szenario: Junctions ohne Personensätze → alle Waisen, nichts geschrieben', async () => {
    // Der 22.08.-Fall in klein: TYPO3 liefert Pubs + Junctions, aber keine
    // Personen. Der INNER JOIN droppt ALLE Autorenschaften — der Report muss
    // jede einzelne als Orphan ausweisen, damit der Kollaps-Guard in TS
    // (PERSON_ORPHAN_COLLAPSE_THRESHOLD) überhaupt etwas zu zählen hat.
    const missing = [1, 2, 3, 4, 5].map((i) => ({
      person_webdb_uid: B + 20_000 + i,
      publication_webdb_uid: B + 2,
      highlight: false,
      mahighlight: false,
      authorship: null,
    }));
    const report = await apply(
      delta(GEN + 2, {
        publications: [{ webdb_uid: B + 2, title: 'Kollaps-Pub' }],
        person_publications: missing,
      }),
    );

    expect(report.status).toBe('applied');
    expect(report.person_links_upserted).toBe(0);
    expect(report.person_link_orphans).toBe(5);
    const details = report.drift_details as { person_links: unknown[] };
    expect(details.person_links).toHaveLength(5);

    // Keine einzige Autorenschaft an der Pub gelandet.
    const [links] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM person_publications pp
          JOIN publications p ON p.id = pp.publication_id
          WHERE p.webdb_uid = ${B + 2}`,
    );
    expect(links.n).toBe(0);
  });

  it('explizites Publication-Delete ist Soft-Archive, Re-Add ent-archiviert', async () => {
    const del = await apply(delta(GEN + 3, {}, { publications: [B + 1] }));
    expect(del.status).toBe('applied');
    expect(del.pubs_archived).toBe(1);
    const [archived] = await db.execute<{ archived: boolean }>(
      sql`SELECT archived FROM publications WHERE webdb_uid = ${B + 1}`,
    );
    expect(archived.archived).toBe(true);

    const readd = await apply(
      delta(GEN + 4, { publications: [{ webdb_uid: B + 1, title: 'Vitest Delta Pub' }] }),
    );
    expect(readd.pubs_upserted).toBe(1);
    const [restored] = await db.execute<{ archived: boolean }>(
      sql`SELECT archived FROM publications WHERE webdb_uid = ${B + 1}`,
    );
    expect(restored.archived).toBe(false);
  });
});
