import {
  buildApiParams,
  buildUrl,
  hasAnyActiveFilter,
  loadFilters,
} from './_filters';
import {
  listPublications,
} from '@/lib/server/publications/list';
import { PAGE_SIZE } from './_constants';
import { ExportDropdown } from './_components/export-dropdown';
import { FiltersBar } from './_components/filters-bar';
import { PipelineActions } from './_components/pipeline-actions';
import { PublicationList } from './_components/publication-list';

// Per ADR 0009: read-heavy admin pages opt out of ISR. Filter combinations
// have an enormous URL space (~27 nuqs params), so cache hit rate would be
// near-zero anyway — revisit only if traffic justifies a tuned `revalidate`.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicationsPage({ searchParams }: PageProps) {
  const filters = await loadFilters(searchParams);
  const data = await listPublications(buildApiParams(filters));
  const hasFilters = hasAnyActiveFilter(filters);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const rangeStart = data.total > 0 ? (filters.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(filters.page * PAGE_SIZE, data.total);
  const prevHref =
    filters.page > 1 ? buildUrl(filters, { page: filters.page - 1 }) : '';
  const nextHref =
    filters.page < totalPages
      ? buildUrl(filters, { page: filters.page + 1 })
      : '';

  return (
    <div className="space-y-4">
      {/* Header: Titel + Bestandszahl + Export (Comp Z. 192–198). Mobil
          ausgeblendet wie beim Dashboard (M3) — der blaue App-Header mit
          Titel + Export-Knopf folgt in Phase M2. */}
      <div className="hidden md:flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Publikationen
          </h1>
          <p
            className="mt-1.5 text-[13.5px] text-ink-subtle"
            role="status"
            aria-live="polite"
          >
            {data.total.toLocaleString('de-AT')} Publikationen
            {!filters.showAll && data.total_hidden > 0 && (
              <span className="ml-1.5 text-ink-muted">
                ({data.total_hidden.toLocaleString('de-AT')} ausgeblendet)
              </span>
            )}
          </p>
        </div>
        <ExportDropdown />
      </div>

      <FiltersBar total={data.total} hidden={data.total_hidden} />

      {/* Pipeline-Trigger (Anreichern/Analysieren) bleibt Desktop-only — der
          Mobile-Mock hat ihn nicht, und Batch-Pipelines startet man nicht am
          Telefon (vetobar). */}
      <div className="hidden md:block">
        <PipelineActions />
      </div>

      <PublicationList
        publications={data.publications}
        page={filters.page}
        total={data.total}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        totalPages={totalPages}
        prevHref={prevHref}
        nextHref={nextHref}
        hasFilters={hasFilters}
      />
    </div>
  );
}
