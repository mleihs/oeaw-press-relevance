import { EnrichmentResult } from '@/lib/shared/types';

// Block obvious SSRF targets. `pdfUrl` comes from third-party metadata APIs
// (OpenAlex/Unpaywall/Semantic Scholar) keyed off a DOI, so it's semi-trusted;
// this guards against a poisoned response pointing the server-side fetch at a
// non-http scheme or a literal private/loopback/link-local address. (Hostnames
// that *resolve* to private IPs would need a resolving fetch wrapper — out of
// scope; this stops the literal-address cases.)
const PRIVATE_HOST =
  /^(?:localhost|0\.0\.0\.0|127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?(?:::1|fc|fd|fe80))/i;
function isSafeFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return !PRIVATE_HOST.test(u.hostname);
}

/**
 * Downloads a PDF from `pdfUrl`, extracts text from the first few pages,
 * and attempts to locate the abstract section.
 *
 * This is used as a last-resort enrichment source when metadata APIs
 * (CrossRef, OpenAlex, etc.) don't return an abstract.
 */
export async function enrichFromPdf(pdfUrl: string): Promise<EnrichmentResult | null> {
  if (!pdfUrl) return null;
  if (!isSafeFetchUrl(pdfUrl)) return null;

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

    // Opening pages: a journal abstract is on page 1, but reports, monographs
    // and OA booklets carry their summary or introduction several pages in,
    // behind cover and front matter — so read 12, not 3.
    const textResult = await pdf.getText({ first: 12 });
    const fullText = textResult.text;

    if (!fullText || fullText.length < 50) return null;

    // Formal-abstract finder first; fall back to the leading body prose for
    // documents that have no abstract section (reports, monographs, booklets).
    const abstract = extractAbstract(fullText) || extractLeadingBody(fullText);

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

/**
 * Fallback for documents with no recognisable abstract section (ministry
 * reports, monographs, working papers, OA booklets). Returns the first
 * substantial block of running prose, skipping cover / imprint /
 * table-of-contents front matter.
 *
 * Correct for single-work PDFs. For a *container* PDF — a whole magazine, a
 * multi-chapter synopsis booklet — it returns the leading item's prose, which
 * need not match the specific publication record; WebDB PDF links are a mix of
 * both, so a body-prose result is best-effort, not authoritative.
 */
function extractLeadingBody(rawText: string): string | null {
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/-\n(?=\p{Ll})/gu, '')                          // join soft-hyphenated words
    .replace(/\n\s*--\s*\d+\s*of\s*\d+\s*--\s*\n/gi, '\n');  // PDFParse page markers

  const rawLines = cleaned.split('\n').map((l) => l.trim());

  // Drop running headers / footers — lines that recur across pages once their
  // digits are masked (e.g. "Report Title 6 von 103" -> "Report Title # von #").
  const mask = (l: string) => l.replace(/\d+/g, '#');
  const freq = new Map<string, number>();
  for (const l of rawLines) {
    if (l) freq.set(mask(l), (freq.get(mask(l)) ?? 0) + 1);
  }
  const lines = rawLines.filter((l) => !l || (freq.get(mask(l)) ?? 0) < 3);

  const IMPRINT =
    /\b(Impressum|Imprint|Medieninhaber|Herausgeber|Copyright|ISBN|ISSN|Fotonachweis|Bildnachweis|Redaktion|Lektorat|Auflage|Künye|Mentions)\b/i;
  const isProse = (s: string): boolean => {
    if (s.length < 60) return false;          // heading / list item / caption
    if (IMPRINT.test(s)) return false;        // imprint block
    if (/\.{4,}/.test(s)) return false;       // table-of-contents dot leader
    if (!/[a-zäöüß]/.test(s)) return false;   // all-caps cover line
    const letters = (s.match(/\p{L}/gu) ?? []).length;
    return letters / s.length >= 0.6;         // not mostly digits / symbols
  };

  // First run of consecutive prose lines worth at least 400 chars.
  let buf: string[] = [];
  let chars = 0;
  for (const line of lines) {
    if (isProse(line)) {
      buf.push(line);
      chars += line.length + 1;
      if (chars >= 2400) break;
    } else if (chars >= 400) {
      break;
    } else {
      buf = [];
      chars = 0;
    }
  }
  if (chars < 400) return null;

  let body = buf.join(' ').replace(/\s+/g, ' ').trim();
  if (body.length > 2200) {
    const cut = body.lastIndexOf('. ', 2200);
    body = cut > 1200 ? body.slice(0, cut + 1) : body.slice(0, 2200);
  }
  return body.length >= 200 ? body : null;
}
