/**
 * `publication_type.webdb_uid`s that are press-irrelevant by default and
 * hidden when `showAll=false`. Used by both the client-side filter UI
 * (publications page) and the server-side `/api/publications` route.
 *
 * Single source of truth — by importing from one file in both places, drift
 * between client and server lists is structurally impossible (no need for a
 * pin test that catches it after the fact).
 */
export const ELIGIBILITY_EXCLUDE_TYPE_UIDS = [
  5,  // Buch- oder Aufsatzbesprechung
  7,  // Diplomarbeit / Bakkalaureatsarbeit
  8,  // Dissertation
  13, // Habilitationsschrift
  15, // Konferenzbeitrag: Poster (in Proceedingsband)
  19, // Skriptum
  23, // kurze Lexikonbeiträge, summarisch
] as const;
