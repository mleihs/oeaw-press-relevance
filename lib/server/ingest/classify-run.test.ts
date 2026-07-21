import { describe, it, expect } from 'vitest';
import { classifyRun, DRIFT_ALARM_THRESHOLD } from './classify-run';

// Die Regel, die entscheidet, ob nachts jemand eine Mail bekommt. Die Fixtures
// unten sind die ECHTEN Läufe vom 20./21.07.2026, die beide zu Unrecht Alarm
// ausgelöst haben — sie sind hier als Regressionstests festgenagelt.

const DRIFT_WARNING =
  '1 orphan link(s), 0 unresolved lookup(s): likely drift vs. the full corpus; ' +
  'schedule/verify a full reconciliation.';

describe('classifyRun', () => {
  it('reports a clean run as ok and not degraded', () => {
    const v = classifyRun({
      publications_incremental_change_2: { status: 'applied', warnings: [], driftTotal: 0 },
      event_news_grouped: { status: 'applied' },
      enrichment: { status: 'applied' },
    });

    expect(v.ok).toBe(true);
    expect(v.degraded).toBe(false);
    expect(v.summary).toBe('alle Feeds sauber');
  });

  // 2026-07-21: 3 Pubs + 1 Event sauber importiert; eine Junction zeigte auf
  // einen Personensatz, den der OeAW-Export selbst leer ausgeliefert hat. Das
  // kippte den Lauf auf ok:false → Sentry-Error (high) + Mail an websites@.
  it('does NOT alarm when a successful import carries a single drift warning', () => {
    const v = classifyRun({
      publications_incremental_change_2: {
        status: 'applied',
        warnings: [DRIFT_WARNING],
        driftTotal: 1,
      },
      event_news_grouped: { status: 'applied' },
      enrichment: { status: 'applied' },
    });

    expect(v.ok).toBe(true); // <- kein Alarm, keine Mail
    expect(v.degraded).toBe(true); // <- aber sichtbar
    expect(v.drift).toBe(1);
    expect(v.warnings[0]).toContain('publications_incremental_change_2:');
  });

  // 2026-07-20: Events-Feed war intakt, hatte nur nichts Neues. Unter der neuen
  // Klassifikation liefert der Runner dafür 'skipped' statt 'failed'.
  it('does NOT alarm when a feed is skipped', () => {
    const v = classifyRun({
      publications_incremental_change_2: { status: 'applied', warnings: [], driftTotal: 0 },
      event_news_grouped: { status: 'skipped', reason: 'Feed ist intakt, enthält aber keine Events' },
      enrichment: { status: 'applied' },
    });

    expect(v.ok).toBe(true);
    expect(v.degraded).toBe(false);
  });

  it('alarms on a genuinely failed feed and names it in the summary', () => {
    const v = classifyRun({
      publications_incremental_change_2: { status: 'applied', warnings: [], driftTotal: 0 },
      event_news_grouped: {
        status: 'failed',
        reason: 'Feed enthält keine Institutsgruppe, Export vermutlich defekt',
      },
      enrichment: { status: 'applied' },
    });

    expect(v.ok).toBe(false);
    expect(v.degraded).toBe(false);
    expect(v.summary).toContain('event_news_grouped failed');
    expect(v.summary).toContain('Institutsgruppe');
    expect(v.failed).toEqual([
      {
        feed: 'event_news_grouped',
        status: 'failed',
        reason: 'Feed enthält keine Institutsgruppe, Export vermutlich defekt',
      },
    ]);
  });

  it('alarms on a thrown feed, surfacing the error message', () => {
    const v = classifyRun({
      publications_incremental_change_2: { status: 'error', error: 'connect ETIMEDOUT' },
      event_news_grouped: { status: 'applied' },
      enrichment: { status: 'applied' },
    });

    expect(v.ok).toBe(false);
    expect(v.summary).toContain('connect ETIMEDOUT');
  });

  // Die Gegenprobe zum stillen degraded-Pfad: massenhafte Drift ist KEIN
  // Rauschen mehr und darf nicht lautlos durchrutschen.
  it('escalates to a real alarm once drift crosses the threshold', () => {
    const v = classifyRun({
      publications_incremental_change_2: {
        status: 'applied',
        warnings: [DRIFT_WARNING],
        driftTotal: DRIFT_ALARM_THRESHOLD,
      },
      event_news_grouped: { status: 'applied' },
      enrichment: { status: 'applied' },
    });

    expect(v.ok).toBe(false);
    expect(v.degraded).toBe(false);
    expect(v.summary).toContain('Drift-Signale');
    expect(v.summary).toContain('Reconciliation');
  });

  it('stays silent just below the threshold', () => {
    const v = classifyRun({
      publications_incremental_change_2: {
        status: 'applied',
        warnings: [DRIFT_WARNING],
        driftTotal: DRIFT_ALARM_THRESHOLD - 1,
      },
    });

    expect(v.ok).toBe(true);
    expect(v.degraded).toBe(true);
  });

  it('sums drift across feeds', () => {
    const v = classifyRun({
      a: { status: 'applied', warnings: ['w'], driftTotal: 3 },
      b: { status: 'applied', warnings: ['w'], driftTotal: 4 },
    });

    expect(v.drift).toBe(7);
    expect(v.warnings).toHaveLength(2);
  });
});
