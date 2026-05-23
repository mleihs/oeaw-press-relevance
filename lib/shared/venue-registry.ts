/**
 * Curated registry of well-known venues (newspapers, magazines, …) that
 * publication enrichment commonly hits. Lets the UI render a venue kind
 * and an authoritative domain link instead of treating every venue as a
 * scholarly journal, and lets buildWhere expand a filter param onto the
 * full canonical group when the corpus stores the same outlet under
 * several spellings.
 *
 * Source of truth is this TS file; an entry is "known" if its
 * canonicalName matches (whitespace-collapsed, case-insensitive) or one
 * of its aliases does. Unknown venues fall back to a generic "Erschienen
 * in" label, no domain link, and strict exact-match filtering — honest,
 * never a false "Journal" claim and no surprise expansion.
 *
 * Extending: add an entry to KNOWN_VENUES below. For aliases, include any
 * spelling that has shown up in `enriched_journal` for the same outlet
 * (e.g. "DerStandard.at", "Der Standard [Blog]" both alias "Der Standard").
 * The corpus query to surface candidate aliases for an outlet:
 *
 *   SELECT enriched_journal, count(*)
 *   FROM publications
 *   WHERE enriched_journal ILIKE '%<outlet-keyword>%'
 *   GROUP BY enriched_journal ORDER BY count(*) DESC;
 */

export type VenueKind =
  | 'newspaper'
  | 'magazine'
  | 'journal'
  | 'proceedings'
  | 'collection'
  | 'publisher'
  | 'institution';

export interface VenueMetadata {
  canonicalName: string;
  kind: VenueKind;
  /** Bare domain without scheme, e.g. 'diepresse.com'. */
  domain?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. 'AT'. */
  country?: string;
  /** Other spellings that have appeared as `enriched_journal` for this outlet. */
  aliases?: string[];
}

const KNOWN_VENUES: VenueMetadata[] = [
  // Austrian Tageszeitungen
  { canonicalName: 'Die Presse',             kind: 'newspaper', domain: 'diepresse.com',     country: 'AT' },
  { canonicalName: 'Der Standard',           kind: 'newspaper', domain: 'derstandard.at',    country: 'AT',
    aliases: ['DerStandard.at', 'Der Standard [Blog]', 'Der Standard, Blog: Geschichte Österreichs'] },
  { canonicalName: 'Kronen Zeitung',         kind: 'newspaper', domain: 'krone.at',          country: 'AT' },
  { canonicalName: 'Kleine Zeitung',         kind: 'newspaper', domain: 'kleinezeitung.at',  country: 'AT' },
  { canonicalName: 'Wiener Zeitung',         kind: 'newspaper', domain: 'wienerzeitung.at',  country: 'AT' },
  { canonicalName: 'Tiroler Tageszeitung',   kind: 'newspaper', domain: 'tt.com',            country: 'AT',
    aliases: ['Tiroler Tageszeitung, Blick von außen'] },
  { canonicalName: 'Salzburger Nachrichten', kind: 'newspaper', domain: 'sn.at',             country: 'AT' },
  { canonicalName: 'Kurier',                 kind: 'newspaper', domain: 'kurier.at',         country: 'AT' },
  { canonicalName: 'OÖ Nachrichten',         kind: 'newspaper', domain: 'nachrichten.at',    country: 'AT' },
  { canonicalName: 'Heute',                  kind: 'newspaper', domain: 'heute.at',          country: 'AT' },

  // Austrian Wochen / Magazine
  { canonicalName: 'Falter',                 kind: 'newspaper', domain: 'falter.at',         country: 'AT' },
  { canonicalName: 'profil',                 kind: 'magazine',  domain: 'profil.at',         country: 'AT' },
  { canonicalName: 'News',                   kind: 'magazine',  domain: 'news.at',           country: 'AT' },
  { canonicalName: 'trend',                  kind: 'magazine',  domain: 'trend.at',          country: 'AT' },
  { canonicalName: 'Thema. Das Forschungsmagazin der ÖAW',
                                             kind: 'magazine',  domain: 'oeaw.ac.at',        country: 'AT',
    aliases: ['Thema - Das Forschungsmagazin der ÖAW'] },

  // Austrian Online
  { canonicalName: 'ORF.at',                 kind: 'newspaper', domain: 'orf.at',            country: 'AT' },

  // German news
  { canonicalName: 'Süddeutsche Zeitung',    kind: 'newspaper', domain: 'sueddeutsche.de',   country: 'DE' },
  { canonicalName: 'Frankfurter Allgemeine Zeitung',
                                             kind: 'newspaper', domain: 'faz.net',           country: 'DE',
    aliases: ['FAZ'] },
  { canonicalName: 'Die Zeit',               kind: 'newspaper', domain: 'zeit.de',           country: 'DE' },
  { canonicalName: 'Der Spiegel',            kind: 'magazine',  domain: 'spiegel.de',        country: 'DE' },

  // Swiss news
  { canonicalName: 'Neue Zürcher Zeitung',   kind: 'newspaper', domain: 'nzz.ch',            country: 'CH',
    aliases: ['NZZ'] },
];

/**
 * Normalize a string for venue matching: trim, collapse runs of whitespace,
 * lower-case. Applied to both the input and the candidate names/aliases so
 * "Tiroler  Tageszeitung", "tiroler tageszeitung" and "Tiroler Tageszeitung"
 * all resolve to the same entry.
 */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Look up a venue by its canonical name or any known alias. Whitespace and
 * case are normalized on both sides. Returns null for unknown venues — the
 * caller decides on the fallback (typically: render the raw string as-is,
 * or filter on exact equality).
 */
export function lookupVenue(name: string | null | undefined): VenueMetadata | null {
  if (!name) return null;
  const n = normalize(name);
  if (!n) return null;
  for (const v of KNOWN_VENUES) {
    if (normalize(v.canonicalName) === n) return v;
    if (v.aliases?.some((a) => normalize(a) === n)) return v;
  }
  return null;
}

/**
 * Full set of corpus spellings for one outlet: the canonical name plus
 * all known aliases. Used by buildWhere to expand `?journal=X` filters
 * onto the whole canonical group. Returns null for unknown venues so the
 * caller can fall back to strict exact-match.
 */
export function venueGroupSpellings(name: string | null | undefined): string[] | null {
  const meta = lookupVenue(name);
  if (!meta) return null;
  return [meta.canonicalName, ...(meta.aliases ?? [])];
}

const KIND_LABEL_DE: Record<VenueKind, string> = {
  newspaper: 'Tageszeitung',
  magazine: 'Magazin',
  journal: 'Journal',
  proceedings: 'Proceedings',
  collection: 'Sammelwerk',
  publisher: 'Verlag',
  institution: 'Institution',
};

/**
 * German UI label for a venue value, driven by the venue's kind in the
 * registry. Drives the SectionLabel on the publication detail page. Falls
 * back to a neutral "Erschienen in" when the venue is unknown to the
 * registry — never a false "Journal" claim.
 */
export function venueDisplayLabel(name: string | null | undefined): string {
  const meta = lookupVenue(name);
  if (!meta) return 'Erschienen in';
  return KIND_LABEL_DE[meta.kind];
}
