import { EnrichmentResult } from '@/lib/shared/types';
import { cleanDoi } from '@/lib/shared/doi-utils';
import { apiContactEmail, fetchJson } from '@/lib/server/http-client';

export async function enrichFromUnpaywall(rawDoi: string): Promise<EnrichmentResult | null> {
  const doi = cleanDoi(rawDoi);
  if (!doi) return null;

  // Unpaywall's polite pool requires a contact mail on every request — hier
  // per `?email=`-Query-Param, nicht als UA-Header (deshalb bewusst kein
  // userAgent an fetchJson). apiContactEmail() teilt sich Env-Override +
  // Fallback mit dem polite-UA der anderen Clients.
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${apiContactEmail()}`;

  const data = await fetchJson(url);
  if (data === null) return null;

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
