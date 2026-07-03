// TYPO3-events SourceAdapter (variant of ADR 0017). Pulls upcoming event
// rows from the WEBDB MySQL (tx_news_domain_model_news WHERE is_event=1, the
// EXT:news_eventnews flag) and normalises them into a Drizzle-insert shape.
//
// Variant rationale: the full SourceAdapter<RawWebdb> -> CanonicalBatch
// pipeline (loader.ts + upsert.ts) targets a 10+ table relational graph
// with junction-table consistency. Events sync is one table, no junctions
// and no relation upserts to keep transactional — wrapping that in
// CanonicalBatch would be ceremony without payoff. The valuable half of the
// ADR — pure synchronous `normalize` — is preserved verbatim.
//
// Reuses: tsTimestamp, nullIfEmpty (./webdb-normalize) and
// webdbMysqlConfigFromEnv + WebdbMysqlConfig (./webdb). DB-side UPSERT
// lives in lib/server/events/sync.ts (business-logic layer), keeping this
// module free of `db` / Drizzle imports so the normalise step stays
// trivially unit-testable.

import mysql from 'mysql2/promise';
import * as cheerio from 'cheerio';
import {
  webdbMysqlConfigFromEnv,
  type WebdbMysqlConfig,
} from './webdb';
import { tsTimestamp, nullIfEmpty } from './webdb-normalize';
import type { EventLang } from '@/lib/shared/types';

export interface RawTypo3Event {
  uid: number;
  title: string;
  teaser: string | null;
  bodytext: string | null;
  event_information: string | null;
  datetime: number;
  event_end: number | null;
  sys_language_uid: number;
  externalurl: string | null;
  internalurl: string | null;
  rss_external_id: string | null;
  path_segment: string | null;
  location_title: string | null;
  organizer_title: string | null;
  institute: string | null;
  /** GROUP_CONCAT of sys_language_uid for every translation pointing at
   *  this row via l10n_parent. Null when no translation exists. */
  translation_langs: string | null;
}

export interface NormalizedEvent {
  webdbUid: number;
  title: string;
  teaser: string | null;
  bodytext: string | null;
  eventInformation: string | null;
  eventAt: string;
  eventEndAt: string | null;
  locationTitle: string | null;
  organizerTitle: string | null;
  institute: string | null;
  url: string | null;
  lang: EventLang | null;
  availableLangs: EventLang[];
}

/** Pulls upcoming events with their location, organizer, sidebar-info
 *  (event_information) and the institute label derived from the TYPO3
 *  page tree.
 *
 *  Location / organizer are read with COALESCE(plain-text, FK-title): the
 *  OEAW corpus stores those values in `location_simple` / `organizer_simple`
 *  on every current upcoming event (the FK columns `n.location` / `n.organizer`
 *  are all 0 across the live data probe on 2026-05-26). The LEFT JOIN on the
 *  legacy `tx_eventnews_*` lookup tables is kept as a fallback for any
 *  future row that might still use the relational form.
 *
 *  Institute resolution — recursive CTE walks `pages.pid` upward from the
 *  news folder until `is_siteroot=1`, then derives the label:
 *    - If the site-root is one of OEAW's own host titles (the main site has
 *      DE + EN siteroots), use the page directly *below* the site-root as
 *      the institute. This catches institutes that live as sub-pages of the
 *      main site (IHB, IKGA, IMAFO, ISA, KIS, ARZ, ...) — `is_siteroot=0`
 *      on those, so they aren't standalone roots.
 *    - Otherwise, use the site-root title itself (catches GMI, ACDH, IWF,
 *      RICAM and other institutes that have their own TYPO3 site-root).
 *  Cap at depth 12 to avoid runaway on cyclic page data (TYPO3 doesn't
 *  validate against cycles). */
