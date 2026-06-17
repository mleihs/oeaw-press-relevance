import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export type PubDatePrecision = 'day' | 'month' | 'year';

/**
 * Infer the *trustworthy* display precision of a stored publication date.
 *
 * `publications.published_at` is a single `date` with NO precision column, and
 * the corpus pads unknown components inconsistently, so the value has to be read
 * defensively:
 *   - Enrichment (CrossRef/OpenAlex/Semantic Scholar/Unpaywall) pads a missing
 *     day OR month to `01` (see lib/server/enrichment/*.ts); the SQL backfill
 *     `backfill_published_at_from_text()` writes `make_date(year, 1, 1)` for
 *     year-only rows.
 *   - The TYPO3/WebDB source uses the 15th as a "month known, day unknown"
 *     convention.
 * Empirically (day-of-month histogram of the ~8k scored pubs) the 1st (~1.4k)
 * and the 15th (~2.1k) tower over the ~165/day baseline — those two days are
 * padding artifacts, not real publication days.
 *
 * Rule — never claim more precision than is defensible (under-claim, never
 * fabricate a day/month the source didn't have):
 *   day ∉ {1,15}            → 'day'   (a real day;  ~56% of scored pubs)
 *   day ∈ {1,15}, month ≠ 1 → 'month' (real month, padded day; ~37%)
 *   day ∈ {1,15}, month = 1 → 'year'  (January padding ⇒ year-only; ~7%)
 * Cost: a pub genuinely published on the 1st/15th, or in January, is shown one
 * notch coarser than reality. Acceptable for a credibility-sensitive triage tool
 * — far better than printing "15. September" for a paper that never was.
 */
export function pubDatePrecision(iso: string): PubDatePrecision {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(year)) return 'year';
  if (day !== 1 && day !== 15) return 'day';
  if (month !== 1) return 'month';
  return 'year';
}

/** Parse the date-only portion as a local Date (avoids UTC off-by-one). */
function parseDateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** Honest, German-locale publication-date label at the precision we can defend. */
export function formatPubDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const precision = pubDatePrecision(iso);
  if (precision === 'day') return format(parseDateOnly(iso), 'd. MMM yyyy', { locale: de });
  if (precision === 'month') return format(parseDateOnly(iso), 'MMM yyyy', { locale: de });
  return iso.slice(0, 4);
}

/** Tooltip text that states the date AND how precise it actually is. */
export function pubDateTitle(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const precision = pubDatePrecision(iso);
  if (precision === 'day') {
    return `Erschienen am ${format(parseDateOnly(iso), 'd. MMMM yyyy', { locale: de })}`;
  }
  if (precision === 'month') {
    return `Erschienen im ${format(parseDateOnly(iso), 'MMMM yyyy', { locale: de })} (Tag nicht überliefert)`;
  }
  return `Erschienen ${iso.slice(0, 4)} (nur Jahr überliefert)`;
}
