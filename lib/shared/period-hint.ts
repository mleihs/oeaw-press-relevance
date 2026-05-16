// Pure copy/number logic for the dashboard „Mehr laden" terminal state.
//
// When the Top-Pubs panel can't load more rows, the button stays put
// (disabled) and an InfoBubble explains *why* and, dynamically, how many
// more publications a wider period would surface. Keeping this pure (no
// React, deterministic strings incl. de-AT number formatting) makes the
// branching unit-testable in Vitest and keeps the JSX in dashboard-client
// a thin renderer.

import {
  DASHBOARD_PERIODS,
  PERIOD_LABELS,
  TOP_PUBS_MAX,
  type DashboardPeriod,
  type PeriodCounts,
} from './dashboard';

const fmt = (n: number): string => n.toLocaleString('de-AT');

export interface PeriodHint {
  /** Text for the now-disabled button (no „(20 weitere)" suffix). */
  buttonLabel: string;
  /** InfoBubble title. */
  title: string;
  /** Leading sentence of the InfoBubble body. */
  lead: string;
  /** Pre-formatted ladder lines for periods wider than the current one. */
  ladder: string[];
}

/**
 * Build the disabled-button label + InfoBubble content for the three
 * non-loadable states. `currentTotal` is the authoritative pool size for
 * the active period (the same number already shown as „X insgesamt im
 * Pool"); `counts` carries all four period totals from one SQL roundtrip.
 */
export function buildPeriodHint({
  period,
  currentTotal,
  counts,
  capped,
}: {
  period: DashboardPeriod;
  currentTotal: number;
  counts: PeriodCounts;
  capped: boolean;
}): PeriodHint {
  const label = PERIOD_LABELS[period];
  const idx = DASHBOARD_PERIODS.indexOf(period);
  // Periods strictly wider than the current one that would actually add
  // rows. DASHBOARD_PERIODS is smallest-to-largest, so everything after
  // `idx` is wider.
  const ladder = DASHBOARD_PERIODS.slice(idx + 1).flatMap((p) => {
    const delta = counts[p] - currentTotal;
    return delta > 0
      ? [`„${PERIOD_LABELS[p]}": ${fmt(counts[p])} (+${fmt(delta)} mehr)`]
      : [];
  });

  if (capped) {
    return {
      buttonLabel: `Maximum (${TOP_PUBS_MAX})`,
      title: `Anzeige auf ${TOP_PUBS_MAX} begrenzt`,
      lead:
        `Im Zeitraum „${label}" gibt es ${fmt(currentTotal)} Publikationen im Pool. `
        + `Angezeigt werden die ersten ${fmt(TOP_PUBS_MAX)} nach Story Score; `
        + `für die vollständige Liste die Publikationsseite nutzen.`
        + (ladder.length ? ' Ein größerer Zeitraum enthält noch mehr:' : ''),
      ladder,
    };
  }

  if (currentTotal === 0) {
    return {
      buttonLabel: 'Nichts zu laden',
      title: `Keine Publikationen im Zeitraum „${label}"`,
      lead:
        `Im Zeitraum „${label}" gibt es keine analysierten Publikationen.`
        + (ladder.length ? ' Ein größerer Zeitraum zeigt mehr:' : ''),
      ladder,
    };
  }

  return {
    buttonLabel: 'Alle geladen',
    title: `Alle ${fmt(currentTotal)} aus „${label}" geladen`,
    lead: ladder.length
      ? `Alle ${fmt(currentTotal)} Publikationen aus „${label}" sind geladen. Ein größerer Zeitraum zeigt mehr:`
      : `„${label}" ist der größte Zeitraum; alle ${fmt(currentTotal)} Publikationen sind geladen.`,
    ladder,
  };
}
