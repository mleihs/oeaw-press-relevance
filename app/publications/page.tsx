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
import { BookOpen } from '@/lib/icons';
import { MobileScreenHeader } from '@/components/mobile-screen-header';
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
    <>
    {/* Blauer App-Header (M2) — bewusst außerhalb des space-y-Containers,
        damit dessen strukturelle `* + *`-Margins den Desktop-Fluss nicht
        verschieben. Export bleibt Desktop-only (Mock-Export-Knopf vetobar
        weggelassen — Downloads startet man nicht am Telefon). */}
    <MobileScreenHeader
      icon={<BookOpen size={16} weight="fill" />}
      title="Publikationen"
      sub={`${data.total.toLocaleString('de-AT')} Publikationen · Story Score`}
    />
    <div className="space-y-4">
      {/* Header: Titel + Bestandszahl + Export (Comp Z. 192–198). Mobil
          trägt der blaue App-Header (M2) Titel + Count. */}
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
        {/* Kompakte Aktions-Cluster rechts (Comp-Header: Titel links, Buttons
            rechts). Pipeline-Trigger bleibt Desktop-only — der Mobile-Mock hat
            ihn nicht, und Batch-Pipelines startet man nicht am Telefon. */}
        <div className="flex items-center gap-2">
          <PipelineActions />
          <ExportDropdown />
        </div>
      </div>

      <FiltersBar total={data.total} hidden={data.total_hidden} />

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
    </>
  );
}