export const FETCH_TYPO3_EVENTS_SQL = `
  WITH RECURSIVE event_page_walk AS (
    SELECT n.uid AS event_uid, p.uid AS page_uid, p.pid,
           p.title AS page_title, p.is_siteroot, 0 AS depth
    FROM tx_news_domain_model_news n
    JOIN pages p ON p.uid = n.pid
    WHERE n.is_event = 1 AND n.deleted = 0 AND n.hidden = 0
      AND n.datetime >= UNIX_TIMESTAMP()
    UNION ALL
    SELECT ep.event_uid, p.uid, p.pid, p.title, p.is_siteroot, ep.depth + 1
    FROM event_page_walk ep
    JOIN pages p ON p.uid = ep.pid
    WHERE ep.is_siteroot = 0 AND ep.depth < 12
  ),
  siteroot_per_event AS (
    SELECT event_uid, page_title AS root_title, depth AS root_depth
    FROM event_page_walk WHERE is_siteroot = 1
  ),
  subroot_per_event AS (
    -- Page directly below the site-root (depth = root_depth - 1). Null when
    -- the news folder itself sits on the site-root (one-row walk).
    SELECT ep.event_uid, ep.page_title AS sub_title
    FROM event_page_walk ep
    JOIN siteroot_per_event sr ON sr.event_uid = ep.event_uid
    WHERE ep.depth = sr.root_depth - 1
  ),
  institute_per_event AS (
    SELECT
      sr.event_uid,
      CASE
        WHEN sr.root_title IN (
          'Österreichische Akademie der Wissenschaften',
          'Austrian Academy of Sciences'
        ) AND sub.sub_title IS NOT NULL
        THEN sub.sub_title
        ELSE sr.root_title
      END AS institute
    FROM siteroot_per_event sr
    LEFT JOIN subroot_per_event sub ON sub.event_uid = sr.event_uid
  )
  SELECT
    n.uid,
    n.title,
    n.teaser,
    n.bodytext,
    n.event_information,
    n.datetime,
    n.event_end,
    n.sys_language_uid,
    n.externalurl,
    n.internalurl,
    n.tx_heborssnewsimporter_externalid AS rss_external_id,
    n.path_segment,
    COALESCE(NULLIF(n.location_simple, ''), loc.title)  AS location_title,
    COALESCE(NULLIF(n.organizer_simple, ''), org.title) AS organizer_title,
    ipe.institute,
    trans.translation_langs
  FROM tx_news_domain_model_news n
  LEFT JOIN tx_eventnews_domain_model_location loc
    ON loc.uid = n.location AND loc.deleted = 0
  LEFT JOIN tx_eventnews_domain_model_organizer org
    ON org.uid = n.organizer AND org.deleted = 0
  LEFT JOIN institute_per_event ipe
    ON ipe.event_uid = n.uid
  LEFT JOIN (
    SELECT l10n_parent AS parent_uid,
           GROUP_CONCAT(DISTINCT sys_language_uid
             ORDER BY sys_language_uid SEPARATOR ',') AS translation_langs
    FROM tx_news_domain_model_news
    WHERE l10n_parent > 0 AND deleted = 0 AND hidden = 0
    GROUP BY l10n_parent
  ) trans ON trans.parent_uid = n.uid
  WHERE n.is_event = 1
    AND n.deleted = 0
    AND n.hidden = 0
    AND n.datetime >= UNIX_TIMESTAMP()
    AND n.l10n_parent = 0
  ORDER BY n.datetime ASC
`;

/** TYPO3 sys_language_uid → ISO-ish lang. 0=default-language (de here),
 *  1=English, -1=all-languages. Other positive values exist for additional
 *  translations but the OEAW corpus only uses 0/1/-1; unknown values map to
 *  null rather than guess. */
function mapLang(uid: number): EventLang | null {
  if (uid === 0) return 'de';
  if (uid === 1) return 'en';
  if (uid === -1) return 'mul';
  return null;
}

/** Combines the original row's language with the languages of every
 *  translation pointing at it (the GROUP_CONCAT'd uids from the LEFT JOIN
 *  on l10n_parent). Result is deduped and stable-ordered de → en so the
 *  list-view badge renders consistently.
 *
 *  sys_language_uid = -1 ('mul') is the TYPO3 marker for a
 *  language-agnostic record (no DE/EN split, one row applies to all
 *  languages) — it's not itself a language. We expand it to [de, en] so
 *  the available-langs badge stays honest about what a viewer can
 *  actually read, and so 'mul' never leaks into the UI as a literal
 *  badge value. The `lang` column on the event still records the source
 *  marker for traceability. */
