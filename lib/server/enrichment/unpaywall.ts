import { EnrichmentResult } from '@/lib/shared/types';
import { cleanDoi } from '@/lib/shared/doi-utils';

export async function enrichFromUnpaywall(rawDoi: string): Promise<EnrichmentResult | null> {
  const doi = cleanDoi(rawDoi);
  if (!doi) return null;

  // Unpaywall's polite pool requires a contact mail on every request. Override
  // via API_CONTACT_EMAIL (shared with the Crossref/OpenAlex scripts); the
  // fallback keeps local dev working without extra config.
  const email = process.env.API_CONTACT_EMAIL || 'admin@oeaw.ac.at';
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${email}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const data = await response.json();

  const journal = data.journal_name || undefined;
  const pdfUrl = data.best_oa_location?.url_for_pdf || data.best_oa_location?.url || null;
  const isOa = !!data.is_oa;

  // Extract publication date
  let publishedAt: string | undefined;
  if (data.published_date && /^\d{4}-\d{2}-\d{2}$/.test(data.published_date)) {
    publishedAt = data.published_date;
  } else if (data.year) {
    publishedAt = `${data.year}-01-01`;
  }

  // Return useful metadata even for non-OA publications (journal name, etc.)
  if (!journal && !pdfUrl && !publishedAt) return null;

  return {
    journal,
    source: 'unpaywall',
    pdf_url: isOa && pdfUrl ? pdfUrl : undefined,
    full_text_snippet: isOa && pdfUrl ? `Open access PDF available: ${pdfUrl}` : undefined,
    word_count: 0,
    published_at: publishedAt,
  };
}
