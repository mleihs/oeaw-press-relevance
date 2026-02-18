import { EnrichmentResult } from '../types';
import { cleanDoi } from './doi-utils';

/**
 * Reconstructs a plain-text abstract from OpenAlex's inverted index format.
 *
 * OpenAlex stores abstracts as `{ "word": [pos1, pos2], ... }` to save space.
 * We expand this back into the original sentence order.
 */
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: Array<[number, string]> = [];

  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }

  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, w]) => w).join(' ');
}

export async function enrichFromOpenAlex(rawDoi: string): Promise<EnrichmentResult | null> {
  const doi = cleanDoi(rawDoi);
  if (!doi) return null;

  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OeAW-Press-Relevance/1.0 (mailto:admin@oeaw.ac.at)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const data = await response.json();

  // Reconstruct abstract from inverted index
  let abstract: string | undefined;
  if (data.abstract_inverted_index && typeof data.abstract_inverted_index === 'object') {
    const reconstructed = reconstructAbstract(data.abstract_inverted_index);
    if (reconstructed.length > 20) {
      abstract = reconstructed;
    }
  }

  // Extract keywords from concepts and topics
  const keywords: string[] = [];
  if (Array.isArray(data.concepts)) {
    for (const concept of data.concepts) {
      if (concept.display_name && concept.score > 0.3) {
        keywords.push(concept.display_name);
      }
    }
  }
  if (Array.isArray(data.topics)) {
    for (const topic of data.topics.slice(0, 5)) {
      if (topic.display_name && !keywords.includes(topic.display_name)) {
        keywords.push(topic.display_name);
      }
    }
  }

  // Journal name
  const journal =
    data.primary_location?.source?.display_name ||
    data.host_venue?.display_name ||
    undefined;

  // OA PDF URL
  const pdfUrl =
    data.best_oa_location?.pdf_url ||
    data.primary_location?.pdf_url ||
    undefined;

  const snippet = abstract || '';
  const fullSnippet = pdfUrl
    ? `${snippet}\n\nOpen access PDF: ${pdfUrl}`
    : snippet;

  // Extract publication date — prefer full date, fallback to year
  let publishedAt: string | undefined;
  if (data.publication_date && /^\d{4}-\d{2}-\d{2}$/.test(data.publication_date)) {
    publishedAt = data.publication_date;
  } else if (data.publication_year) {
    publishedAt = `${data.publication_year}-01-01`;
  }

  if (!abstract && !journal && keywords.length === 0) return null;

  return {
    abstract,
    keywords: keywords.length > 0 ? keywords.slice(0, 20) : undefined,
    journal,
    source: 'openalex',
    pdf_url: pdfUrl,
    full_text_snippet: fullSnippet || undefined,
    word_count: snippet ? snippet.split(/\s+/).length : 0,
    published_at: publishedAt,
  };
}
