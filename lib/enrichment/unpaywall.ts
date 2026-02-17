import { EnrichmentResult } from '../types';

export async function enrichFromUnpaywall(doi: string): Promise<EnrichmentResult | null> {
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '').trim();
  if (!cleanDoi) return null;

  const email = 'admin@oeaw.ac.at';
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=${email}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (!data.is_oa) return null;

  const pdfUrl = data.best_oa_location?.url_for_pdf || data.best_oa_location?.url || null;
  const journal = data.journal_name || undefined;

  return {
    journal,
    source: 'unpaywall',
    full_text_snippet: pdfUrl ? `Open access PDF available: ${pdfUrl}` : undefined,
    word_count: 0,
  };
}
