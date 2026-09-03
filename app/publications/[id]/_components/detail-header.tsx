'use client';

import Link from 'next/link';
import {
  ExternalLink, Award, ShieldCheck, Megaphone, Building2,
  Crown, Info, AlertTriangle,
} from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import {
  matchAuthorByName,
  isRecentlyAdded,
  NEW_BADGE_DAYS,
} from '@/lib/shared/publication-display';
import { doiToUrl } from '@/lib/shared/doi-utils';
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  OA_LABELS,
} from '@/lib/shared/constants';
import { PublicationFlag } from '@/components/publication-flag';
import { InfoBubble } from '@/components/info-bubble';
import { StatusBanner } from '@/components/status-banner';
import { publicationCompleteness } from '@/lib/shared/completeness';
import { CreateCardButton } from '@/components/board/create-card-button';
import { ScoreNowButton } from '@/components/score-now-button';
import { publicationToCardSource } from '../_lib/publication-to-card-source';
import { Badge } from '@/components/ui/badge';
import { TintBadge } from '@/components/tint-badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

// Kurzformat für die Herkunfts-Zeitstempel (Eingang / letzte Änderung).
// Bewusst numerisch: die Zeile ist Meta-Information, kein Fließtext.
//
// timeZone GEPINNT, nicht optional: created_at/updated_at sind timestamptz, und
// diese Komponente rendert erst auf dem Server (dort UTC) und dann im Browser
// (dort Europe/Vienna). Ohne Pin fällt ein Zeitstempel zwischen 00:00 und 02:00
// MESZ server- und clientseitig auf VERSCHIEDENE Tage — falsches Datum plus
// Hydration-Mismatch. Gleiche Wahl wie app/events/_lib/event-format.ts und
// lib/server/ingest/status.ts.
const stampFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: 'Europe/Vienna',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

interface DetailHeaderProps {
  pub: PublicationWithRelations;
  titleForDisplay: string;
  hasAnalysis: boolean;
}

/** Header — volle Breite über beiden Spalten (Mock Z. 220–245): Titel,
 *  Lead-Autor:in, Badges, Herkunfts-Zeitstempel, Completeness-Banner,
 *  Institute-Chips und die Links-Zeile (DOI/Webseite/PDF). */
