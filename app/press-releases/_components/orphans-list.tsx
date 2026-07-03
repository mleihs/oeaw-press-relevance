import Link from 'next/link';
import { ChevronDown, AlertCircle, Users, ExternalLink } from '@/lib/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/section-label';
import { VenueDisplay } from '@/components/venue-display';
import { canonicalName, venueDisplayLabel } from '@/lib/shared/venue-registry';
import { InfoBubble } from '@/components/info-bubble';
import { cn } from '@/lib/shared/utils';
import type { PressReleaseWithPub } from '@/lib/server/press-releases/list';
import type { PressRelease } from '@/lib/shared/types';

// Single source of truth for the column tracks: chevron / date / lang /
// title / authors / links. Used by both the header row and each item row
// so an added or resized column requires one edit only.
const GRID_COLS =
  '2rem 7rem 3rem minmax(0, 3fr) minmax(0, 2fr) auto';

/**
 * Orphans tab — list of expandable items rendered as native `<details>`.
 *
 * Why `<details>` and not a `<table>` with click-tr expand:
 *   - Native HTML5: zero JavaScript, the browser handles open/close state
 *   - `name="orphan-detail"` makes the group mutually-exclusive (only one
 *     open at a time) — exactly the old `expandedId` `useState` semantics
 *   - Survives back/forward navigation (browser-preserved state)
 *   - `<summary>` is a proper button-like control with built-in keyboard
 *     handling (Enter/Space to toggle), better a11y than the old click-tr
 *
 * Layout: CSS Grid with explicit column tracks for alignment between rows;
 * `overflow-x-auto` + `min-w-[760px]` preserves the horizontal-scroll
 * mobile UX the old `<table>` had.
 *
 * Trade-off: clicks on the DOI/Press links inside `<summary>` ALSO toggle
 * the details (HTML behaviour; can't be cleanly opted out without JS). For
 * `target="_blank"` links the user gets a new tab AND the row expands —
 * accepted as a minor UX side-effect for the Zero-JS win.
 */
