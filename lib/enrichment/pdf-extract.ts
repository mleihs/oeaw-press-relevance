import { EnrichmentResult } from '../types';

/**
 * Downloads a PDF from `pdfUrl`, extracts text from the first few pages,
 * and attempts to locate the abstract section.
 *
 * This is used as a last-resort enrichment source when metadata APIs
 * (CrossRef, OpenAlex, etc.) don't return an abstract.
 */
export async function enrichFromPdf(pdfUrl: string): Promise<EnrichmentResult | null> {
  if (!pdfUrl) return null;

  // Dynamic import — pdf-parse depends on pdfjs-dist which is heavy;
  // only load it when we actually need to parse a PDF.
  const { PDFParse } = await import('pdf-parse');

  let pdf: InstanceType<typeof PDFParse> | null = null;

  try {
    // Download PDF with size limit (10 MB) and timeout
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'OeAW-Press-Relevance/1.0 (mailto:admin@oeaw.ac.at)',
        'Accept': 'application/pdf',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    // Some URLs redirect to HTML login pages instead of the actual PDF
    if (contentType.includes('text/html')) return null;

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) return null; // Skip PDFs > 10 MB

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 10 * 1024 * 1024) return null;

    pdf = new PDFParse({ data: new Uint8Array(buffer) });

    // Extract text from first 3 pages only (abstract is always at the start)
    const textResult = await pdf.getText({ first: 3 });
    const fullText = textResult.text;

    if (!fullText || fullText.length < 50) return null;

    // Try to extract abstract from the text
    const abstract = extractAbstract(fullText);

    // Build a snippet from the first ~2000 chars of the full text
    const snippet = fullText.slice(0, 2000).trim();
    const wordCount = snippet.split(/\s+/).length;

    return {
      abstract: abstract || undefined,
      source: 'pdf',
      full_text_snippet: snippet,
      word_count: wordCount,
    };
  } catch {
    return null;
  } finally {
    if (pdf) {
      try { await pdf.destroy(); } catch { /* ignore cleanup errors */ }
    }
  }
}

/**
 * Finds where affiliation text ends in a flattened title+affiliations+abstract block.
 * Looks for common markers: country names, email patterns, asterisk footnotes.
 * Returns the character index after the last affiliation marker.
 */
function findLastAffiliationEnd(text: string): number {
  // Common country names at the end of affiliation lines
  const countries = /\b(?:Austria|Germany|Switzerland|USA|UK|United Kingdom|United States|France|Italy|Spain|Netherlands|Sweden|Japan|China|Australia|Canada|Israel|Belgium|Czech Republic|Poland|Denmark|Norway|Finland|Hungary|Portugal|Brazil|India|South Korea|Taiwan|Singapore)\b/gi;

  // Email patterns
  const emails = /[\w.-]+@[\w.-]+\.\w{2,}/g;

  // Asterisk/dagger footnote markers common in affiliations
  const footnotes = /[*\u2020\u2021\u00a7]\s*(?:These authors|Corresponding|Current address|E-mail)/gi;

  let lastPos = -1;

  for (const pattern of [countries, emails, footnotes]) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const endPos = match.index + match[0].length;
      if (endPos > lastPos) {
        lastPos = endPos;
      }
    }
  }

  return lastPos;
}

/**
 * Attempts to find an abstract/summary section in the extracted PDF text.
 *
 * Handles multiple journal formats:
 *   1. Explicit "Abstract" / "ABSTRACT" / "Summary" header
 *   2. PLoS/PNAS style: abstract text sits between affiliations and "Citation:"
 *   3. Generic: text block before "Introduction" that looks like an abstract
 */
function extractAbstract(text: string): string | null {
  const normalized = text.replace(/\r\n/g, '\n');

  // Section terminators — these typically follow the abstract
  const terminators = /(?:\n\s*(?:Keywords?|Key\s*words|Introduction|1\s*[\.\)]|INTRODUCTION|KEYWORDS|Citation:|Author\s+Summary|Editor's?\s+Summary|Background)\b|\n\n\n)/i;

  // Strategy 1: Explicit "Abstract" or "Summary" header
  for (const header of [/\bAbstract\b/i, /\bSummary\b/i, /\bZusammenfassung\b/i]) {
    const headerMatch = normalized.match(header);
    if (headerMatch && headerMatch.index !== undefined) {
      const afterHeader = normalized.slice(headerMatch.index + headerMatch[0].length);
      const cleaned = afterHeader.replace(/^[:\s.\-]+/, '');
      const endMatch = cleaned.match(terminators);
      if (endMatch && endMatch.index !== undefined) {
        const candidate = cleaned.slice(0, endMatch.index)
          .replace(/\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (candidate.length >= 100 && candidate.length <= 3000) {
          return candidate;
        }
      }
    }
  }

  // Strategy 2: PLoS/Nature style — text between country/email markers and "Citation:"/"Introduction"
  // Many PDFs merge title+affiliations+abstract into one block. We detect the abstract
  // by finding where affiliations end (country names, email-like patterns) and prose begins.
  const citationIdx = normalized.search(/\nCitation:/i);
  const introIdx = normalized.search(/\nIntroduction\b/i);
  const endIdx = citationIdx > 0 ? citationIdx : introIdx;

  if (endIdx > 200) {
    const beforeEnd = normalized.slice(0, endIdx).replace(/\n/g, ' ').replace(/\s+/g, ' ');

    // Find where affiliations likely end: last country name or email-like pattern
    // Then prose (the abstract) follows
    const affiliationEnd = findLastAffiliationEnd(beforeEnd);
    if (affiliationEnd > 0) {
      const candidate = beforeEnd.slice(affiliationEnd).trim();
      if (candidate.length >= 100 && candidate.length <= 3000 && candidate.includes('. ')) {
        return candidate;
      }
    }
  }

  // Strategy 3: No section terminator found (e.g. ArXiv) —
  // use affiliation detection on the full first-page text and take
  // the prose block that follows, capped at ~2000 chars
  const flat = normalized.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const affiliationEnd = findLastAffiliationEnd(flat);
  if (affiliationEnd > 100) {
    // Strip leading punctuation/whitespace left over from the affiliation line
    let candidate = flat.slice(affiliationEnd).replace(/^[\s.,;:*\u2020\u2021\u00a7]+/, '').trim();
    // Cap at a reasonable abstract length
    if (candidate.length > 2000) {
      // Try to cut at a sentence boundary
      const cutPoint = candidate.lastIndexOf('. ', 2000);
      if (cutPoint > 500) {
        candidate = candidate.slice(0, cutPoint + 1);
      } else {
        candidate = candidate.slice(0, 2000);
      }
    }
    if (candidate.length >= 100 && candidate.includes('. ') && /^[A-Z]/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}
