import { EnrichmentResult } from '../types';
import { cleanDoi } from './doi-utils';

export async function enrichFromSemanticScholar(rawDoi: string): Promise<EnrichmentResult | null> {
  const doi = cleanDoi(rawDoi);
  if (!doi) return null;

  const fields = 'title,abstract,authors,year,publicationDate,openAccessPdf,citationCount,venue,tldr';
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OeAW-Press-Relevance/1.0',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const data = await response.json();

  const abstract = data.abstract || undefined;
  const tldr = data.tldr?.text || '';
  const snippet = abstract || tldr || '';
  const journal = data.venue || undefined;
  const pdfUrl = data.openAccessPdf?.url;

  const fullSnippet = pdfUrl
    ? `${snippet}\n\nOpen access PDF: ${pdfUrl}`
    : snippet;

  // Extract publication date — prefer full date, fallback to year
  let publishedAt: string | undefined;
  if (data.publicationDate && /^\d{4}-\d{2}-\d{2}$/.test(data.publicationDate)) {
    publishedAt = data.publicationDate;
  } else if (data.year) {
    publishedAt = `${data.year}-01-01`;
  }

  return {
    abstract,
    journal,
    source: 'semantic_scholar',
    pdf_url: pdfUrl,
    full_text_snippet: fullSnippet || undefined,
    word_count: snippet ? snippet.split(/\s+/).length : 0,
    published_at: publishedAt,
  };
}