export function PressReleasesOrphansList({ orphans }: { orphans: PressReleaseWithPub[] }) {
  const enrichedCount = orphans.filter((o) => o.enrichment_status === 'enriched').length;
  const partialCount = orphans.filter((o) => o.enrichment_status === 'partial').length;

  return (
    <div className="space-y-4">
      <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-500/[0.04] dark:border-amber-500/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium inline-flex items-center gap-1">
              ÖAW-Pressemitteilungen ohne Pub-Match
              <InfoBubble id="orphan_press_release" size="sm" />
            </p>
            <p className="mt-1 text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
              {orphans.length} ÖAW-Pressemitteilungen mit DOI-Verweis, deren zugehörige
              Publikation (noch) nicht in der WebDB verzeichnet ist. Häufigste Ursache:
              das publizierende Institut hat die Pub intern nicht für die Web-Anzeige
              freigegeben, daher landet sie gar nicht erst in der WebDB. Sobald die Pub
              freigegeben und beim nächsten Import übernommen wird, verknüpft
              <code> promote_press_release_orphans()</code> die Zuordnung automatisch.
              Metadaten via OpenAlex / CrossRef.
              {enrichedCount > 0 && (
                <span className="ml-1 opacity-70">
                  {' '}({enrichedCount} vollständig, {partialCount} teilweise angereichert)
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {orphans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            Keine ungebundenen Pressemitteilungen. Alle DOIs sind zugeordnet.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div
                className="grid items-center bg-muted/50 px-3 py-3 text-sm font-medium gap-3"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <span aria-hidden="true" />
                <span>Datum</span>
                <span>Lang</span>
                <span>News-Titel / Paper</span>
                <span>Authors / Journal</span>
                <span className="text-right">Links</span>
              </div>
              <ul className="divide-y">
                {orphans.map((pr) => (
                  <li key={pr.id}>
                    <OrphanItem pr={pr} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function OrphanItem({ pr }: { pr: PressReleaseWithPub }) {
  const hasDetail = !!(pr.abstract || pr.paper_title || (pr.authors && pr.authors.length));
  const paperYearMismatch =
    pr.paper_year != null
    && pr.released_at != null
    && pr.paper_year !== Number(pr.released_at.slice(0, 4));

  // No-detail rows skip the <details> wrapper so there's no broken
  // disclosure affordance on rows that have nothing to expand to.
  if (!hasDetail) {
    return (
      <div className="px-3 py-3 hover:bg-muted/40 transition-colors">
        <OrphanRow pr={pr} paperYearMismatch={paperYearMismatch} expandable={false} />
      </div>
    );
  }

  return (
    <details name="orphan-detail" className="group">
      <summary
        className={cn(
          'list-none cursor-pointer px-3 py-3 hover:bg-muted/40 transition-colors',
          'marker:hidden [&::-webkit-details-marker]:hidden',
        )}
      >
        <OrphanRow pr={pr} paperYearMismatch={paperYearMismatch} expandable={true} />
      </summary>
      <div className="border-t bg-muted/30 px-4 py-4">
        <OrphanDetail pr={pr} />
      </div>
    </details>
  );
}

function OrphanRow({
  pr,
  paperYearMismatch,
  expandable,
}: {
  pr: PressReleaseWithPub;
  paperYearMismatch: boolean;
  expandable: boolean;
}) {
  return (
    <div
      className="grid items-start text-sm gap-3"
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      <span className="text-muted-foreground flex items-center" aria-hidden="true">
        {expandable && (
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        )}
      </span>
      <span className="whitespace-nowrap text-xs">
        {pr.released_at ?? <span className="text-muted-foreground">–</span>}
        {paperYearMismatch && (
          <span className="block text-[10px] text-muted-foreground">
            Paper: {pr.paper_year}
          </span>
        )}
      </span>
      <span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {pr.lang ?? '?'}
        </Badge>
      </span>
      <span className="max-w-md">
        <span className="font-medium block">{pr.news_title ?? '–'}</span>
        {pr.paper_title && pr.paper_title !== pr.news_title && (
          <span className="text-xs text-muted-foreground italic line-clamp-2 block mt-1">
            {pr.paper_title}
          </span>
        )}
      </span>
      <span className="text-xs max-w-xs">
        {pr.oeaw_author_matches && pr.oeaw_author_matches.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-medium mb-1">
            <Users className="h-2.5 w-2.5" />
            {pr.oeaw_author_matches.length} ÖAW
          </span>
        )}
        {pr.authors && pr.authors.length > 0 && (
          <span className="block text-foreground/80 line-clamp-1">
            {pr.authors.slice(0, 2).join(', ')}
            {pr.authors.length > 2 && (
              <span className="text-muted-foreground"> +{pr.authors.length - 2}</span>
            )}
          </span>
        )}
        {pr.journal && (
          <span className="block text-muted-foreground italic line-clamp-1 mt-0.5">
            {canonicalName(pr.journal)}
          </span>
        )}
        {!pr.authors?.length && !pr.journal && (
          <span className="text-muted-foreground/70">–</span>
        )}
      </span>
      <span className="text-right whitespace-nowrap inline-flex items-center gap-3">
        <a
          href={`https://doi.org/${pr.doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-brand text-xs"
        >
          DOI
        </a>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline text-xs"
        >
          Presse <ExternalLink className="h-3 w-3" />
        </a>
      </span>
    </div>
  );
}

function OrphanDetail({ pr }: { pr: PressRelease }) {
  return (
    <div className="space-y-3 max-w-4xl">
      {pr.paper_title && (
        <div>
          <SectionLabel>Paper-Titel</SectionLabel>
          <p className="text-sm font-medium">{pr.paper_title}</p>
        </div>
      )}
      {pr.oeaw_author_matches && pr.oeaw_author_matches.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-brand uppercase mb-1 inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            Wahrscheinliche ÖAW-Beteiligung ({pr.oeaw_author_matches.length})
          </h4>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {pr.oeaw_author_matches.map((m) => (
              <Link
                key={m.person_id}
                href={`/persons/${m.person_id}`}
                className="inline-flex items-center gap-1 rounded-md bg-brand/10 text-brand hover:bg-brand/20 px-2 py-1 text-xs font-medium"
              >
                {m.name}
              </Link>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Zuordnung über Nachname + Vornamen-Initial gegen die <code>persons</code>-Tabelle.
            Manuelle Verifikation empfohlen.
          </p>
        </div>
      )}
      {pr.authors && pr.authors.length > 0 && (
        <div>
          <SectionLabel>Alle Autor:innen ({pr.authors.length})</SectionLabel>
          <p className="text-sm">{pr.authors.join(', ')}</p>
        </div>
      )}
      {pr.journal && (
        <div>
          <SectionLabel>{venueDisplayLabel(pr.journal)}</SectionLabel>
          <p className="text-sm">
            <VenueDisplay raw={pr.journal} />
            {pr.paper_year && <span className="text-muted-foreground"> ({pr.paper_year})</span>}
          </p>
        </div>
      )}
      {pr.abstract && (
        <div>
          <SectionLabel>Abstract</SectionLabel>
          <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
            {pr.abstract}
          </p>
        </div>
      )}
      {pr.keywords && pr.keywords.length > 0 && (
        <div>
          <SectionLabel>Keywords</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {pr.keywords.map((k) => (
              <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3 pt-2 text-xs">
        <a
          href={`https://doi.org/${pr.doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline inline-flex items-center gap-1"
        >
          DOI <ExternalLink className="h-3 w-3" />
        </a>
        {pr.openalex_id && (
          <a
            href={`https://openalex.org/works/${pr.openalex_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline inline-flex items-center gap-1"
          >
            OpenAlex <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
        >
          ÖAW-Pressemitteilung <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
