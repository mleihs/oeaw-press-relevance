import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

// Die Abfrage hinter der Bewertungs-Kachel, ohne DB geprüft: db.execute wird
// abgefangen und das übergebene SQL-Fragment gerendert. Diese eine Query
// entscheidet, ob die Kachel die Wahrheit sagt — sie muss dieselbe
// Kandidaten-View und denselben 60-Tage-Schnitt verwenden wie der
// Bewerten-Knopf (buildAnalysisScopeWhere) und der Listenfilter
// (scoringScopeClause). Driftet einer der drei, verspricht die Zahl etwas,
// das der Klick nicht einlöst.
const captured: SQL[] = [];
const ROW = {
  pub_unscored: 17,
  pub_backlog: 2354,
  pub_oldest_days: 3,
  pub_last_import: '2026-07-16T04:00:00.000Z',
  pub_last_status: 'applied',
  ev_unscored: 0,
  ev_oldest_days: null,
  ev_last_import: null,
  ev_last_status: null,
};

vi.mock('@/lib/server/db', () => ({
  db: {
    execute: vi.fn(async (q: SQL) => {
      captured.push(q);
      return [ROW];
    }),
  },
}));

const { getScoringStatus } = await import('./status');
const dialect = new PgDialect();

describe('getScoringStatus', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('zählt beide Entitäten aus den kanonischen Kandidaten-Views', async () => {
    await getScoringStatus();
    const { sql } = dialect.sqlToQuery(captured[0]);
    expect(sql).toContain('FROM publication_scoring_candidates');
    expect(sql).toContain('FROM event_scoring_candidates');
  });

  it('teilt die Publikationen am Fenster des Bewerten-Knopfes', async () => {
    await getScoringStatus();
    const { sql, params } = dialect.sqlToQuery(captured[0]);
    // frisch: im Fenster. Altbestand: außerhalb ODER ohne Eingangsdatum —
    // sonst fiele so eine Zeile aus beiden Zahlen heraus und wäre nirgends
    // mehr sichtbar.
    expect(sql).toContain('created_at >= now() - make_interval(days =>');
    expect(sql).toContain('created_at IS NULL OR created_at < now() - make_interval(days =>');
    expect(params.map(String)).toContain(String(SCORING_RECENT_DAYS));
  });

  it('bindet die Tageszahl als Parameter statt sie in die Query zu spleißen', async () => {
    await getScoringStatus();
    const { sql } = dialect.sqlToQuery(captured[0]);
    expect(sql).not.toContain(`${SCORING_RECENT_DAYS} days`);
  });

  it('rechnet das Alter der ältesten nur über das Fenster', async () => {
    await getScoringStatus();
    const { sql } = dialect.sqlToQuery(captured[0]);
    // Die Ampel darf nicht am Altbestand hängen, sonst steht sie dauerhaft
    // auf Rot und warnt vor nichts mehr (AP3).
    const oldest = sql.slice(sql.indexOf('min(created_at)'));
    expect(oldest).toContain('created_at >= now() - make_interval(days =>');
  });

  it('reicht die Zeilenwerte typisiert durch und formatiert das Importdatum', async () => {
    const status = await getScoringStatus();
    expect(status.publications.unscoredCount).toBe(17);
    expect(status.publications.backlogCount).toBe(2354);
    expect(status.publications.oldestUnscoredDays).toBe(3);
    expect(status.publications.lastImportAt).toBe('16.07.2026');
    expect(status.publications.lastImportFailed).toBe(false);
  });

  it('führt für Events keinen Altbestand (event_at >= now begrenzt selbst)', async () => {
    const status = await getScoringStatus();
    expect(status.events.backlogCount).toBe(0);
    expect(status.events.oldestUnscoredDays).toBeNull();
    expect(status.events.lastImportAt).toBeNull();
  });
});
