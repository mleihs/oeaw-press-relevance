'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Publication } from '@/lib/shared/types';
import { doiToUrl } from '@/lib/shared/doi-utils';
import { displayTitle } from '@/lib/shared/html-utils';
import { displayAuthor } from '@/lib/shared/publication-display';
import { buildTaskUrl } from '@/lib/shared/meistertask-urls';
import { cn } from '@/lib/shared/utils';
import { PressScoreBadge, ScoreBar } from './score-bar';
import { InfoBubble } from './info-bubble';
import { EXPL } from '@/lib/client/explanations';
import { HaikuBlock } from './haiku-block';
import { MeistertaskButton } from '@/components/meistertask-button';
import { EmptyState } from './empty-state';
import { PublicationFlag } from './publication-flag';
import { DecisionToolbar } from './decision-toolbar';
import { DecisionBadge, decisionAccentClass } from './decision-badge';
import { SimilarityIndicator } from './similarity-indicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { SectionLabel } from '@/components/section-label';
import { StatusBanner } from '@/components/status-banner';
import {
  LLM_MODELS,
  STATUS_LABELS,
  STATUS_COLORS,
  SOURCE_LABELS,
  SOURCE_BADGE_CLASSES as SOURCE_COLOR,
  SOURCE_DESCRIPTIONS,
} from '@/lib/shared/constants';
import {
  ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, ExternalLink, Info,
  ShieldCheck, Megaphone, Newspaper,
} from 'lucide-react';

// Publication rows from /api/publications now ride along with embedded
// orgunit shortcuts. Anything optional gets duck-typed so existing callers
// (analysis page) still type-check.
type PublicationRow = Publication & {
  orgunits?: Array<{ id: string; akronym_de: string | null; name_de: string }>;
  publication_type_lookup?: { name_de: string; name_en: string } | null;
};

interface PublicationTableProps {
  publications: PublicationRow[];
  showScores?: boolean;
  showEnrichment?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  /** /review-Modus: zeigt Decision-Toolbar im Expand und triggert lazy-session-create. */
  inSession?: boolean;
  /** Callback nach erfolgreicher Decision (für /review: Karte ausblenden). */
  onDecided?: (pubId: string) => void;
}