function collectAvailableLangs(
  originalUid: number,
  translationUids: string | null,
): EventLang[] {
  const all: (EventLang | null)[] = [];
  for (const uid of [originalUid, ...(translationUids?.split(',') ?? [])]) {
    const n = Number(typeof uid === 'string' ? uid.trim() : uid);
    if (!Number.isFinite(n)) continue;
    if (n === -1) {
      all.push('de', 'en');
    } else {
      all.push(mapLang(n));
    }
  }
  const order: Record<EventLang, number> = { de: 0, en: 1, mul: 2 };
  return [...new Set(all.filter((l): l is EventLang => l !== null))].sort(
    (a, b) => order[a] - order[b],
  );
}

/** Cascade `externalurl → rss_external_id → internalurl → null`.
 *
 *  Why no `path_segment`-based fallback to oeaw.ac.at: TYPO3 detail-page
 *  URLs depend on the per-site `routeEnhancers` config (lives in
 *  config/sites/*.yaml, not in the DB), and most institute sub-sites do
 *  NOT route under `oeaw.ac.at/detail/news/...`. Faking a main-site URL
 *  for an institute event sends the maintainer to a 404 on the main
 *  site — strictly worse than returning null and letting the UI render
 *  a "search on oeaw.ac.at" affordance.
 *
 *  Coverage on the live data (2026-05-26 probe): externalurl 4/240,
 *  rss_external_id 94/240, internalurl 19/240; ~50% of upcoming events
 *  get a direct URL, the rest fall through to the UI search fallback. */
