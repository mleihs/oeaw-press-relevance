import { describe, it, expect, vi } from 'vitest';

// countDrift ist die Alarm-Metrik des Nacht-Ingest (classifyRun eskaliert ab
// DRIFT_ALARM_THRESHOLD über die Summe der driftTotals). Seit 2026-08-31 zählen
// Personen-Waisen NICHT mehr mit (docs/WEBDB_PERSON_GAP.md §8) — der Fehlalarm
// vom 2026-08-08 (80 Personen-Waisen bei 28 % Quote) ist hier festgenagelt.

vi.mock('@/lib/server/db', () => ({ db: {} }));

import { countDrift } from './run-publications-delta';
import { PERSON_ORPHAN_COLLAPSE_THRESHOLD } from './classify-run';

describe('countDrift', () => {
  it('ignores person_link_orphans — the WebDB person gap is not drift', () => {
    // Der reale 2026-08-08-Lauf: 80 Personen-Waisen, sonst nichts → kein Alarm.
    expect(countDrift({ status: 'applied', person_link_orphans: 80 })).toBe(0);
  });

  it('still ignores the biggest documented benign run (Volldump 22.08.: 343)', () => {
    expect(countDrift({ status: 'applied', person_link_orphans: 343 })).toBe(0);
  });

  it('counts person orphans again above the collapse threshold', () => {
    // Kollaps-Szenario: TYPO3 liefert Pubs + Junctions, aber keine Personen —
    // apply_publications_delta droppt alle Junctions via inner JOIN, der
    // Idempotenz-Key verhindert die Nachlieferung. Das MUSS alarmieren.
    const collapsed = PERSON_ORPHAN_COLLAPSE_THRESHOLD;
    expect(countDrift({ status: 'applied', person_link_orphans: collapsed })).toBe(collapsed);
    expect(
      countDrift({
        status: 'applied',
        person_link_orphans: 5000,
        orgunit_link_orphans: 3,
      }),
    ).toBe(5003);
    // Knapp darunter bleibt es die bekannte Personenlücke.
    expect(
      countDrift({ status: 'applied', person_link_orphans: collapsed - 1 }),
    ).toBe(0);
  });

  it('treats non-numeric report values as 0 instead of failing open via NaN', () => {
    // `Number('kaputt')` wäre NaN, und `NaN >= 25` ist false — die Alarm-Kette
    // wäre fail-open. Der num()-Guard zwingt solche Werte auf 0.
    expect(
      countDrift({
        status: 'applied',
        orgunit_link_orphans: 'kaputt',
        unresolved_publication_type: {},
        person_link_orphans: 'auch kaputt',
        unresolved_member_type: 2,
      }),
    ).toBe(2);
  });

  it('counts orgunit orphans and unresolved lookups', () => {
    expect(
      countDrift({
        status: 'applied',
        person_link_orphans: 12,
        orgunit_link_orphans: 7,
        unresolved_publication_type: 2,
        unresolved_member_type: 1,
      }),
    ).toBe(10);
  });

  it('returns 0 for a non-applied report', () => {
    expect(countDrift({ status: 'skipped', orgunit_link_orphans: 99 })).toBe(0);
  });
});
