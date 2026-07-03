import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { PublicationTable } from '@/components/publication-table';
import {
  SCORE_COLORS,
  SCORE_DIMENSIONS,
  SCORE_LABELS,
  type ScoreDimension,
} from '@/lib/shared/constants';
import {
  listPublications,
  type PublicationListItem,
} from '@/lib/server/publications/list';
import {
  buildApiParams,
  buildUrl,
  hasAnyActiveFilter,
  loadFilters,
  type FilterValues,
  type SortOrder,
} from './_filters';
import { PAGE_SIZE } from './_constants';
import { ExportDropdown } from './_components/export-dropdown';
import { FiltersBar } from './_components/filters-bar';
import { PipelineActions } from './_components/pipeline-actions';

// Per ADR 0009: read-heavy admin pages opt out of ISR. Filter combinations
// have an enormous URL space (~27 nuqs params), so cache hit rate would be
// near-zero anyway — revisit only if traffic justifies a tuned `revalidate`.
export const dynamic = 'force-dynamic';

// Pure helper: averages each LLM-evaluated dimension across the currently-
// fetched page. Dimensions with no non-null values are omitted — empty
// object => the avgs card doesn't render.
function computeDimAvgs(
  publications: PublicationListItem[],
): Partial<Record<ScoreDimension, number>> {
  const out: Partial<Record<ScoreDimension, number>> = {};
  for (const dim of SCORE_DIMENSIONS) {
    const vals = publications
      .map((pub) => pub[dim])
      .filter((v): v is number => v !== null);
    if (vals.length > 0) {
      out[dim] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return out;
}

// PublicationTable's sortable columns. Each href is pre-computed in the RSC
// page (functions can't cross the RSC → Client boundary) and passed as a
// serialisable record. Toggling: same column → flip order; new column → asc.
// Always returns to page 1 since a new sort rarely shows the same rows.
const SORTABLE_COLUMNS = [
  'publication_type',
  'published_at',
  'enrichment_status',
  'press_score',
] as const;

function buildSortHrefs(filters: FilterValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of SORTABLE_COLUMNS) {
    const order: SortOrder =
      filters.sort === col
        ? filters.order === 'asc'
          ? 'desc'
          : 'asc'
        : 'asc';
    out[col] = buildUrl(filters, { sort: col, order, page: 1 });
  }
  return out;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicationsPage({ searchParams }: PageProps) {
  const filters = await loadFilters(searchParams);
  const data = await listPublications(buildApiParams(filters));
  const dimAvgs = computeDimAvgs(data.publications);
  const hasFilters = hasAnyActiveFilter(filters);
  const sortHrefs = buildSortHrefs(filters);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const rangeStart = data.total > 0 ? (filters.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(filters.page * PAGE_SIZE, data.total);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Publikationen</h1>
          <p className="text-muted-foreground" role="status" aria-live="polite">
            {data.total.toLocaleString('de-AT')} Publikationen
            {!filters.showAll && data.total_hidden > 0 && (
              <span className="ml-2 text-muted-foreground">
                ({data.total_hidden.toLocaleString('de-AT')} ausgeblendet)
              </span>
            )}
          </p>
        </div>
        <ExportDropdown />
      </div>

      <FiltersBar total={data.total} hidden={data.total_hidden} />

      <PipelineActions />

      {Object.keys(dimAvgs).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Durchschnitt dieser {data.publications.length} Publikationen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-5">
              {Object.entries(dimAvgs).map(([dim, avg]) => (
                <div key={dim} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{SCORE_LABELS[dim]}</span>
                    <span className="font-medium">{Math.round(avg * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full motion-reduce:transition-none"
                      style={{
                        width: `${Math.round(avg * 100)}%`,
                        backgroundColor: SCORE_COLORS[dim],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.publications.length === 0 && hasFilters ? (
        <EmptyState
          className="border-dashed"
          title="Keine Treffer"
          body={
            <>
              <p>
                Die aktive Filterkombination liefert keine Publikationen.
                {filters.preset !== 'custom' && (
                  <> Aktiver Preset: <strong>{filters.preset}</strong>.</>
                )}
              </p>
              <p className="mt-2 text-muted-foreground/70">
                Tipp: einzelne Filter über die Chips oben entfernen, oder alles zurücksetzen.
              </p>
            </>
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/publications" replace scroll={false}>
                Alle Filter zurücksetzen
              </Link>
            </Button>
          }
        />
      ) : (
        <PublicationTable
          publications={data.publications}
          showScores
          showEnrichment
          sortBy={filters.sort}
          sortOrder={filters.order}
          sortHrefs={sortHrefs}
        />
      )}

      {totalPages > 1 && (
        <nav aria-label="Seiten" className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Zeige {rangeStart}–{rangeEnd} von {data.total.toLocaleString('de-AT')}
          </p>
          <div className="flex gap-2">
            <PaginationLink
              disabled={filters.page <= 1}
              href={buildUrl(filters, { page: filters.page - 1 })}
              label="Vorige Seite"
            >
              <ChevronLeft className="h-4 w-4" />
            </PaginationLink>
            <PaginationLink
              disabled={filters.page >= totalPages}
              href={buildUrl(filters, { page: filters.page + 1 })}
              label="Nächste Seite"
            >
              <ChevronRight className="h-4 w-4" />
            </PaginationLink>
          </div>
        </nav>
      )}
    </div>
  );
}

// Local Zero-JS pagination control. Disabled state renders a plain Button
// (no anchor) so we don't ship a clickable-but-inert `<a>` to the DOM.
function PaginationLink({
  disabled,
  href,
  label,
  children,
}: {
  disabled: boolean;
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} replace scroll={false} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
