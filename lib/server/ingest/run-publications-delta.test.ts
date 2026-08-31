import { describe, it, expect, vi } from 'vitest';

// countDrift ist die Alarm-Metrik des Nacht-Ingest (classifyRun eskaliert ab
// DRIFT_ALARM_THRESHOLD über die Summe der driftTotals). Seit 2026-08-31 zählen
// Personen-Waisen NICHT mehr mit (docs/WEBDB_PERSON_GAP.md §8) — der Fehlalarm
// vom 2026-08-08 (80 Personen-Waisen bei 28 % Quote) ist hier festgenagelt.

vi.mock('@/lib/server/db', () => ({ db: {} }));

import { countDrift } from './run-publications-delta';

describe('countDrift', () => {
  it('ignores person_link_orphans — the WebDB person gap is not drift', () => {
    // Der reale 2026-08-08-Lauf: 80 Personen-Waisen, sonst nichts → kein Alarm.
    expect(countDrift({ status: 'applied', person_link_orphans: 80 })).toBe(0);
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
