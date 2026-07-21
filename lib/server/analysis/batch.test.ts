import { describe, it, expect } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildAnalysisScopeWhere } from './batch';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

// Wie lib/server/events/list.test.ts: den Drizzle-Filter ohne DB in seinen
// parametrisierten Text rendern, damit die beiden Scope-Gates des teuren
// OpenRouter-Pfades testbar sind (Regression zu docs/RESUME_SCORING_SPLIT_REVIEW:
// force lief bis 2026-07-21 mit `where: undefined`, also über ALLES).
const dialect = new PgDialect();
const render = (s: SQL) => {
  const { sql, params } = dialect.sqlToQuery(s);
  return { sql, params: params.map(String) };
};

describe('buildAnalysisScopeWhere — Scope des Bewerten-Knopfes', () => {
  it('nimmt ohne force die offenen Kandidaten aus der kanonischen View', () => {
    const { sql } = render(buildAnalysisScopeWhere({ limit: 200, batchSize: 3, forceReanalyze: false }));
    expect(sql).toContain('publication_scoring_candidates');
    expect(sql).not.toContain('publication_rescore_pool');
  });

  it('nimmt mit force den Re-Score-Pool statt gar keiner Bedingung', () => {
    const { sql } = render(
      buildAnalysisScopeWhere({ limit: 200, batchSize: 3, forceReanalyze: true }),
    );
    expect(sql).toContain('publication_rescore_pool');
    expect(sql).not.toContain('publication_scoring_candidates');
  });

  it.each([false, true])(
    'begrenzt auch bei forceReanalyze=%s auf das created_at-Fenster',
    (forceReanalyze) => {
      const { sql, params } = render(
        buildAnalysisScopeWhere({ limit: 200, batchSize: 3, forceReanalyze }),
      );
      expect(sql).toContain('"created_at" >= now() - make_interval(days =>');
      expect(params).toContain(String(SCORING_RECENT_DAYS));
    },
  );

  it('schneidet benannte ids mit dem Pool, statt sie durchzuwinken', () => {
    const ids = ['11111111-2222-3333-4444-555555555555'];
    const { sql, params } = render(
      buildAnalysisScopeWhere({ limit: 200, batchSize: 3, forceReanalyze: false, ids }),
    );
    expect(sql).toContain('publication_scoring_candidates');
    expect(sql).toContain('= ANY($1::uuid[])');
    expect(params).toContain(String(ids));
  });

  it('lässt bei benannten ids das Zeitfenster weg (die Auswahl ist der Scope)', () => {
    const { sql } = render(
      buildAnalysisScopeWhere({
        limit: 200,
        batchSize: 3,
        forceReanalyze: false,
        ids: ['11111111-2222-3333-4444-555555555555'],
      }),
    );
    expect(sql).not.toContain('make_interval');
  });

  it('bindet die Tageszahl als Parameter (kein String-Splicing in die Query)', () => {
    const { sql } = render(buildAnalysisScopeWhere({ limit: 200, batchSize: 3, forceReanalyze: false }));
    expect(sql).not.toContain(`${SCORING_RECENT_DAYS} days`);
    expect(sql).toContain('$1::int');
  });
});
