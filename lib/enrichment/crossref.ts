import { EnrichmentResult } from '@/lib/shared/types';
import { cleanDoi } from './doi-utils';

/**
 * Extracts an ISO date (YYYY-MM-DD) from CrossRef's date-parts format.
 * CrossRef dates come as { "date-parts": [[year, month?, day?]] }
 */
function extractCrossRefDate(dateObj: { 'date-parts'?: number[][] } | undefined): string | undefined {
  if (!dateObj?.['date-parts']?.[0]) return undefined;
  const parts = dateObj['date-parts'][0];
  if (!parts[0]) return undefined;
  const year = parts[0];
  const month = parts[1] ? String(parts[1]).padStart(2, '0') : '01';
  const day = parts[2] ? String(parts[2]).padStart(2, '0') : '01';
  return `${year}-${month}-${day}`;
}

export async function enrichFromCrossRef(rawDoi: string): Promise<EnrichmentResult | null> {
  const doi = cleanDoi(rawDoi);
  if (!doi) return null;

  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OeAW-Press-Relevance/1.0 (mailto:admin@oeaw.ac.at)',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const work = data.message;
  if (!work) return null;

  const abstract = work.abstract
    ? work.abstract.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : undefined;

  const keywords = work.subject as string[] | undefined;
  const journal = Array.isArray(work['container-title']) ? work['container-title'][0] : undefined;

  // Extract publication date — prefer published-print > published-online > issued
  const publishedAt =
    extractCrossRefDate(work['published-print']) ||
    extractCrossRefDate(work['published-online']) ||
    extractCrossRefDate(work['issued']);

  const snippet = abstract || '';

  // Title — CrossRef returns title as array of strings
  const title: string | undefined = Array.isArray(work.title) ? work.title[0] : undefined;

  // Authors — given + family joined
  const authors: string[] = Array.isArray(work.author)
    ? work.author
        .map((a: { given?: string; family?: string }) =>
          [a.given, a.family].filter(Boolean).join(' ').trim(),
        )
        .filter((n: string) => n.length > 0)
    : [];

  return {
    abstract,
    keywords: keywords?.slice(0, 20),
    journal,
    source: 'crossref',
    full_text_snippet: snippet,
    word_count: snippet ? snippet.split(/\s+/).length : 0,
    published_at: publishedAt,
    title,
    authors: authors.length > 0 ? authors : undefined,
  };
}
