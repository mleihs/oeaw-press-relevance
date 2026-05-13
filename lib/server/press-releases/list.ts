import { count, desc, gte, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { db, pressReleases as pressReleasesTable } from '@/lib/server/db';
import type { PressRelease } from '@/lib/shared/types';
import { pressReleaseToApi } from './to-api';
import {
  PUB_LITE_COLUMNS,
  publicationToApiLite,
  type PubLite,
} from '@/lib/server/publications/to-api';

export interface PressReleasesStats {
  total: number;
  matched: number;
  orphans: number;
  this_month: number;
  this_year: number;
}

export type PressReleaseWithPub = PressRelease & {
  /** Present only when the query was run with `withPub=true`; `null` for
   *  orphans, missing entirely for `withPub=false` calls. */
  publication?: PubLite | null;
};

export interface PressReleasesListResult {
  press_releases: PressReleaseWithPub[];
  total: number;
}

export interface PressReleasesListFilters {
  orphans: 'true' | 'false' | null;
  withPub: boolean;
}

// --- Tabs config (shared between page + nav component) ----------------------
//
// `TAB_VALUES` is the single source of truth for the press-releases tab set.
// `isTab` validates `?tab=` searchParams at the page boundary; `filtersForTab`
// maps a validated Tab to the wrapper-filter shape. Both the page and the
// `_components/tabs-nav.tsx` display config bind to this list — adding a tab
// here forces both consumers to update at compile time.

export const TAB_VALUES = ['all', 'matched', 'orphans'] as const;
export type Tab = (typeof TAB_VALUES)[number];

export function isTab(v: unknown): v is Tab {
  return typeof v === 'string' && (TAB_VALUES as readonly string[]).includes(v);
}

export function filtersForTab(tab: Tab): PressReleasesListFilters {
  if (tab === 'matched') return { orphans: 'false', withPub: true };
  if (tab === 'orphans') return { orphans: 'true', withPub: false };
  return { orphans: null, withPub: true };
}

/**
 * Five count-only queries in parallel: total, matched (publication_id NOT
 * NULL), orphans (publication_id NULL), this_month (released_at >= start of
 * current month) and this_year (released_at >= January 1 of current year).
 */
export async function getPressReleasesStats(): Promise<PressReleasesStats> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const startOfYear = new Date(now.getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);

  const [totalQ, matchedQ, orphansQ, monthQ, yearQ] = await Promise.all([
    db.select({ c: count() }).from(pressReleasesTable),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(isNotNull(pressReleasesTable.publicationId)),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(isNull(pressReleasesTable.publicationId)),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(gte(pressReleasesTable.releasedAt, startOfMonth)),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(gte(pressReleasesTable.releasedAt, startOfYear)),
  ]);

  return {
    total: totalQ[0]?.c ?? 0,
    matched: matchedQ[0]?.c ?? 0,
    orphans: orphansQ[0]?.c ?? 0,
    this_month: monthQ[0]?.c ?? 0,
    this_year: yearQ[0]?.c ?? 0,
  };
}

/**
 * List press-releases ordered by released_at desc.
 *   - orphans: 'true'  -> only publication_id IS NULL
 *   - orphans: 'false' -> only matched
 *   - orphans: null    -> all
 *   - withPub: true    -> embed `PubLite` on each matched row (via Drizzle
 *     relations API + `publicationToApiLite`). Orphan rows return
 *     `publication: null`.
 */
export async function listPressReleases(
  filters: PressReleasesListFilters,
): Promise<PressReleasesListResult> {
  const filter: SQL | undefined =
    filters.orphans === 'true'
      ? isNull(pressReleasesTable.publicationId)
      : filters.orphans === 'false'
        ? isNotNull(pressReleasesTable.publicationId)
        : undefined;

  if (filters.withPub) {
    const rows = await db.query.pressReleases.findMany({
      where: filter,
      orderBy: desc(pressReleasesTable.releasedAt),
      with: {
        publication: {
          columns: PUB_LITE_COLUMNS,
        },
      },
    });
    return {
      press_releases: rows.map((r) => ({
        ...pressReleaseToApi(r),
        publication: r.publication ? publicationToApiLite(r.publication) : null,
      })),
      total: rows.length,
    };
  }

  const rows = filter
    ? await db
        .select()
        .from(pressReleasesTable)
        .where(filter)
        .orderBy(desc(pressReleasesTable.releasedAt))
    : await db
        .select()
        .from(pressReleasesTable)
        .orderBy(desc(pressReleasesTable.releasedAt));

  return {
    press_releases: rows.map(pressReleaseToApi),
    total: rows.length,
  };
}
