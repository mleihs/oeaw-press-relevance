/**
 * Shared DOI cleaning and formatting utilities.
 *
 * The ÖAW publication database stores DOIs in multiple formats:
 *   - http://dx.doi.org/10.xxxx/...   (99.5% of entries)
 *   - https://doi.org/10.xxxx/...
 *   - doi:10.xxxx/...
 *   - 10.xxxx/...  (bare DOI)
 *
 * All enrichment clients need the bare DOI (e.g. "10.1093/em/caaf012").
 */

const DOI_PREFIX_RE = /^https?:\/\/(?:dx\.)?doi\.org\//i;
const DOI_SCHEME_RE = /^doi:/i;

/**
 * Strips URL and scheme prefixes from a DOI string and validates it.
 * Returns the bare DOI (e.g. "10.1093/em/caaf012") or null if invalid.
 */
export function cleanDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let doi = raw.trim();

  // Strip http(s)://doi.org/ and http(s)://dx.doi.org/
  doi = doi.replace(DOI_PREFIX_RE, '');

  // Strip doi: prefix
  doi = doi.replace(DOI_SCHEME_RE, '');

  doi = doi.trim();

  // A valid DOI always starts with "10."
  if (!doi.startsWith('10.')) return null;

  return doi;
}

/**
 * Converts a raw DOI (in any format) into a canonical https://doi.org/ URL.
 * Returns null if the DOI is invalid.
 */
export function doiToUrl(raw: string | null | undefined): string | null {
  const doi = cleanDoi(raw);
  if (!doi) return null;
  return `https://doi.org/${doi}`;
}
