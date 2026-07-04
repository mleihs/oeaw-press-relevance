'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Newspaper, Search } from '@/lib/icons';
import { PressScoreBadge } from '@/components/score-bar';
import { VenueLine } from '@/components/venue-line';
import { FlagshipBadge } from '@/components/flagship-badge';
import { PublicationFlag } from '@/components/publication-flag';
import { InfoBubble } from '@/components/info-bubble';
import {
  displayAuthor,
  displayInstitute,
  displayTitle,
} from '@/lib/shared/publication-display';
import { formatPubDate, pubDateTitle } from '@/lib/shared/format-pub-date';
import { enrichmentReason } from '@/lib/shared/enrichment-reason';
import type { PublicationListItem } from '@/lib/server/publications/list';

// Kartengrund nach Design System §5 (Elevation-1) — identisch zu Dashboard, damit
// die Panels toolkit-weit als ein System lesen. Tokens statt Hex (docs/DESIGN_SYSTEM.md §2).
const CARD =
  'rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,46,.05)] overflow-hidden';

// Per-row „warum kein Score" Grund (aus DOI/Typ/Datum abgeleitet) — führt die
// N/A-Bubble am Score-Badge an, exakt wie in der alten Tabelle.
function naReasonFor(pub: PublicationListItem): string | null {
  return enrichmentReason(
    {
      enrichment_status: pub.enrichment_status,
      doi: pub.doi,
      publication_type:
        pub.publication_type || pub.publication_type_lookup?.name_de || null,
      published_at: pub.published_at,
    },
    new Date(),
  );
}

interface PublicationListProps {
  publications: PublicationListItem[];
  page: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  totalPages: number;
  prevHref: string;
  nextHref: string;
  hasFilters: boolean;
}

/**
 * Desktop-Publikationsliste gemäß Toolkit-Redesign-Comp (Zeile 213–244):
 * Karten-Liste statt Tabelle. Jede Zeile ist ein Link auf die Detail-Page
 * (Caret rechts). Score-Badge links, Titel + Meta + Pitch in der Mitte,
 * PM-/Geflaggt-Status + Caret rechts. Interaktive Kinder (Flag-Pin, Venue-Link)
 * stoppen Propagation/Default — dasselbe Muster wie die bestehende Mobile-Karte.
 *
 * Bewusst NICHT übernommen ggü. alter Tabelle: Spalten-Sortierung (jetzt über
 * das Filter-Sheet), Inline-Expand (jetzt Navigation zur Detail-Page),
 * Enrichment-/Source-/Modell-Badges (verschlankt fürs Triage-Scannen).
 */
export function PublicationList({
  publications,
  total,
  rangeStart,
  rangeEnd,
  totalPages,
  prevHref,
  nextHref,
  hasFilters,
}: PublicationListProps) {
  return (
    <div className={CARD}>
      {publications.length === 0 ? (
        <div className="px-4 py-11 text-center">
          <Search aria-hidden className="mx-auto h-7 w-7 text-line-strong" />
          <div className="mt-2.5 text-[13.5px] text-ink-subtle">
            {hasFilters
              ? 'Keine Publikationen für diese Filter'
              : 'Keine Publikationen'}
          </div>
        </div>
      ) : (
        publications.map((pub) => {
          const naReason = naReasonFor(pub);
          const institute = displayInstitute(pub);
          const typeLabel =
            pub.publication_type || pub.publication_type_lookup?.name_de;
          return (
            <Link
              key={pub.id}
              href={`/publications/${pub.id}`}
              className="flex items-start gap-3.5 border-b border-line px-[18px] py-[15px] transition-colors last:border-b-0 hover:bg-canvas"
            >
              <PressScoreBadge
                score={pub.press_score}
                analysisStatus={pub.analysis_status}
                enrichmentStatus={pub.enrichment_status}
                naReason={naReason}
              />

              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold leading-[1.35] text-ink">
                  {displayTitle(pub.original_title || pub.title, pub.citation)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[12.5px] text-ink-subtle">
                    {displayAuthor(pub)}
                    {institute ? ` · ${institute}` : ''}
                  </span>
                  <FlagshipBadge journal={pub.enriched_journal} />
                  {typeLabel && (
                    <span className="rounded-full bg-fill px-[7px] py-[2px] text-[10.5px] font-semibold text-ink-subtle">
                      {typeLabel}
                    </span>
                  )}
                  {pub.published_at && (
                    <span
                      className="font-mono text-[10.5px] text-ink-muted"
                      title={pubDateTitle(pub.published_at)}
                    >
                      {formatPubDate(pub.published_at)}
                    </span>
                  )}
                </div>
                <VenueLine journal={pub.enriched_journal} />
                {pub.pitch_suggestion && (
                  <p className="mt-[5px] line-clamp-2 text-[12.5px] leading-[1.45] text-ink-soft">
                    {pub.pitch_suggestion}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {pub.press_release && (
                  <span
                    title={
                      pub.press_release.paper_title ??
                      pub.press_release.news_title ??
                      'ÖAW-Pressemitteilung'
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-[3px] text-[10.5px] font-semibold text-success"
                  >
                    <Newspaper weight="bold" className="h-[11px] w-[11px]" />
                    PM
                  </span>
                )}
                <span
                  className="-mr-1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <PublicationFlag
                    pubId={pub.id}
                    flagNotes={pub.flag_notes ?? []}
                    size="sm"
                    decision={pub.decision}
                  />
                </span>
                <ChevronRight aria-hidden className="h-[15px] w-[15px] text-line-strong" />
              </div>
            </Link>
          );
        })
      )}

      {/* Footer: Count-Mono + Blättern (Zero-JS, URL-getrieben) */}
      <div className="flex items-center gap-3 bg-surface-muted px-[18px] py-3">
        <span className="font-mono text-[11.5px] text-ink-muted">
          {total > 0
            ? `${rangeStart}–${rangeEnd} von ${total.toLocaleString('de-AT')}`
            : '0 Publikationen'}
        </span>
        <span className="flex-1" />
        {totalPages > 1 && (
          <nav aria-label="Seiten" className="flex items-center gap-2">
            <PagerLink href={prevHref} label="Vorige Seite">
              <ChevronLeft className="h-4 w-4" />
            </PagerLink>
            <PagerLink href={nextHref} label="Nächste Seite">
              <ChevronRight className="h-4 w-4" />
            </PagerLink>
          </nav>
        )}
        <InfoBubble id="press_score" size="sm" />
      </div>
    </div>
  );
}

// Zero-JS-Blätter-Steuerelement im Kartenfuß. `disabled` (erste/letzte Seite)
// rendert einen inerten Button statt eines toten <a>.
function PagerLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  const disabled = href === '';
  const base =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-soft transition-colors';
  if (disabled) {
    return (
      <span aria-disabled className={`${base} opacity-40`} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-label={label}
      className={`${base} hover:bg-canvas`}
    >
      {children}
    </Link>
  );
}
