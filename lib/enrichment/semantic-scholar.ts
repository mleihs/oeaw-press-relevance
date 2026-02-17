import { EnrichmentResult } from '../types';

export async function enrichFromSemanticScholar(doi: string): Promise<EnrichmentResult | null> {
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '').trim();
  if (!cleanDoi) return null;

  const fields = 'title,abstract,authors,year,openAccessPdf,citationCount,venue,tldr';
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=${fields}`;

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

  return {
    abstract,
    journal,
    source: 'semantic_scholar',
    full_text_snippet: fullSnippet || undefined,
    word_count: snippet ? snippet.split(/\s+/).length : 0,
  };
}
