// Wiederverwendbarer Enrichment-Runner für den Nacht-Ingest. Reicht ausstehende
// Publikationen (enrichment_status='pending') über die bestehende Kaskade
// (CrossRef → OpenAlex → Unpaywall → Semantic Scholar → PDF) an, damit sie das
// Content-Gate der Kandidaten-View erfüllen und danach bewertbar sind.
//
// Motivation (User-Entscheidung 2026-07-16): „nur enrichen ohne zu bewerten"
// ergibt keinen Sinn, und Enrichment ist die reine Vorstufe zum Scoring — also
// läuft es automatisch beim Import statt über einen separaten Knopf/Modal. Der
// bevorzugte Scoring-Weg bleibt In-Chat (Opus, €0); der „Bewerten"-Button ist
// der Fallback. Scoring selbst bleibt bewusst manuell (kein Auto-Scoring).
//
// emit ist nur die SSE-Senke des Batch-Runners — im unbeaufsichtigten Lauf
// sammeln wir daraus nur das 'complete'-Frame (Stats), sonst No-op.

import {
  enrichmentPayloadToFilters,
  fetchPublicationsForEnrichment,
  runEnrichmentBatch,
} from '@/lib/server/enrichment/batch';

/** Obergrenze je Nacht-Lauf. Bounded, damit ein großer Rückstau die Route nicht
 *  stundenlang belegt; der Rest drainiert über die Folgenächte. Override via
 *  INGEST_ENRICH_LIMIT. */
const DEFAULT_LIMIT = 200;

export interface EnrichmentImportResult {
  feed: 'enrichment';
  /** 'applied' sobald der Lauf lief (auch mit failed-Pubs); 'skipped' wenn nichts anlag. */
  status: 'applied' | 'skipped';
  pubs: number;
  successful: number;
  partial: number;
  failed: number;
  withAbstract: number;
  durationMs: number;
}

export async function runEnrichmentImport(
  opts: { limit?: number } = {},
): Promise<EnrichmentImportResult> {
  const t0 = Date.now();
  const envLimit = Number(process.env.INGEST_ENRICH_LIMIT);
  const limit = opts.limit ?? (Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_LIMIT);

  const filters = enrichmentPayloadToFilters({
    limit,
    include_partial: false,
    include_no_doi: false,
  });
  const pubs = await fetchPublicationsForEnrichment(filters);

  if (pubs.length === 0) {
    return {
      feed: 'enrichment',
      status: 'skipped',
      pubs: 0,
      successful: 0,
      partial: 0,
      failed: 0,
      withAbstract: 0,
      durationMs: Date.now() - t0,
    };
  }

  const stats = { successful: 0, partial: 0, failed: 0, withAbstract: 0 };
  const emit = (type: string, data: unknown): void => {
    if (type === 'complete') {
      const d = (data ?? {}) as Record<string, unknown>;
      stats.successful = Number(d.successful) || 0;
      stats.partial = Number(d.partial) || 0;
      stats.failed = Number(d.failed) || 0;
      stats.withAbstract = Number(d.with_abstract) || 0;
    }
  };

  // Unbeaufsichtigt: kein Client-Abbruch — ein nie ausgelöster Signal-Träger.
  const controller = new AbortController();
  await runEnrichmentBatch({ pubs, abortSignal: controller.signal, emit });

  return {
    feed: 'enrichment',
    status: 'applied',
    pubs: pubs.length,
    ...stats,
    durationMs: Date.now() - t0,
  };
}
