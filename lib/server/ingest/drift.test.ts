import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  set(rows: Array<Record<string, unknown>>) { h.rows = rows; },
}));

vi.mock('@/lib/server/db', () => ({
  db: { execute: () => Promise.resolve(h.rows) },
}));

import { getLastImportDrift } from './drift';

const APPLIED = '2026-08-26T04:31:24.000Z';

beforeEach(() => h.set([]));

describe('getLastImportDrift', () => {
  it('returns null when there is no run at all', async () => {
    expect(await getLastImportDrift()).toBeNull();
  });

  it('returns null for a clean run: nothing to show, no bubble', async () => {
    h.set([{ applied_at: APPLIED, report: { person_link_orphans: 0, orgunit_link_orphans: 0 } }]);
    expect(await getLastImportDrift()).toBeNull();
  });

  it('reads counts and evidence, and names the missing side', async () => {
    h.set([{
      applied_at: APPLIED,
      report: {
        person_link_orphans: 2,
        orgunit_link_orphans: 1,
        unresolved_publication_type: 1,
        drift_details: {
          sample_limit: 50,
          person_links: [
            { person_webdb_uid: 11512, publication_webdb_uid: 900, person_missing: true, publication_missing: false },
            { person_webdb_uid: 11513, publication_webdb_uid: 901, person_missing: true, publication_missing: true },
          ],
          orgunit_links: [
            { orgunit_webdb_uid: 16312, publication_webdb_uid: 902, orgunit_missing: false, publication_missing: true },
          ],
        },
      },
    }]);

    const d = await getLastImportDrift();
    expect(d).not.toBeNull();
    expect(d!.total).toBe(4);
    expect(d!.appliedAt).toBe('26.08.');
    expect(d!.samples.map((s) => s.missing)).toEqual(['person', 'both', 'publication']);
    expect(d!.samples[0]).toMatchObject({ publicationWebdbUid: 900, personWebdbUid: 11512 });
    expect(d!.samples[2]).toMatchObject({ publicationWebdbUid: 902, orgunitWebdbUid: 16312 });
    // Die unaufgeloeste Typangabe zaehlt mit, hat aber keine Belegzeile.
    expect(d!.more).toBe(1);
    expect(d!.alarming).toBe(false);
  });

  it('survives an old row that predates drift_details', async () => {
    // Zeilen von vor der Migration 20260826000001 tragen nur die Zaehlungen.
    h.set([{ applied_at: APPLIED, report: { person_link_orphans: 343 } }]);

    const d = await getLastImportDrift();
    expect(d!.total).toBe(343);
    expect(d!.samples).toEqual([]);
    // Personen-Waisen sind die WebDB-Personenluecke (WEBDB_PERSON_GAP §8):
    // auch 343 davon sind KEIN Alarm — der 22.08.-Volldump-Lauf darf die
    // Blase nicht rot faerben.
    expect(d!.alarming).toBe(false);
  });

  it('alarms on a person-orphan collapse (above the collapse threshold)', async () => {
    // Kollaps-Guard: ab PERSON_ORPHAN_COLLAPSE_THRESHOLD (classify-run.ts)
    // zählen Personen-Waisen doch — die Blase muss dann rot werden.
    h.set([{ applied_at: APPLIED, report: { person_link_orphans: 4000 } }]);

    const d = await getLastImportDrift();
    expect(d!.total).toBe(4000);
    expect(d!.alarming).toBe(true);
  });

  it('alarms on orgunit orphans + unresolved lookups, not on person orphans', async () => {
    h.set([{
      applied_at: APPLIED,
      report: {
        person_link_orphans: 3,
        orgunit_link_orphans: 20,
        unresolved_publication_type: 5,
      },
    }]);

    const d = await getLastImportDrift();
    expect(d!.total).toBe(28);
    expect(d!.alarming).toBe(true);
  });

  it('never claims more evidence than the run actually had', async () => {
    // Belegliste (50) ist gedeckelt, die UI zeigt 6 -- „und N weitere" muss
    // gegen die Gesamtzahl rechnen, nicht gegen die Stichprobe.
    h.set([{
      applied_at: APPLIED,
      report: {
        person_link_orphans: 343,
        drift_details: {
          sample_limit: 50,
          person_links: Array.from({ length: 50 }, (_, i) => ({
            person_webdb_uid: i, publication_webdb_uid: 1000 + i, person_missing: true,
          })),
          orgunit_links: [],
        },
      },
    }]);

    const d = await getLastImportDrift();
    expect(d!.samples).toHaveLength(6);
    expect(d!.more).toBe(337);
  });
});
