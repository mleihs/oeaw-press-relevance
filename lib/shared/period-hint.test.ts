import { describe, it, expect } from 'vitest';
import { buildPeriodHint } from './period-hint';
import { TOP_PUBS_MAX, type PeriodCounts } from './dashboard';

// Live-shaped fixture (verified against the local DB on 2026-05-16):
// week=0, 2-Monate=31, Jahr=879, Gesamt=6749.
const COUNTS: PeriodCounts = { week: 0, month: 31, year: 879, all: 6749 };

// Mirror the helper's de-AT formatter so the expectations stay agnostic to
// the ICU grouping glyph (Node/V8 render de-AT with a narrow no-break
// space, not a dot) — we pin the branching + prose, not the locale table.
const f = (n: number) => n.toLocaleString('de-AT');

describe('buildPeriodHint', () => {
  it('all period data loaded, wider periods exist → ladder of deltas', () => {
    expect(
      buildPeriodHint({ period: 'month', currentTotal: 31, counts: COUNTS, capped: false }),
    ).toEqual({
      buttonLabel: 'Alle geladen',
      title: `Alle ${f(31)} aus „2 Monate" geladen`,
      lead: `Alle ${f(31)} Publikationen aus „2 Monate" sind geladen. Ein größerer Zeitraum zeigt mehr:`,
      ladder: [
        `„Jahr": ${f(879)} (+${f(848)} mehr)`,
        `„Gesamt": ${f(6749)} (+${f(6718)} mehr)`,
      ],
    });
  });

  it('all period data loaded, already the widest period → no ladder', () => {
    expect(
      buildPeriodHint({ period: 'all', currentTotal: 6749, counts: COUNTS, capped: false }),
    ).toEqual({
      buttonLabel: 'Alle geladen',
      title: `Alle ${f(6749)} aus „Gesamt" geladen`,
      lead: `„Gesamt" ist der größte Zeitraum; alle ${f(6749)} Publikationen sind geladen.`,
      ladder: [],
    });
  });

  it('empty period → "Nichts zu laden" + full ladder vs zero baseline', () => {
    expect(
      buildPeriodHint({ period: 'week', currentTotal: 0, counts: COUNTS, capped: false }),
    ).toEqual({
      buttonLabel: 'Nichts zu laden',
      title: 'Keine Publikationen im Zeitraum „Woche"',
      lead: 'Im Zeitraum „Woche" gibt es keine analysierten Publikationen. Ein größerer Zeitraum zeigt mehr:',
      ladder: [
        `„2 Monate": ${f(31)} (+${f(31)} mehr)`,
        `„Jahr": ${f(879)} (+${f(879)} mehr)`,
        `„Gesamt": ${f(6749)} (+${f(6749)} mehr)`,
      ],
    });
  });

  it('cap reached at the widest period → cap message, no ladder', () => {
    expect(
      buildPeriodHint({ period: 'all', currentTotal: 6749, counts: COUNTS, capped: true }),
    ).toEqual({
      buttonLabel: `Maximum (${TOP_PUBS_MAX})`,
      title: `Anzeige auf ${TOP_PUBS_MAX} begrenzt`,
      lead:
        `Im Zeitraum „Gesamt" gibt es ${f(6749)} Publikationen im Pool. `
        + `Angezeigt werden die ersten ${f(TOP_PUBS_MAX)} nach Story Score; `
        + `für die vollständige Liste die Publikationsseite nutzen.`,
      ladder: [],
    });
  });

  it('cap reached at a narrower period → cap message + wider-period ladder', () => {
    const hint = buildPeriodHint({
      period: 'year',
      currentTotal: 879,
      counts: COUNTS,
      capped: true,
    });
    expect(hint.buttonLabel).toBe(`Maximum (${TOP_PUBS_MAX})`);
    expect(hint.lead.endsWith(' Ein größerer Zeitraum enthält noch mehr:')).toBe(true);
    expect(hint.ladder).toEqual([`„Gesamt": ${f(6749)} (+${f(5870)} mehr)`]);
  });
});
