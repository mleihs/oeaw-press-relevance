'use client';

import { useState, Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { useApiQuery } from '@/lib/client/hooks/use-api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TableRowSkeleton } from '@/components/skeletons';
import { ApiErrorCard } from '@/components/api-error-card';
import { SectionLabel } from '@/components/section-label';
import { PressScoreBadge } from '@/components/score-bar';
import { SimilarityIndicator } from '@/components/similarity-indicator';
import { DecisionBadge } from '@/components/decision-badge';
import { StatCard } from '@/components/stat-card';
import { displayTitle } from '@/lib/shared/html-utils';
import { cn } from '@/lib/shared/utils';
import {
  Newspaper, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Users, Link2,
  Layers, CalendarDays, ArrowRight, FileQuestion,
  type LucideIcon,
} from 'lucide-react';
import type { PressRelease, Decision } from '@/lib/shared/types';

interface PubLite {
  id: string;
  title: string;
  original_title: string | null;
  lead_author: string | null;
  citation: string | null;
  press_score: number | null;
  press_similarity: number | null;
  decision: Decision;
  published_at: string | null;
}

type PressReleaseWithPub = PressRelease & { publication?: PubLite | null };

interface ListResponse {
  press_releases: PressReleaseWithPub[];
  total: number;
}

interface StatsResponse {
  total: number;
  matched: number;
  orphans: number;
  this_month: number;
  this_year: number;
}

const TAB_DEFS = [
  { value: 'all', label: 'Alle', Icon: Layers, statsKey: 'total' },
  { value: 'matched', label: 'Mit Pub-Match', Icon: Link2, statsKey: 'matched' },
  { value: 'orphans', label: 'Ohne Pub-Match', Icon: FileQuestion, statsKey: 'orphans' },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  Icon: LucideIcon;
  statsKey: keyof StatsResponse;
}>;

type Tab = (typeof TAB_DEFS)[number]['value'];

export default function PressReleasesPage() {
  const [tab, setTab] = useState<Tab>('all');

  const stats = useApiQuery<StatsResponse>(
    ['press-releases', 'stats'],
    '/api/press-releases?stats=true',
  );

  const url =
    tab === 'matched'
      ? '/api/press-releases?orphans=false&with_pub=true'
      : tab === 'orphans'
        ? '/api/press-releases?orphans=true'
        : '/api/press-releases?with_pub=true';

  const list = useApiQuery<ListResponse>(['press-releases', tab], url);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600" />
          Pressemitteilungen
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Alle ÖAW-Pressemitteilungen mit DOI-Verweis — gematcht gegen die Publications-Datenbank
          oder als externe Referenz angereichert.
        </p>
      </div>

      <StatsRow data={stats.data} loading={stats.isLoading} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full sm:w-auto">
          {TAB_DEFS.map(({ value, label, Icon, statsKey }) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4" />
              {label}
              {stats.data && (
                <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0 tabular-nums">
                  {stats.data[statsKey]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_DEFS.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <TabBody list={list} variant={value} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Tab body — picks the right table for each tab variant ──────────────────

type ListQuery = ReturnType<typeof useApiQuery<ListResponse>>;

/** Shared shell for the two table variants (matched + orphans). */
function TableShell({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </Card>
  );
}

function TabBody({ list, variant }: { list: ListQuery; variant: Tab }) {
  if (list.isLoading) return <TableRowSkeleton rows={6} />;
  if (list.error) {
    return <ApiErrorCard message={list.error.message} />;
  }
  const rows = list.data?.press_releases ?? [];
  if (variant === 'orphans') return <OrphansTable orphans={rows} />;
  return <MainTable rows={rows} highlightOrphans={variant === 'all'} />;
}

// ─── Stats row ──────────────────────────────────────────────────────────────

function StatsRow({ data, loading }: { data: StatsResponse | undefined; loading: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Layers className="h-5 w-5" />}
        label="Pressemitteilungen gesamt"
        value={data?.total}
        loading={loading}
        accent="brand"
      />
      <StatCard
        icon={<Link2 className="h-5 w-5" />}
        label="Mit Publikations-Match"
        value={data?.matched}
        loading={loading}
        accent="emerald"
        subtitle={
          data && data.total
            ? `${Math.round((data.matched / data.total) * 100)}% aller PRs`
            : undefined
        }
      />
      <StatCard
        icon={<FileQuestion className="h-5 w-5" />}
        label="Externe Referenzen"
        value={data?.orphans}
        loading={loading}
        accent="amber"
        subtitle="OpenAlex/CrossRef-Anreicherung"
      />
      <StatCard
        icon={<CalendarDays className="h-5 w-5" />}
        label="Aktuelles Jahr"
        value={data?.this_year}
        loading={loading}
        accent="purple"
        subtitle={data ? `${data.this_month} diesen Monat` : undefined}
      />
    </div>
  );
}

// ─── Main listing (matched + all) ───────────────────────────────────────────

function MainTable({
  rows,
  highlightOrphans,
}: {
  rows: PressReleaseWithPub[];
  highlightOrphans: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground">
          Keine Pressemitteilungen für dieses Filter.
        </CardContent>
      </Card>
    );
  }
  return (
    <TableShell>
      <thead className="bg-muted/50">
        <tr>
          <th className="p-3 text-left font-medium whitespace-nowrap">Datum</th>
          <th className="p-3 text-left font-medium">News-Titel</th>
          <th className="p-3 text-left font-medium">Publikation</th>
          <th className="p-3 text-left font-medium whitespace-nowrap">Score</th>
          <th className="p-3 text-right font-medium whitespace-nowrap">Links</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((pr) => (
          <PressReleaseRow key={pr.id} pr={pr} highlightOrphans={highlightOrphans} />
        ))}
      </tbody>
    </TableShell>
  );
}

function PressReleaseRow({
  pr,
  highlightOrphans,
}: {
  pr: PressReleaseWithPub;
  highlightOrphans: boolean;
}) {
  const pub = pr.publication;
  const isOrphan = !pub;
  const titleText = pub
    ? displayTitle(pub.original_title || pub.title, pub.citation)
    : pr.paper_title;

  return (
    <tr
      className={cn(
        'border-t transition-colors hover:bg-muted/40',
        isOrphan && highlightOrphans && 'bg-amber-50/30 dark:bg-amber-500/[0.04]',
      )}
    >
      <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
        {pr.released_at ?? '–'}
        <div className="mt-0.5">
          <Badge variant="outline" className="text-[10px] uppercase">
            {pr.lang ?? '?'}
          </Badge>
        </div>
      </td>
      <td className="p-3 max-w-md">
        <div className="font-medium leading-snug line-clamp-2">{pr.news_title ?? '–'}</div>
      </td>
      <td className="p-3 max-w-sm">
        {pub ? (
          <Link
            href={`/publications/${pub.id}`}
            className="group inline-flex items-start gap-1.5 hover:text-brand"
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground group-hover:text-brand transition-transform group-hover:translate-x-0.5" />
            <span className="text-sm leading-snug line-clamp-2 group-hover:underline">
              {titleText}
            </span>
          </Link>
        ) : (
          <div className="space-y-1">
            <span className="text-sm italic text-muted-foreground line-clamp-2 leading-snug">
              {titleText ?? 'Kein Pub-Match'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-amber-200 dark:ring-amber-500/30">
              <AlertCircle className="h-2.5 w-2.5" />
              Externe Referenz
            </span>
          </div>
        )}
      </td>
      <td className="p-3">
        {pub ? (
          <div className="flex flex-col items-start gap-1">
            <PressScoreBadge score={pub.press_score} />
            <SimilarityIndicator similarity={pub.press_similarity} />
            <DecisionBadge decision={pub.decision} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">–</span>
        )}
      </td>
      <td className="p-3 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-3">
          <a
            href={`https://doi.org/${pr.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-brand"
          >
            DOI
          </a>
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Presse <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </td>
    </tr>
  );
}

// ─── Orphans-detail (kept rich UX from previous version) ────────────────────

function OrphansTable({ orphans }: { orphans: PressReleaseWithPub[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const enrichedCount = orphans.filter((o) => o.enrichment_status === 'enriched').length;
  const partialCount = orphans.filter((o) => o.enrichment_status === 'partial').length;

  return (
    <div className="space-y-4">
      <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-500/[0.04] dark:border-amber-500/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium">Externe Pressemitteilungen ohne WebDB-Eintrag</p>
            <p className="mt-1 text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
              {orphans.length} Pressemitteilungen mit DOI-Verweis, deren zugehörige Publikation
              nicht in der WebDB-Datenbank verzeichnet ist. Häufig sind ÖAW-Personen als
              Co-Author beteiligt — die WebDB erfasst aber nur Lead-Authorships zuverlässig.
              Sobald das Paper importiert wird, übernimmt <code>promote_press_release_orphans()</code>
              die Zuordnung automatisch. Metadaten via OpenAlex / CrossRef.
              {enrichedCount > 0 && (
                <span className="ml-1 opacity-70">
                  {' '}({enrichedCount} vollständig, {partialCount} teilweise angereichert)
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <TableShell>
        <thead className="bg-muted/50">
          <tr>
            <th className="p-3 text-left font-medium w-8"></th>
            <th className="p-3 text-left font-medium">Datum</th>
            <th className="p-3 text-left font-medium">Lang</th>
            <th className="p-3 text-left font-medium">News-Titel / Paper</th>
            <th className="p-3 text-left font-medium">Authors / Journal</th>
            <th className="p-3 text-right font-medium">Links</th>
          </tr>
        </thead>
        <tbody>
          {orphans.map((o) => {
            const isExpanded = expandedId === o.id;
            const hasDetail = !!(o.abstract || o.paper_title || (o.authors && o.authors.length));
            return (
              <Fragment key={o.id}>
                <tr
                  className={cn(
                    'border-t hover:bg-muted/40 transition-colors',
                    hasDetail && 'cursor-pointer',
                  )}
                  onClick={() => hasDetail && setExpandedId(isExpanded ? null : o.id)}
                >
                  <td className="p-3">
                    {hasDetail && (
                      <span className="text-muted-foreground">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {o.released_at ?? <span className="text-muted-foreground">–</span>}
                    {o.paper_year && o.released_at && o.paper_year !== Number(o.released_at.slice(0, 4)) && (
                      <div className="text-[10px] text-muted-foreground">Paper: {o.paper_year}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {o.lang ?? '?'}
                    </Badge>
                  </td>
                  <td className="p-3 max-w-md">
                    <div className="font-medium">{o.news_title ?? '–'}</div>
                    {o.paper_title && o.paper_title !== o.news_title && (
                      <div className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
                        {o.paper_title}
                      </div>
                    )}
                  </td>
                  <td className="p-3 max-w-xs text-xs">
                    {o.oeaw_author_matches && o.oeaw_author_matches.length > 0 && (
                      <div className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-medium mb-1">
                        <Users className="h-2.5 w-2.5" />
                        {o.oeaw_author_matches.length} ÖAW
                      </div>
                    )}
                    {o.authors && o.authors.length > 0 && (
                      <div className="text-foreground/80 line-clamp-1">
                        {o.authors.slice(0, 2).join(', ')}
                        {o.authors.length > 2 && (
                          <span className="text-muted-foreground"> +{o.authors.length - 2}</span>
                        )}
                      </div>
                    )}
                    {o.journal && (
                      <div className="text-muted-foreground italic line-clamp-1 mt-0.5">{o.journal}</div>
                    )}
                    {!o.authors?.length && !o.journal && (
                      <span className="text-muted-foreground/60">–</span>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`https://doi.org/${o.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-brand text-xs mr-3"
                    >
                      DOI
                    </a>
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline text-xs"
                    >
                      Presse <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
                {isExpanded && hasDetail && (
                  <tr className="border-t bg-muted/30">
                    <td colSpan={6} className="p-4">
                      <OrphanDetail o={o} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {orphans.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted-foreground">
                Keine ungebundenen Pressemitteilungen — alle DOIs sind zugeordnet.
              </td>
            </tr>
          )}
        </tbody>
      </TableShell>
    </div>
  );
}

function OrphanDetail({ o }: { o: PressRelease }) {
  return (
    <div className="space-y-3 max-w-4xl">
      {o.paper_title && (
        <div>
          <SectionLabel>Paper-Titel</SectionLabel>
          <p className="text-sm font-medium">{o.paper_title}</p>
        </div>
      )}
      {o.oeaw_author_matches && o.oeaw_author_matches.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-brand uppercase mb-1 inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            Wahrscheinliche ÖAW-Beteiligung ({o.oeaw_author_matches.length})
          </h4>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {o.oeaw_author_matches.map((m) => (
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
            Zuordnung über Nachname + Vornamen-Initial gegen die <code>persons</code>-Tabelle
            — manuelle Verifikation empfohlen.
          </p>
        </div>
      )}
      {o.authors && o.authors.length > 0 && (
        <div>
          <SectionLabel>Alle Autor:innen ({o.authors.length})</SectionLabel>
          <p className="text-sm">{o.authors.join(', ')}</p>
        </div>
      )}
      {o.journal && (
        <div>
          <SectionLabel>Journal</SectionLabel>
          <p className="text-sm">
            {o.journal}
            {o.paper_year && <span className="text-muted-foreground"> ({o.paper_year})</span>}
          </p>
        </div>
      )}
      {o.abstract && (
        <div>
          <SectionLabel>Abstract</SectionLabel>
          <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{o.abstract}</p>
        </div>
      )}
      {o.keywords && o.keywords.length > 0 && (
        <div>
          <SectionLabel>Keywords</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {o.keywords.map((k, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3 pt-2 text-xs">
        <a
          href={`https://doi.org/${o.doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline inline-flex items-center gap-1"
        >
          DOI <ExternalLink className="h-3 w-3" />
        </a>
        {o.openalex_id && (
          <a
            href={`https://openalex.org/works/${o.openalex_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline inline-flex items-center gap-1"
          >
            OpenAlex <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <a
          href={o.url}
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