export function DetailHeader({ pub, titleForDisplay, hasAnalysis }: DetailHeaderProps) {
  const doiUrl = doiToUrl(pub.doi);
  // Per-publication verdict on why this pub does/doesn't carry a score, shown
  // as a banner below when there is no analysis (lib/shared/completeness.ts).
  const completeness = publicationCompleteness(pub);
  const isMaHighlighted = pub.authors_resolved?.some((a) => a.mahighlight);
  const isHighlighted = pub.authors_resolved?.some((a) => a.highlight);
  // Match the lead_author string (typically "Lastname, Firstname") against
  // the resolved authors so the meta line can link to the person profile.
  // Same normalisation as the CitationCard's per-author linker so both
  // surfaces resolve the same names identically.
  const leadAuthorPerson =
    pub.lead_author && pub.authors_resolved?.length
      ? matchAuthorByName(pub.lead_author, pub.authors_resolved)
      : null;

  return (
    <div className="space-y-3 max-md:-order-6 md:col-span-2">
      <div className="flex flex-wrap items-start gap-2">
        <h1 className="text-xl md:text-2xl font-bold leading-tight flex-1">{titleForDisplay}</h1>
        {/* Mobil wandern „Ins Board" in die Sticky-Bar und der Flag-Pin in
            den blauen Detail-Header (page.tsx) — hier Desktop-only. Comp
            Z. 226–229: Ins Board = blau gefüllt, Pin = umrandete Quadrat-Box. */}
        <div className="mt-0.5 shrink-0 hidden md:block">
          <CreateCardButton source={publicationToCardSource(pub, titleForDisplay)} variant="default" />
        </div>
        {/* Einzelbewertung direkt von hier: bis 2026-07-21 musste man dafür
            aufs Dashboard zurück und einen Batch starten, der genau diese
            Publikation womöglich gar nicht enthielt. */}
        <div className="mt-0.5 shrink-0 hidden md:block">
          <ScoreNowButton entity="publications" id={pub.id} size="default" />
        </div>
        <span className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-line-strong bg-surface md:inline-flex">
          <PublicationFlag pubId={pub.id} flagNotes={pub.flag_notes ?? []} decision={pub.decision} />
        </span>
        {isMaHighlighted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Crown className="h-5 w-5 text-amber-500 mt-1.5 shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top">Akademie-Mitglieder-Highlight</TooltipContent>
          </Tooltip>
        )}
        {isHighlighted && !isMaHighlighted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Award className="h-5 w-5 text-orange-500 mt-1.5 shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top">Autor-Highlight</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Lead author + date. When the lead-author string matches an OEAW
          person (external=false), name renders in brand-blue as a stronger
          link affordance for press triage; external matches stay neutral. */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/80">
        {pub.lead_author && (
          leadAuthorPerson ? (
            <Link
              href={`/persons/${leadAuthorPerson.id}`}
              className={cn(
                'font-medium hover:underline transition-colors',
                leadAuthorPerson.external
                  ? 'text-foreground hover:text-brand'
                  : 'text-brand',
              )}
            >
              {pub.lead_author}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{pub.lead_author}</span>
          )
        )}
        {pub.published_at && (
          <>
            {pub.lead_author && <span className="text-muted-foreground/50">|</span>}
            <span>
              {new Date(pub.published_at).toLocaleDateString('de-AT', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          </>
        )}
        {pub.publication_type_lookup && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-muted-foreground">{pub.publication_type_lookup.name_de}</span>
          </>
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2">
        {pub.peer_reviewed && (
          <span className="inline-flex items-center gap-1">
            <TintBadge color="blue" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Peer-reviewed
            </TintBadge>
            <InfoBubble id="peer_reviewed" size="sm" />
          </span>
        )}
        {pub.popular_science && (
          <span className="inline-flex items-center gap-1">
            <TintBadge color="purple" className="gap-1">
              <Megaphone className="h-3 w-3" /> Popular Science
            </TintBadge>
            <InfoBubble id="popular_science_badge" size="sm" />
          </span>
        )}
        {pub.open_access_status && (
          <span className="inline-flex items-center gap-1">
            <TintBadge color="emerald">
              {OA_LABELS[pub.open_access_status] || pub.open_access_status}
            </TintBadge>
            <InfoBubble id="open_access" size="sm" />
          </span>
        )}
        <Badge variant={STATUS_BADGE_VARIANTS[pub.enrichment_status] || 'neutral'}>
          {STATUS_LABELS[pub.enrichment_status] || pub.enrichment_status}
        </Badge>
        {hasAnalysis && (
          <Badge variant={STATUS_BADGE_VARIANTS.analyzed}>{STATUS_LABELS.analyzed}</Badge>
        )}
        {isRecentlyAdded(pub.created_at) && (
          <Badge variant="brand" title={`In den letzten ${NEW_BADGE_DAYS} Tagen hinzugefügt`}>
            Neu
          </Badge>
        )}
      </div>

      {/* Herkunfts-Zeitstempel. „Hinzugefügt" (created_at) war bisher
          nirgends in der UI sichtbar, obwohl es bestimmt, ob der
          Bewerten-Knopf eine Publikation überhaupt erfasst (Fenster
          SCORING_RECENT_DAYS). */}
      <div className="font-mono text-2xs text-ink-soft">
        Hinzugefügt am {stampFmt.format(new Date(pub.created_at))}
        {pub.updated_at && ` · zuletzt geändert ${stampFmt.format(new Date(pub.updated_at))}`}
      </div>

      {/* Why this publication carries no score yet — an individual,
          per-pub explanation derived from its actual state (content length,
          DOI, enrichment status). Only shown when there is no analysis;
          analyzed pubs render their Story Score / Pitch / Begründung below. */}
      {!hasAnalysis && (
        <StatusBanner
          variant={completeness.variant}
          icon={
            completeness.variant === 'warning' ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
            )
          }
        >
          <p className="font-medium">{completeness.headline}</p>
          <p className="mt-0.5 leading-relaxed opacity-90">{completeness.detail}</p>
        </StatusBanner>
      )}

      {/* Institutes inline. Derived chips (author-affiliation fallback for
          the ~4% of pubs WebDB didn't claim) render dashed + italic to
          flag the difference; tooltip notes "(via Co-Autor:in)". Mirrors
          the OrgunitChips treatment in components/publication-table.tsx so
          list and detail stay visually consistent. */}
      {pub.orgunits && pub.orgunits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
          {pub.orgunits.map((o) => {
            const derived = o.source === 'author_affiliation';
            const chipClass = derived
              ? 'rounded-md border border-dashed border-muted-foreground/40 italic text-muted-foreground/80 px-2 py-0.5 text-xs font-medium transition-colors'
              : 'rounded-md bg-muted hover:bg-muted/80 px-2 py-0.5 text-xs font-medium text-foreground transition-colors';
            const label = o.akronym_de || o.name_de;
            return (
              <Tooltip key={o.id}>
                <TooltipTrigger asChild>
                  {o.url_de ? (
                    <a
                      href={o.url_de}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={chipClass}
                    >
                      {label}
                    </a>
                  ) : (
                    <span className={chipClass}>{label}</span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {o.name_de}
                  {derived ? ' (via Co-Autor:in)' : ''}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <InfoBubble id="orgunit_chip" size="sm" />
        </div>
      )}

      {/* Links row */}
      <div className="flex flex-wrap gap-3 text-sm">
        {doiUrl && (
          <a href={doiUrl} target="_blank" rel="noopener noreferrer"
             className="text-brand hover:underline inline-flex items-center gap-1">
            DOI: {pub.doi} <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {pub.website_link && (
          <a href={pub.website_link} target="_blank" rel="noopener noreferrer"
             className="text-brand hover:underline inline-flex items-center gap-1">
            Webseite <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {pub.download_link && (
          <a href={pub.download_link} target="_blank" rel="noopener noreferrer"
             className="text-brand hover:underline inline-flex items-center gap-1">
            PDF <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
