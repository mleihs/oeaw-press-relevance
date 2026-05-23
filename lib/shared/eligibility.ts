/**
 * `publication_type.webdb_uid`s that are press-irrelevant by default and
 * hidden when `showAll=false`.
 *
 * This is the **client-side mirror**: the publications-page filter UI runs
 * in the browser and cannot query Postgres, so it needs a TS copy of the
 * list. The **canonical server/SQL source** is the PG view
 * `ineligible_publication_types` (migration 20260516000002) — the server
 * (`fetchBadTypeIds`), `publication_period_counts`, and
 * `publication_dashboard_stats` all resolve through it, so the UID list is
 * not re-encoded anywhere else. The browser copy and the PG view are kept
 * from drifting by `scripts/smoke/eligibility.ts` (parity assertion).
 */
export const ELIGIBILITY_EXCLUDE_TYPE_UIDS = [
  3,  // Beitrag in Magazin/Zeitung
  5,  // Buch- oder Aufsatzbesprechung
  7,  // Diplomarbeit / Bakkalaureatsarbeit
  8,  // Dissertation
  13, // Habilitationsschrift
  15, // Konferenzbeitrag: Poster (in Proceedingsband)
  19, // Skriptum
  23, // kurze Lexikonbeiträge, summarisch
] as const;
