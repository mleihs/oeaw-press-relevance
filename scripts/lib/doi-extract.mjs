// Geteilter DOI-Extraction-Helper — von webdb-import.mjs (ETL) und
// session-pipeline.mjs (doi-backfill) gemeinsam genutzt, damit Drift
// zwischen Import und Bestands-Backfill ausgeschlossen ist.
//
// 2026-04-30-Import zeigte, dass eine schmale Feld-Liste (nur doi_link,
// bibtex, citation_apa/_de/_en) ~197 DOIs DB-weit verschluckte. Diese
// Datei deckt jetzt alle 13 relevanten Felder ab.
//
// Für die laufzeit-API-Clients (lib/enrichment/{crossref,openalex,...})
// gibt es weiterhin lib/enrichment/doi-utils.ts mit anderer Semantik
// (URL-Prefix-Stripping eines schon bekannten DOIs).

const DOI_PATTERN = /10\.\d{4,9}\/[^\s<>"',\\}{]+/;

/**
 * Trailing-Punkte / Query-Strings / Versions-Suffixe entfernen, lowercase.
 * Wirkt NACH der Extraktion (nicht für URL-Prefix-Stripping).
 */
export function cleanDoi(s) {
  return s.replace(/[.,;:]+$/, '').replace(/\?.*$/, '').toLowerCase();
}

/**
 * URL-Prefix entfernen (https?://(dx.)?doi.org/), lowercase.
 * Wirkt auf einen schon-DOI-haltigen String.
 */
export function normalizeDoi(s) {
  return s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim().toLowerCase();
}

/**
 * URL-Slug-Heuristik: viele Verlags-URLs sehen so aus:
 *   https://www.taylorfrancis.com/chapters/edit/10.4324/9781003150398-13/social-security-reforms-...
 * Echter DOI ist `10.4324/9781003150398-13`; alles ab dem nächsten `/` ist
 * ein Article-Slug, nicht Teil des DOIs.
 *
 * Aber Vorsicht: legitime Multi-Segment-DOIs gibt es:
 *   10.1088/1748-0221/12/01/C01046  (IOPscience-Journal-DOI)
 *   10.7551/mitpress/9876.001.0001  (MIT Press)
 *   10.1093/oxfordhb/9780190917081.013.31  (OUP)
 * Diese dürfen nicht gekürzt werden.
 *
 * Schärfere Heuristik: nur kürzen, wenn das Segment NACH dem ersten Suffix-
 * Segment slug-typisch beginnt — `[a-z]{3,}\-` (3+ Kleinbuchstaben gefolgt
 * von Bindestrich). Echte DOI-Folge-Segmente haben keine solche Form.
 *
 * NICHT auf doi_link anwenden — das ist schon eine doi.org-URL und der ganze
 * Pfad IST der DOI.
 */
function stripUrlSlug(doi) {
  let result = doi;
  let prev;
  do {
    prev = result;
    // Slug-Pattern: letztes Segment ist [a-z]{3,}\-[a-z]+ (Wort-mit-Bindestrich)
    result = result.replace(/^(10\.\d{4,9}\/.+)\/[a-z]{3,}-[a-z][a-z0-9\-%.]*$/i, '$1');
    // Article-ID nach bereits gültigem DOI: /\d+ am Ende (z.B. OUP-URLs).
    // Schnitt nur wenn vor dem Numerischen mind. 2 Segmente sind, sonst riskieren wir
    // legitime Article-Number-DOIs (z.B. 10.1051/0004-6361/202142). Heuristik:
    // 4+ Slashes insgesamt = "10.NNNN/journal/article/numID" → cut numID.
    const slashCount = (result.match(/\//g) || []).length;
    if (slashCount >= 3) {
      result = result.replace(/\/\d+$/, '');
    }
  } while (result !== prev);
  return result;
}

/**
 * DOI aus einem freien Text-Feld extrahieren. Liefert null wenn kein
 * Pattern-Match.
 *
 * @param text - das zu durchsuchende Feld
 * @param fromUrl - true wenn die Quelle ein URL-haltiges Feld ist
 *                  (website_link, download_link, url, doi_link). Dann
 *                  wird der Article-Slug nach dem DOI abgeschnitten.
 */
export function extractDoiFromText(text, { fromUrl = false } = {}) {
  if (!text) return null;
  const m = text.match(DOI_PATTERN);
  if (!m) return null;
  const raw = fromUrl ? stripUrlSlug(m[0]) : m[0];
  return cleanDoi(raw);
}

// Reihenfolge spiegelt Verlässlichkeit: doi_link ist immer ein DOI-URL,
// bibtex hat ein explizites `doi = {...}`-Feld; danach Citation-Renderings;
// am Ende Verlags-URLs (URL-Slug-Risiko).
const TEXT_FIELDS_NORMAL = [
  'citation_apa', 'citation_de', 'citation_en',
  'citation', 'citation_cbe', 'citation_harvard',
  'citation_mla', 'citation_vancouver',
  'endnote', 'ris',
];
const URL_FIELDS = ['website_link', 'download_link', 'url'];

/**
 * Erst-Treffer-Extraktion über alle 13 möglichen Felder eines Pub-Rows.
 * Reihenfolge: doi_link → bibtex → citation_apa/_de/_en/_cbe/... → endnote/ris
 *              → website_link/download_link/url (mit Slug-Stripping).
 */
export function extractDoiFromRow(row) {
  if (row.doi_link) {
    // doi.org-URLs: voller Pfad IST der DOI, kein Slug.
    const doi = extractDoiFromText(row.doi_link);
    if (doi) return doi;
  }
  if (row.bibtex) {
    // Bevorzugt das `doi = {...}`/`doi = "..."` Feld; Fallback: Pattern irgendwo im Text.
    const tagged = row.bibtex.match(/doi\s*=\s*[{"]([^}"]+)[}"]/i);
    if (tagged && /^10\.\d{4,9}\//.test(tagged[1])) return cleanDoi(tagged[1]);
    const inline = extractDoiFromText(row.bibtex);
    if (inline) return inline;
  }
  for (const f of TEXT_FIELDS_NORMAL) {
    const doi = extractDoiFromText(row[f]);
    if (doi) return doi;
  }
  for (const f of URL_FIELDS) {
    const doi = extractDoiFromText(row[f], { fromUrl: true });
    if (doi) return doi;
  }
  return null;
}

/**
 * SQL-WHERE-Klausel-Snippet, das Kandidaten-Pubs vorfiltert (Pubs ohne `doi`,
 * aber mit irgendeinem DOI-Pattern in den 14 möglichen Feldern). Eingebettet
 * in Backfill-Queries, um nicht alle 38k Pubs durchzulesen.
 */
export const DOI_CANDIDATE_WHERE_CLAUSE = `
  (doi IS NULL OR doi = '')
  AND (
    bibtex             ~* '10\\.[0-9]{4,9}/' OR
    citation_apa       ~* '10\\.[0-9]{4,9}/' OR
    citation_de        ~* '10\\.[0-9]{4,9}/' OR
    citation_en        ~* '10\\.[0-9]{4,9}/' OR
    citation           ~* '10\\.[0-9]{4,9}/' OR
    citation_cbe       ~* '10\\.[0-9]{4,9}/' OR
    citation_harvard   ~* '10\\.[0-9]{4,9}/' OR
    citation_mla       ~* '10\\.[0-9]{4,9}/' OR
    citation_vancouver ~* '10\\.[0-9]{4,9}/' OR
    endnote            ~* '10\\.[0-9]{4,9}/' OR
    ris                ~* '10\\.[0-9]{4,9}/' OR
    website_link       ~* '10\\.[0-9]{4,9}/' OR
    download_link      ~* '10\\.[0-9]{4,9}/' OR
    url                ~* '10\\.[0-9]{4,9}/' OR
    doi_link IS NOT NULL
  )
`;