function buildUrl(
  externalUrl: string | null,
  rssExternalId: string | null,
  internalUrl: string | null,
): string | null {
  const candidates = [externalUrl, rssExternalId, internalUrl];
  for (const c of candidates) {
    const cleaned = nullIfEmpty(c);
    if (cleaned && /^https?:\/\//i.test(cleaned)) return cleaned;
  }
  return null;
}

/** Pulls the editor's "Ort" / "Location" / "Venue" entry out of the
 *  sidebar HTML, used as a fallback when the row's `location_simple` /
 *  `tx_eventnews_domain_model_location.title` are both empty (which is
 *  the case for the majority of upcoming events because OEAW editors
 *  keep the address inside this rich-text block instead of the
 *  structured field).
 *
 *  Implementation — label-proximity walker on a parsed DOM (cheerio):
 *
 *    1. Find any element whose own text content equals one of the known
 *       location labels ("Ort", "Venue", "Wo", ...). The text-equality
 *       check (not just substring) avoids matching "Veranstaltungsort"
 *       sub-strings inside other paragraphs.
 *    2. For inline labels (`<strong>` inside a `<p>`), strip the label
 *       node and take the remaining text of the enclosing paragraph —
 *       handles the "Ort: <br> address" shape regardless of <br>
 *       count or extra <strong class="…"> attributes.
 *    3. For block-level labels (the heading or label-only `<p>`), take
 *       the next sibling element's text — handles "<p><strong>Ort</strong></p>
 *       <p>address</p>" and "<h2>Ort</h2><ul><li>address</li></ul>"
 *       uniformly.
 *
 *  This was a regex cascade until 2026-05-26; the cheerio rewrite
 *  expresses the intent (label proximity) instead of the surface form
 *  (six regex shapes) and survives editorial-template drift better.
 *  Returns null when no label is found OR the proximate content is
 *  empty/placeholder ("TBD"). */
const LOCATION_LABEL_RE =
  /^\s*(?:Conference\s+Venue|Veranstaltungsort|Tagungsort|Standort|Orte?|Location|Venues?|Where|Wo)\s*:?\s*$/i;

const PLACEHOLDER_VALUES = new Set(['tbd', 't.b.d.', 't.b.a.', 'tba']);

const LABEL_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, strong, b';

export function extractLocationFromEventInfo(
  eventInfo: string | null,
): string | null {
  if (!eventInfo) return null;
  // Pre-insert newline markers at <br> and </li><li> boundaries so
  // cheerio's `.text()` preserves the original line structure (it would
  // otherwise collapse "Saal A<br/>1010 Wien" into "Saal A1010 Wien"
  // because `<br>` carries no text node).
  const prepared = eventInfo
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>\s*<li[^>]*>/gi, '\n');
  const $ = cheerio.load(prepared, null, false);

  const labelNode = $(LABEL_SELECTOR)
    .filter((_, el) => LOCATION_LABEL_RE.test($(el).text()))
    .first();
  if (labelNode.length === 0) return null;

  let raw: string | null = null;

  if (labelNode.is('strong, b')) {
    // Inline label: walk the raw DOM siblings AFTER the label, stopping at
    // the next <strong>/<b> (which would be the next section's label in a
    // multi-section <p> like "<strong>Wann</strong>…<strong>Wo</strong>…").
    // This avoids hoovering up the preceding section's text when two labels
    // share a single <p>.
    const startNode = labelNode.get(0);
    if (startNode) {
      let acc = '';
      let curr = startNode.next;
      while (curr) {
        if (curr.type === 'tag') {
          const tagName = curr.tagName?.toLowerCase();
          if (tagName === 'strong' || tagName === 'b') break;
          acc += $(curr).text();
        } else if (curr.type === 'text') {
          acc += curr.data;
        }
        curr = curr.next;
      }
      raw = acc;
    }
  } else {
    // Block-level label (heading or label-only <p>): the value sits in the
    // next sibling element (p / ul / div / address). If the immediate
    // sibling is empty, walk forward until we find one with text.
    let sibling = labelNode.next();
    while (sibling.length > 0 && sibling.text().trim() === '') {
      sibling = sibling.next();
    }
    if (sibling.length > 0) {
      raw = sibling.text();
    } else {
      // Fallback: label-only block with no sibling — try removing the label
      // from its parent's text (catches some edge cases where editors wrap
      // both label and value in the same container).
      const container = labelNode.parent();
      if (container.length > 0 && container.get(0) !== $.root().get(0)) {
        const clone = container.clone();
        clone
          .find(LABEL_SELECTOR)
          .filter((_, el) => LOCATION_LABEL_RE.test($(el).text()))
          .remove();
        raw = clone.text();
      }
    }
  }

  if (raw === null) return null;
  const cleaned = normaliseLocationText(raw);
  if (!cleaned) return null;
  if (PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

/** Normalises cheerio's `.text()` output: collapses internal whitespace
 *  and removes leading punctuation. cheerio already decodes entities and
 *  strips tags, and it inserts spaces at `<br>` boundaries when reading
 *  text, so multi-line addresses come out as single-line with whitespace
 *  in place of the line breaks. Convert long whitespace runs to a single
 *  comma so the list view renders something readable. */
function normaliseLocationText(text: string): string {
  return text
    .replace(/ /g, ' ')
    .split(/\s*\n\s*|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

/** Opens a connection, runs FETCH_TYPO3_EVENTS_SQL, closes. The full row
 *  set fits in memory (~hundreds of rows in production), so no streaming. */
export async function fetchTypo3Events(
  config: WebdbMysqlConfig = webdbMysqlConfigFromEnv(),
): Promise<RawTypo3Event[]> {
  const conn = await mysql.createConnection({ ...config, charset: 'utf8mb4' });
  try {
    const [rows] = await conn.query(FETCH_TYPO3_EVENTS_SQL);
    return rows as RawTypo3Event[];
  } finally {
    await conn.end();
  }
}

/** Pure transform — no DB, no network, no clock. Returns null when the row
 *  has no usable event-start (datetime <= 0), which the orchestrator counts
 *  as `skipped` rather than failing the whole sync. */
export function normalizeTypo3Event(
  raw: RawTypo3Event,
): NormalizedEvent | null {
  const eventAt = tsTimestamp(raw.datetime);
  if (!eventAt) return null;
  const eventInformation = nullIfEmpty(raw.event_information);
  return {
    webdbUid: raw.uid,
    title: raw.title,
    teaser: nullIfEmpty(raw.teaser),
    bodytext: nullIfEmpty(raw.bodytext),
    eventInformation,
    eventAt,
    eventEndAt: tsTimestamp(raw.event_end),
    locationTitle:
      nullIfEmpty(raw.location_title) ??
      extractLocationFromEventInfo(eventInformation),
    organizerTitle: nullIfEmpty(raw.organizer_title),
    institute: nullIfEmpty(raw.institute),
    url: buildUrl(raw.externalurl, raw.rss_external_id, raw.internalurl),
    lang: mapLang(raw.sys_language_uid),
    availableLangs: collectAvailableLangs(
      raw.sys_language_uid,
      raw.translation_langs,
    ),
  };
}
