import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Route-Handler-Test für den unbeaufsichtigten Nacht-Ingest: die Bearer-Grenze
// (assertCronSecret) muss VOR jedem Feed-Lauf greifen — ein falscher/fehlender
// Header darf keinen einzigen Import anstoßen. Die drei Runner werden gemockt
// (kein Netz, keine DB); Auth-Kernlogik im Detail testet cron-auth.test.ts.

const runPublicationsDeltaImport = vi.fn();
const runEventsImport = vi.fn();
const runEnrichmentImport = vi.fn();

vi.mock('@/lib/server/ingest/run-publications-delta', () => ({
  runPublicationsDeltaImport: (...a: unknown[]) => runPublicationsDeltaImport(...(a as [])),
}));
vi.mock('@/lib/server/ingest/run-events-import', () => ({
  EVENTS_FEED: 'event_news_grouped',
  runEventsImport: (...a: unknown[]) => runEventsImport(...(a as [])),
}));
vi.mock('@/lib/server/ingest/run-enrichment', () => ({
  runEnrichmentImport: (...a: unknown[]) => runEnrichmentImport(...(a as [])),
}));

const { POST } = await import('./route');
const { _resetCronRateLimiter } = await import('@/lib/server/ingest/cron-auth');

const SECRET = 's'.repeat(48);

const req = (auth?: string) =>
  new NextRequest('http://localhost:3000/api/ingest/run', {
    method: 'POST',
    // Bewusst OHNE Origin: die Route läuft mit csrf:false (Maschinen-Cron),
    // die Same-Origin-Prüfung darf hier nicht greifen.
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  _resetCronRateLimiter();
  process.env.INGEST_CRON_SECRET = SECRET;
  runPublicationsDeltaImport.mockResolvedValue({
    feed: 'publications_incremental_change_2',
    status: 'applied',
    report: { pubs_upserted: 2 },
    warnings: [],
    driftTotal: 0,
    matviewRefreshed: true,
    durationMs: 10,
    generatedAt: null,
  });
  runEventsImport.mockResolvedValue({
    feed: 'event_news_grouped',
    status: 'applied',
    imported: 1,
    updated: 0,
    parsed: 1,
    reason: null,
    durationMs: 5,
  });
  runEnrichmentImport.mockResolvedValue({
    feed: 'enrichment',
    status: 'applied',
    pubs: 2,
    successful: 2,
    partial: 0,
    failed: 0,
    durationMs: 5,
  });
});

afterEach(() => {
  delete process.env.INGEST_CRON_SECRET;
});

describe('POST /api/ingest/run — Cron-Auth-Grenze', () => {
  it('ohne Authorization-Header → 401, KEIN Feed läuft', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized.' });
    expect(runPublicationsDeltaImport).not.toHaveBeenCalled();
    expect(runEventsImport).not.toHaveBeenCalled();
    expect(runEnrichmentImport).not.toHaveBeenCalled();
  });

  it('falsches Bearer-Secret → 401, KEIN Feed läuft', async () => {
    const res = await POST(req('Bearer definitiv-falsch'));
    expect(res.status).toBe(401);
    expect(runPublicationsDeltaImport).not.toHaveBeenCalled();
  });

  it('INGEST_CRON_SECRET unset → 503 (Feature nicht konfiguriert)', async () => {
    delete process.env.INGEST_CRON_SECRET;
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(runPublicationsDeltaImport).not.toHaveBeenCalled();
  });
});

describe('POST /api/ingest/run — autorisierter Lauf', () => {
  it('korrektes Secret → 200 mit Verdict + allen drei Feeds', async () => {
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(false);
    expect(Object.keys(body.feeds).sort()).toEqual([
      'enrichment',
      'event_news_grouped',
      'publications_incremental_change_2',
    ]);
    expect(runPublicationsDeltaImport).toHaveBeenCalledTimes(1);
    expect(runEventsImport).toHaveBeenCalledTimes(1);
    expect(runEnrichmentImport).toHaveBeenCalledTimes(1);
  });

  it('ein Feed-Fehler stoppt die anderen NICHT und wird via describeError gekürzt (HTTP bleibt 200)', async () => {
    // Der 2026-08-22-Fall: err.message ist ein Multi-MB-Query-Payload — die
    // eigentliche Postgres-Diagnose steckt in err.cause.
    const huge = new Error('INSERT ' + 'x'.repeat(5 * 1024 * 1024));
    (huge as Error & { cause?: unknown }).cause = new Error(
      'apply_publications_delta: 4712 publications exceeds max_delta_pubs=2000',
    );
    runPublicationsDeltaImport.mockRejectedValueOnce(huge);

    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200); // Route lief — der Verdict trägt den Fehler.
    const body = await res.json();
    expect(body.ok).toBe(false);
    const feedErr = body.feeds.publications_incremental_change_2;
    expect(feedErr.status).toBe('error');
    // Gekürzt UND mit der Ursache aus err.cause — nie der 5-MB-Payload.
    expect(feedErr.error.length).toBeLessThan(2000);
    expect(feedErr.error).toContain('max_delta_pubs=2000');
    // Die übrigen Feeds sind trotzdem gelaufen.
    expect(runEventsImport).toHaveBeenCalledTimes(1);
    expect(runEnrichmentImport).toHaveBeenCalledTimes(1);
    expect(body.feeds.event_news_grouped.status).toBe('applied');
  });
});
