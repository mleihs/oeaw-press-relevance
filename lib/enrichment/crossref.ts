import { EnrichmentResult } from '../types';
import { cleanDoi } from './doi-utils';

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

  const snippet = abstract || '';

  return {
    abstract,
    keywords: keywords?.slice(0, 20),
    journal,
    source: 'crossref',
    full_text_snippet: snippet,
    word_count: snippet ? snippet.split(/\s+/).length : 0,
  };
}