function SortIcon({ column, sortBy, sortOrder }: { column: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  if (sortBy !== column) {
    return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
  }
  return sortOrder === 'asc'
    ? <ArrowUp className="h-3 w-3 text-foreground" />
    : <ArrowDown className="h-3 w-3 text-foreground" />;
}

export function PublicationTable({ publications, showScores, showEnrichment, sortBy, sortOrder, onSort, inSession, onDecided }: PublicationTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (publications.length === 0) {
    return <EmptyState variant="inline" title="Keine Publikationen gefunden." />;
  }

  const sortable = !!onSort;

  const headerClass = sortable
    ? 'p-3 text-left font-medium cursor-pointer select-none hover:bg-muted transition-colors'
    : 'p-3 text-left font-medium';

  return (
    <>
      {/* Desktop table — hidden below md */}
      <div className="hidden md:block overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium w-8"></th>
              <th className="p-3 text-left font-medium w-8"></th>
              {/* Sortierung weg: alphabetisch nach Titel ist für Press-Triage
                  nicht relevant — was zählt ist Datum/Score/Status. */}
              <th className="p-3 text-left font-medium">
                <span>Titel</span>
              </th>
              {/* Sortierung weg: lead_author-Strings sind heterogen formatiert
                  (lastname-only, "Lastname, Initials", "Firstname Lastname",
                  vereinzelt nur Vorname etc.) — alphabetisch zu sortieren ist
                  nicht aussagekräftig fürs Press-Team. */}
              <th className="p-3 text-left font-medium">
                <span>Autor:innen</span>
              </th>
              <th className={headerClass} onClick={() => onSort?.('publication_type')}>
                <span className="inline-flex items-center gap-1">
                  Typ {sortable && <SortIcon column="publication_type" sortBy={sortBy} sortOrder={sortOrder} />}
                </span>
              </th>
              <th className={headerClass} onClick={() => onSort?.('published_at')}>
                <span className="inline-flex items-center gap-1">
                  Jahr {sortable && <SortIcon column="published_at" sortBy={sortBy} sortOrder={sortOrder} />}
                </span>
              </th>
              {showEnrichment && (
                <th className={headerClass} onClick={() => onSort?.('enrichment_status')}>
                  <span className="inline-flex items-center gap-1">
                    Enrichment {sortable && <SortIcon column="enrichment_status" sortBy={sortBy} sortOrder={sortOrder} />}
                  </span>
                </th>
              )}
              {showScores && (
                <th className={headerClass} onClick={() => onSort?.('press_score')}>
                  <span className="inline-flex items-center gap-1">
                    Score {sortable && <SortIcon column="press_score" sortBy={sortBy} sortOrder={sortOrder} />}
                    <InfoBubble id="press_score" />
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {publications.map((pub) => (
              <PublicationRow
                key={pub.id}
                pub={pub}
                showScores={showScores}
                showEnrichment={showEnrichment}
                isExpanded={expandedId === pub.id}
                onToggle={() => setExpandedId(expandedId === pub.id ? null : pub.id)}
                inSession={inSession}
                onDecided={onDecided}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view — visible below md */}
      <div className="md:hidden space-y-3">
        {publications.map((pub) => (
          <MobilePublicationCard
            key={pub.id}
            pub={pub}
            showScores={showScores}
            showEnrichment={showEnrichment}
            inSession={inSession}
            onDecided={onDecided}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MobilePublicationCard({
  pub,
  showScores,
  showEnrichment,
  inSession,
  onDecided,
}: {
  pub: PublicationRow;
  showScores?: boolean;
  showEnrichment?: boolean;
  inSession?: boolean;
  onDecided?: (pubId: string) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
    <Link
      href={`/publications/${pub.id}`}
      onClick={(e) => {
        if (inSession) {
          e.preventDefault();
          setSheetOpen(true);
        }
      }}
      className={cn(
        'block rounded-lg border bg-card p-4 hover:border-brand/30 hover:shadow-sm transition-all',
        pub.analysis_status !== 'analyzed' && 'opacity-60 hover:opacity-100',
        decisionAccentClass(pub.decision),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="shrink-0 -mt-1 -ml-1"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <PublicationFlag pubId={pub.id} flagNotes={pub.flag_notes ?? []} size="sm" decision={pub.decision} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-snug line-clamp-2">
            {displayTitle(pub.original_title || pub.title, pub.citation)}
            {pub.meistertask_task_token && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(buildTaskUrl(pub.meistertask_task_token)!, '_blank', 'noopener');
                }}
                aria-label="In MeisterTask geöffnet"
                className="inline-flex align-text-bottom ml-1 text-muted-foreground/70 hover:text-brand"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {displayAuthor(pub)}
          </p>
          {showScores && pub.pitch_suggestion && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
              {pub.pitch_suggestion}
            </p>
          )}
          {pub.haiku && (
            <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-1">
              {pub.haiku.replace(/\n/g, ' / ')}
            </p>
          )}
        </div>
        {showScores && (
          <div className="shrink-0 flex flex-col items-end gap-1">
            <PressScoreBadge score={pub.press_score} analysisStatus={pub.analysis_status} enrichmentStatus={pub.enrichment_status} />
            <SimilarityIndicator similarity={pub.press_similarity} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <DecisionBadge decision={pub.decision} />
        {pub.publication_type && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {pub.publication_type}
          </Badge>
        )}
        {pub.press_release && (
          <Tooltip><TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(pub.press_release!.url, '_blank', 'noopener');
              }}
              aria-label="ÖAW-Pressemitteilung öffnen"
              className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] font-medium gap-0.5"
            >
              <Newspaper className="h-2.5 w-2.5" /> Press-Release
            </button>
          </TooltipTrigger><TooltipContent className="max-w-xs">
            {pub.press_release.paper_title ?? pub.press_release.news_title ?? 'ÖAW-Pressemitteilung'}
            {pub.press_release.released_at && <span className="block opacity-70">vom {pub.press_release.released_at}</span>}
          </TooltipContent></Tooltip>
        )}
        {pub.peer_reviewed && (
          <Tooltip><TooltipTrigger asChild>
            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-medium gap-0.5">
              <ShieldCheck className="h-2.5 w-2.5" /> PR
            </span>
          </TooltipTrigger><TooltipContent>Peer-reviewed</TooltipContent></Tooltip>
        )}
        {pub.popular_science && (
          <Tooltip><TooltipTrigger asChild>
            <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300 px-1.5 py-0.5 text-[10px] font-medium gap-0.5">
              <Megaphone className="h-2.5 w-2.5" /> PS
            </span>
          </TooltipTrigger><TooltipContent>Popular Science</TooltipContent></Tooltip>
        )}
        {pub.published_at && (
          <span className="text-[10px] text-muted-foreground/70">{pub.published_at.slice(0, 4)}</span>
        )}
        {pub.orgunits && pub.orgunits.length > 0 && (
          <OrgunitChips orgunits={pub.orgunits} max={2} />
        )}
        {showEnrichment && (
          <>
            <StatusBadge status={pub.enrichment_status} />
            {pub.enriched_source && <SourceBadges sources={pub.enriched_source} />}
          </>
        )}
        {showScores && pub.analysis_status === 'analyzed' && pub.llm_model && (
          <ModelBadge model={pub.llm_model} />
        )}
      </div>
    </Link>
    {inSession && (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-left text-base leading-snug line-clamp-3 pr-8">
              {displayTitle(pub.original_title || pub.title, pub.citation)}
            </SheetTitle>
            <SheetDescription className="text-left">
              {displayAuthor(pub)}
              {showScores && pub.press_score != null && (
                <> · Score {Math.round(pub.press_score * 100)}%</>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-3">
            {pub.press_release && (
              <StatusBanner variant="success" icon={<Newspaper className="h-4 w-4 mt-0.5 shrink-0" />}>
                <span className="font-medium">Bereits ÖAW-pressed</span>
                {pub.press_release.released_at && <> am {pub.press_release.released_at}</>}.
              </StatusBanner>
            )}

            <DecisionToolbar
              pub={pub}
              inSession={inSession}
              onDecided={() => {
                setSheetOpen(false);
                onDecided?.(pub.id);
              }}
            />

            {pub.pitch_suggestion && (
              <div className="text-xs">
                <p className="font-medium text-foreground/80 mb-1">Pitch-Vorschlag</p>
                <p className="text-muted-foreground line-clamp-4 leading-snug">{pub.pitch_suggestion}</p>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/publications/${pub.id}`}>Volle Detail-Page öffnen</Link>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop row
// ---------------------------------------------------------------------------

function PublicationRow({
  pub,
  showScores,
  showEnrichment,
  isExpanded,
  onToggle,
  inSession,
  onDecided,
}: {
  pub: PublicationRow;
  showScores?: boolean;
  showEnrichment?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  inSession?: boolean;
  onDecided?: (pubId: string) => void;
}) {
  // 6 base cols (expand, flag, title, authors, type, year) + optional enrichment/scores
  const colCount = 6 + (showEnrichment ? 1 : 0) + (showScores ? 1 : 0);

  const accentClass = decisionAccentClass(pub.decision);
  return (
    <>
      <tr
        className={cn(
          'border-t hover:bg-muted/40 cursor-pointer transition-opacity',
          pub.analysis_status !== 'analyzed' && 'opacity-60 hover:opacity-100',
        )}
        onClick={onToggle}
      >
        <td className={cn('p-3', accentClass)}>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </td>
        <td className="p-3" onClick={(e) => e.stopPropagation()}>
          <PublicationFlag
            pubId={pub.id}
            flagNotes={pub.flag_notes ?? []}
            size="sm"
            decision={pub.decision}
          />
        </td>
        <td className="p-3 max-w-sm">
          <div className="font-medium truncate flex items-center gap-1.5">
            <Link
              href={`/publications/${pub.id}`}
              className="hover:text-brand hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayTitle(pub.original_title || pub.title, pub.citation)}
            </Link>
            {pub.peer_reviewed && (
              <Tooltip><TooltipTrigger asChild>
                <ShieldCheck className="h-3 w-3 text-blue-600 shrink-0" />
              </TooltipTrigger><TooltipContent>Peer-reviewed</TooltipContent></Tooltip>
            )}
            {pub.popular_science && (
              <Tooltip><TooltipTrigger asChild>
                <Megaphone className="h-3 w-3 text-purple-600 shrink-0" />
              </TooltipTrigger><TooltipContent>Popular Science</TooltipContent></Tooltip>
            )}
            {pub.press_release && (
              <Tooltip><TooltipTrigger asChild>
                <a
                  href={pub.press_release.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-emerald-600 hover:text-emerald-700 shrink-0"
                  aria-label={`ÖAW-Pressemitteilung: ${pub.press_release.paper_title ?? pub.press_release.news_title ?? ''}`}
                >
                  <Newspaper className="h-3 w-3" />
                </a>
              </TooltipTrigger><TooltipContent className="max-w-xs">
                ÖAW-Pressemitteilung
                {(pub.press_release.paper_title || pub.press_release.news_title) && (
                  <><br/><span className="font-medium">{pub.press_release.paper_title ?? pub.press_release.news_title}</span></>
                )}
                {pub.press_release.released_at && <><br/><span className="opacity-70">vom {pub.press_release.released_at}</span></>}
              </TooltipContent></Tooltip>
            )}
            {pub.meistertask_task_token && (
              <Tooltip><TooltipTrigger asChild>
                <a
                  href={buildTaskUrl(pub.meistertask_task_token)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground/70 hover:text-brand shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </TooltipTrigger><TooltipContent>In MeisterTask geöffnet</TooltipContent></Tooltip>
            )}
          </div>
          {showScores && pub.pitch_suggestion && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
              {pub.pitch_suggestion}
            </p>
          )}
          {pub.orgunits && pub.orgunits.length > 0 && (
            <div className="mt-1">
              <OrgunitChips orgunits={pub.orgunits} max={3} />
            </div>
          )}
        </td>
        <td className="p-3 max-w-[140px] truncate">{pub.lead_author?.trim() || '-'}</td>
        <td className="p-3 whitespace-nowrap">
          <Badge variant="outline" className="text-xs">
            {pub.publication_type || pub.publication_type_lookup?.name_de || 'Unbekannt'}
          </Badge>
        </td>
        <td className="p-3 whitespace-nowrap">{pub.published_at?.slice(0, 4) || '-'}</td>
        {showEnrichment && (
          <td className="p-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={pub.enrichment_status} />
              {pub.enriched_source && (
                <SourceBadges sources={pub.enriched_source} />
              )}
            </div>
          </td>
        )}
        {showScores && (
          <td className="p-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <PressScoreBadge score={pub.press_score} analysisStatus={pub.analysis_status} enrichmentStatus={pub.enrichment_status} />
              <SimilarityIndicator similarity={pub.press_similarity} />
              {pub.analysis_status === 'analyzed' && pub.llm_model && (
                <ModelBadge model={pub.llm_model} />
              )}
            </div>
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr className="border-t bg-muted/30">
          <td colSpan={colCount} className="p-4">
            <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
              {inSession && pub.press_release && (
                <StatusBanner variant="success" icon={<Newspaper className="h-4 w-4 mt-0.5 shrink-0" />}>
                  <span className="font-medium">Bereits ÖAW-pressed</span>
                  {pub.press_release.released_at && <> am {pub.press_release.released_at}</>}
                  {' '}—{' '}
                  <a
                    href={pub.press_release.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-emerald-700 dark:hover:text-emerald-200"
                  >
                    Pressemitteilung öffnen
                  </a>
                  . Pitch-Decision nur, wenn neue Coverage gewünscht ist.
                </StatusBanner>
              )}
              <DecisionToolbar
                pub={pub}
                inSession={inSession}
                onDecided={() => onDecided?.(pub.id)}
              />
              <ExpandedDetail pub={pub} showScores={showScores} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const explId = `status_${status}`;
  const hasExpl = explId in EXPL;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
        {STATUS_LABELS[status] || status}
      </span>
      {hasExpl && <InfoBubble id={explId as keyof typeof EXPL} />}
    </span>
  );
}

const SOURCE_SHORT: Record<string, string> = {
  crossref: 'CR',
  openalex: 'OA',
  unpaywall: 'UW',
  semantic_scholar: 'S2',
  pdf: 'PDF',
};

const MODEL_SHORT: Record<string, string> = Object.fromEntries(
  LLM_MODELS.map(m => {
    const short = m.label
      .replace('Claude ', '')
      .replace(' (Free)', '')
      .replace('GPT-', 'GPT-');
    return [m.value, short];
  })
);

function ModelBadge({ model }: { model: string | null }) {
  if (!model) return null;
  const short = MODEL_SHORT[model] || model.split('/').pop() || model;
  return (
    <span
      title={model}
      className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
    >
      {short}
    </span>
  );
}

function SourceBadges({ sources }: { sources: string }) {
  return (
    <>
      {sources.split('+').map((src) => (
        <span
          key={src}
          title={src}
          className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none ${SOURCE_COLOR[src] || 'bg-muted text-muted-foreground'}`}
        >
          {SOURCE_SHORT[src] || src}
        </span>
      ))}
    </>
  );
}

function OrgunitChips({
  orgunits,
  max = 3,
}: {
  orgunits: Array<{ id: string; akronym_de: string | null; name_de: string }>;
  max?: number;
}) {
  const visible = orgunits.slice(0, max);
  const overflow = orgunits.length - visible.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visible.map((o) => (
        <Tooltip key={o.id}>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {o.akronym_de || o.name_de.slice(0, 12)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">{o.name_de}</TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  );
}

function ExpandedDetail({ pub, showScores }: { pub: Publication; showScores?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <SectionLabel>Zusammenfassung</SectionLabel>
          <p className="text-sm">{pub.enriched_abstract || pub.abstract || 'Keine Zusammenfassung verfügbar'}</p>
        </div>
        {pub.doi && (
          <div>
            <SectionLabel>DOI</SectionLabel>
            <a
              href={doiToUrl(pub.doi) || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand hover:underline inline-flex items-center gap-1"
            >
              {pub.doi} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        {pub.enriched_source && (
          <div>
            <SectionLabel>Enrichment-Quellen</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {pub.enriched_source.split('+').map((src) => (
                <span
                  key={src}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLOR[src] || 'bg-muted text-muted-foreground'}`}
                >
                  {SOURCE_LABELS[src] || src}
                  <SourceInfoBubble source={src} />
                </span>
              ))}
            </div>
          </div>
        )}
        {pub.enriched_journal && (
          <div>
            <SectionLabel>Journal</SectionLabel>
            <p className="text-sm">{pub.enriched_journal}</p>
          </div>
        )}
        {pub.enriched_keywords && pub.enriched_keywords.length > 0 && (
          <div>
            <SectionLabel>Schlagwörter</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {pub.enriched_keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
        {pub.full_text_snippet && (
          <SnippetDisplay text={pub.full_text_snippet} />
        )}
      </div>

      {showScores && pub.analysis_status === 'analyzed' && (
        <div className="space-y-3">
          <div>
            <SectionLabel>Score-Aufschlüsselung</SectionLabel>
            <div className="space-y-2">
              <ScoreBar dimension="public_accessibility" value={pub.public_accessibility} />
              <ScoreBar dimension="societal_relevance" value={pub.societal_relevance} />
              <ScoreBar dimension="novelty_factor" value={pub.novelty_factor} />
              <ScoreBar dimension="storytelling_potential" value={pub.storytelling_potential} />
              <ScoreBar dimension="media_timeliness" value={pub.media_timeliness} />
            </div>
          </div>
          {pub.pitch_suggestion && (
            <div>
              <SectionLabel>Pitch</SectionLabel>
              <div className="rounded bg-blue-50 dark:bg-blue-500/[0.08] p-3 text-sm">{pub.pitch_suggestion}</div>
            </div>
          )}
          {pub.suggested_angle && (
            <div>
              <SectionLabel>Empfohlener Blickwinkel</SectionLabel>
              <p className="text-sm">{pub.suggested_angle}</p>
            </div>
          )}
          {pub.target_audience && (
            <div>
              <SectionLabel>Zielgruppe</SectionLabel>
              <p className="text-sm">{pub.target_audience}</p>
            </div>
          )}
          {pub.reasoning && (
            <div>
              <SectionLabel>Begründung</SectionLabel>
              <p className="text-sm text-foreground/80">{pub.reasoning}</p>
            </div>
          )}
          {pub.haiku && (
            <div className="rounded border bg-muted/30 px-4 py-3">
              <HaikuBlock haiku={pub.haiku} model={pub.llm_model} />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {pub.llm_model ? (
              <span className="text-xs text-muted-foreground/70">
                Modell: {pub.llm_model} | Kosten: ${pub.analysis_cost?.toFixed(4) || '0'}
              </span>
            ) : <span />}
            <div onClick={(e) => e.stopPropagation()}>
              <MeistertaskButton pub={pub} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceInfoBubble({ source }: { source: string }) {
  const desc = SOURCE_DESCRIPTIONS[source];
  if (!desc) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-current opacity-40 hover:opacity-80 transition-opacity ml-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-52 font-normal">
        {desc}
      </TooltipContent>
    </Tooltip>
  );
}

function SnippetDisplay({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 300;
  const display = isLong && !expanded ? text.slice(0, 300) + '...' : text;

  return (
    <div>
      <SectionLabel>Textauszug</SectionLabel>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{display}</p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-xs text-brand hover:underline mt-1"
        >
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}
