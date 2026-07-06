'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink, FileText, Brain,
  Award, ShieldCheck, Megaphone, Users, Building2, FolderOpen, BookText,
  Mail, Crown, Newspaper, Info, AlertTriangle, Zap,
} from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import { matchAuthorByName } from '@/lib/shared/publication-display';
import { EnrichmentSourceBadge } from '@/components/enrichment-source-badge';
import { CitationCard } from './citation-card';
import { doiToUrl } from '@/lib/shared/doi-utils';
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  OA_LABELS,
} from '@/lib/shared/constants';
import { getScoreBandClass, getScoreBandStoryLabel } from '@/lib/shared/score-utils';
import { venueDisplayLabel } from '@/lib/shared/venue-registry';
import { ScoreBar } from '@/components/score-bar';
import { HaikuBlock } from '@/components/haiku-block';
import { PublicationFlag } from '@/components/publication-flag';
import { DecisionToolbar } from '@/components/decision-toolbar';
import { InfoBubble } from '@/components/info-bubble';
import { StatusBanner } from '@/components/status-banner';
import { publicationCompleteness } from '@/lib/shared/completeness';
import { MeistertaskButton } from '@/components/meistertask-button';
import { CreateCardButton } from '@/components/board/create-card-button';
import { publicationToCardSource } from '../_lib/publication-to-card-source';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TintBadge } from '@/components/tint-badge';
import { SectionLabel } from '@/components/section-label';
import { VenueDisplay } from '@/components/venue-display';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PressReferenceCard } from './press-reference-card';

interface Props {
  pub: PublicationWithRelations;
  titleForDisplay: string;
  abstractLooksGerman: boolean;
}

export function PublicationDetailClient({ pub, titleForDisplay, abstractLooksGerman }: Props) {
  const doiUrl = doiToUrl(pub.doi);
  const hasAnalysis = pub.analysis_status === 'analyzed' && pub.press_score !== null;
  // Per-publication verdict on why this pub does/doesn't carry a score, shown
  // as a banner below when there is no analysis (lib/shared/completeness.ts).
  const completeness = publicationCompleteness(pub);
  const pressScorePct = pub.press_score !== null ? Math.round(pub.press_score * 100) : null;
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
    // flex-col + gap statt space-y: erlaubt die Mobile-Reihenfolge (M6c, Mock
    // Z. 811ff: Score → Pitch zuerst) rein über order-Klassen, ohne die
    // Desktop-DOM-Ordnung anzufassen. max-md:pb-16 räumt die Sticky-Bar frei.
    <div className="flex flex-col gap-6 max-md:pb-16 md:grid md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] md:items-start md:gap-x-4 md:gap-y-6">
      {/* Header — volle Breite über beiden Spalten (Mock Z. 220–245) */}
      <div className="space-y-3 max-md:-order-6 md:col-span-2">
        <div className="flex flex-wrap items-start gap-2">
          <h1 className="text-xl md:text-2xl font-bold leading-tight flex-1">{titleForDisplay}</h1>
          {/* Mobil wandern „Ins Board" in die Sticky-Bar und der Flag-Pin in
              den blauen Detail-Header (page.tsx) — hier Desktop-only. Comp
              Z. 226–229: Ins Board = blau gefüllt, Pin = umrandete Quadrat-Box. */}
          <div className="mt-0.5 shrink-0 hidden md:block">
            <CreateCardButton source={publicationToCardSource(pub, titleForDisplay)} variant="default" />
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

      {/* ── Rechte Spalte (Mock Z. 305–351): sticky Relevanz-Analyse +
          Redaktionsentscheidung. Auf < md kollabiert das Grid zur Spalte, die
          `-order-5` schiebt sie mobil direkt hinter den Header (M6c). ── */}
      <div className="flex flex-col gap-4 md:col-start-2 md:row-start-2 md:sticky md:top-20 max-md:-order-5">
        {/* Relevanz-Analyse (Mock Z. 306–341) */}
        {hasAnalysis && (
          <Card className="border-brand/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-brand" />
                Relevanz-Analyse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                {/* Comp Z. 327 + 885: 72px-Kreis, Geist Mono 22px. */}
                <div className={`flex items-center justify-center h-[72px] w-[72px] shrink-0 rounded-full font-mono text-[22px] font-bold ${
                  getScoreBandClass(pub.press_score, 'hero')
                }`}>
                  {pressScorePct}%
                </div>
                <div>
                  <p className="font-medium text-lg flex items-center gap-1.5">
                    Story Score
                    <InfoBubble id="press_score" size="md" />
                  </p>
                  <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
                    {getScoreBandStoryLabel(pub.press_score)}
                    <InfoBubble id="score_band" />
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <ScoreBar dimension="public_accessibility" value={pub.public_accessibility} />
                <ScoreBar dimension="societal_relevance" value={pub.societal_relevance} />
                <ScoreBar dimension="novelty_factor" value={pub.novelty_factor} />
                <ScoreBar dimension="storytelling_potential" value={pub.storytelling_potential} />
                <ScoreBar dimension="media_timeliness" value={pub.media_timeliness} />
              </div>
              {pub.reasoning && (
                <div>
                  <SectionLabel className="inline-flex items-center gap-1">
                    Begründung
                    <InfoBubble id="reasoning" size="sm" />
                  </SectionLabel>
                  <p className="text-sm text-foreground/80">{pub.reasoning}</p>
                </div>
              )}
              {pub.llm_model && (
                <div className="text-xs text-muted-foreground/70 border-t pt-3 inline-flex items-center gap-1">
                  Modell: {pub.llm_model} | Kosten: ${pub.analysis_cost?.toFixed(4) || '0'}
                  <InfoBubble id="ai_provenance" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Redaktionsentscheidung (Mock Z. 343–350): Pitchen/Verwerfen. Wir
            behalten die volle DecisionToolbar (Rationale/Snooze) statt der
            zwei Mock-Buttons — page-eigene Kernfunktion (vetobar). */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Redaktionsentscheidung</CardTitle>
          </CardHeader>
          <CardContent>
            <DecisionToolbar pub={pub} />
          </CardContent>
        </Card>
      </div>

      {/* ── Linke Spalte (Mock Z. 224–302): Pitch, Haiku, Zusammenfassung,
          Autor:innen, externe Anreicherung + unsere Zusatz-Karten. ── */}
      <div className="flex flex-col gap-6 md:col-start-1 md:row-start-2 min-w-0">

      {/* ÖAW-Pressemitteilung (cross-reference zur TYPO3-news) */}
      {pub.press_release && (
        <Card className="border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/[0.06]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Newspaper className="h-5 w-5 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-medium text-emerald-900 dark:text-emerald-200 uppercase tracking-wide inline-flex items-center gap-1">
                  Bereits ÖAW-Pressemitteilung
                  <InfoBubble id="press_release_badge" size="sm" />
                </h3>
                <a
                  href={pub.press_release.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 font-medium text-emerald-900 dark:text-emerald-200 hover:underline"
                >
                  {pub.press_release.paper_title ?? pub.press_release.news_title ?? pub.press_release.url}
                  <ExternalLink className="inline-block h-3 w-3 ml-1 align-text-top" />
                </a>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  {pub.press_release.released_at && <>veröffentlicht am {pub.press_release.released_at} </>}
                  {pub.press_release.lang && <>· {pub.press_release.lang.toUpperCase()}</>}
                  {pub.press_release.journal && <> · {pub.press_release.journal}</>}
                  {pub.press_release.paper_year && <> ({pub.press_release.paper_year})</>}
                </p>
              </div>
            </div>
            {pub.press_release.abstract && (
              <details className="ml-8 group">
                <summary className="cursor-pointer text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-200 select-none">
                  Abstract anzeigen
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {pub.press_release.abstract}
                </p>
              </details>
            )}
            {pub.press_release.authors && pub.press_release.authors.length > 0 && (
              <p className="ml-8 text-xs text-foreground/80">
                <span className="font-medium text-emerald-900 dark:text-emerald-200">Autor:innen (Paper):</span>{' '}
                {pub.press_release.authors.slice(0, 5).join(', ')}
                {pub.press_release.authors.length > 5 && ` +${pub.press_release.authors.length - 5}`}
              </p>
            )}
            {pub.press_release.keywords && pub.press_release.keywords.length > 0 && (
              <div className="ml-8 flex flex-wrap gap-1">
                {pub.press_release.keywords.slice(0, 8).map((k, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Press-Referenz (semantic SPECTER2-similarity, lazy own query). */}
      <PressReferenceCard pubId={pub.id} abstractLooksGerman={abstractLooksGerman} />

      {/* Pitch — mobil an zweiter Stelle nach der Analyse */}
      {hasAnalysis && pub.pitch_suggestion && (
        <Card className="border-[#d3e2ff] bg-[#f6f9ff] dark:border-brand/25 dark:bg-brand/[0.08] max-md:-order-4">
          <CardContent className="p-5">
            <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-brand mb-2.5 inline-flex items-center gap-1.5">
              <Zap weight="fill" className="h-3.5 w-3.5" />
              Pitch-Vorschlag
              <InfoBubble id="pitch_suggestion" size="sm" />
            </h3>
            <p className="text-[15px] font-medium leading-relaxed">{pub.pitch_suggestion}</p>
            {pub.suggested_angle && (
              <p className="text-sm text-foreground/80 mt-3">
                <span className="font-semibold text-brand inline-flex items-center gap-1">
                  Blickwinkel:
                  <InfoBubble id="suggested_angle" size="sm" />
                </span>{' '}
                {pub.suggested_angle}
              </p>
            )}
            {pub.target_audience && (
              <p className="text-sm text-foreground/80 mt-1.5">
                <span className="font-semibold text-brand inline-flex items-center gap-1">
                  Zielgruppe:
                  <InfoBubble id="target_audience" size="sm" />
                </span>{' '}
                {pub.target_audience}
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-brand/10 flex justify-end items-center gap-1.5">
              <MeistertaskButton pub={pub} />
              <InfoBubble id="meistertask_pitch" size="sm" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Haiku — poetic distillation of the content, bewusst VOR der WebDB-
          Zusammenfassung platziert. Gradient-Karte nach Comp Z. 274–283
          (blauer Verlauf, Lotus). */}
      {pub.haiku && (
        <HaikuBlock haiku={pub.haiku} model={pub.llm_model} variant="gradient" />
      )}

      {/* Bilingual summaries from WebDB */}
      {(pub.summary_de || pub.summary_en) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookText className="h-4 w-4 text-brand" />
              Zusammenfassung (WebDB)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pub.summary_de && (
              <div>
                <SectionLabel>Deutsch</SectionLabel>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{decodeHtmlBlock(pub.summary_de)}</p>
              </div>
            )}
            {pub.summary_en && pub.summary_en !== pub.summary_de && (
              <div>
                <SectionLabel>English</SectionLabel>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{decodeHtmlBlock(pub.summary_en)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Authors. OEAW-linked persons (external=false) render in brand-blue
          as the press-triage signal: these are the realistic contact points.
          External co-authors stay neutral and carry an "Ext" badge so the
          distinction is visible without hover. The citation is shown as a
          footer so the full author string from the original publication is
          available even when WebDB's person_publications is sparse (the
          ~4% cohort the author-affiliation orgunit derivation also covers). */}
      {((pub.authors_resolved && pub.authors_resolved.length > 0) || pub.citation) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-brand" />
              Autor:innen
              {pub.authors_resolved && pub.authors_resolved.length > 0 && (() => {
                const total = pub.authors_resolved.length;
                const oeaw = pub.authors_resolved.filter((a) => !a.external).length;
                const ext = total - oeaw;
                let breakdown = '';
                if (oeaw && ext) breakdown = ` · ${oeaw} ÖAW, ${ext} extern`;
                else if (oeaw) breakdown = ` · alle ÖAW`;
                else if (ext) breakdown = ` · alle extern`;
                return (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({total}){breakdown}
                  </span>
                );
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pub.authors_resolved && pub.authors_resolved.length > 0 && (
              <ul className="divide-y divide-border/60">
                {pub.authors_resolved.map((a) => {
                  const isOeaw = !a.external;
                  const initials = `${a.firstname?.[0] ?? ''}${a.lastname?.[0] ?? ''}`.toUpperCase();
                  return (
                    <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Initialen-Avatar (Comp Z. 294 + 873): ÖAW = brand,
                            extern = grau — die Farbcodierung der Namenslinks
                            als zweites, schneller scanbares Signal. */}
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-white',
                            isOeaw ? 'bg-brand' : 'bg-line-strong dark:bg-muted-foreground/40',
                          )}
                        >
                          {initials}
                        </span>
                        {a.mahighlight && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top">Eigen-Highlight (Person hat diese Pub im WebDB selbst markiert)</TooltipContent>
                          </Tooltip>
                        )}
                        {!a.mahighlight && a.highlight && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Award className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top">Highlight</TooltipContent>
                          </Tooltip>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/persons/${a.id}`}
                            className={cn(
                              'text-sm font-medium truncate hover:underline block transition-colors',
                              isOeaw ? 'text-brand' : 'text-foreground hover:text-brand',
                            )}
                          >
                            {a.degree_before && <span className="text-muted-foreground font-normal mr-1">{a.degree_before}</span>}
                            {a.firstname} {a.lastname}
                            {a.degree_after && <span className="text-muted-foreground font-normal ml-1">{a.degree_after}</span>}
                            {a.deceased && <span className="text-muted-foreground/70 ml-2 text-xs">†</span>}
                          </Link>
                          {a.oestat3_name_de && (
                            <p className="text-xs text-muted-foreground truncate">{a.oestat3_name_de}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isOeaw && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Ext
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">Externe Person (kein OEAW-Personal)</TooltipContent>
                          </Tooltip>
                        )}
                        {a.email && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a href={`mailto:${a.email}`} className="text-muted-foreground/70 hover:text-brand">
                                <Mail className="h-3.5 w-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent side="top">{a.email}</TooltipContent>
                          </Tooltip>
                        )}
                        {a.orcid && (
                          <a
                            href={`https://orcid.org/${a.orcid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-muted-foreground/70 hover:text-[#a6ce39]"
                          >
                            ORCID
                          </a>
                        )}
                        {a.authorship && (
                          <Badge variant="outline" className="text-[10px]">{a.authorship}</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {pub.citation && (
              <div
                className={cn(
                  pub.authors_resolved && pub.authors_resolved.length > 0
                    ? 'border-t border-border/60 pt-3'
                    : '',
                )}
              >
                {pub.parsed_citation ? (
                  // Structured rendering for Pure (Elsevier) renderingHtml:
                  // bold title, author list with ÖAW authors linked in
                  // brand-blue, italic journal/host-book. ~45% of the corpus
                  // hits this path.
                  <CitationCard
                    parsed={pub.parsed_citation}
                    oeawAuthors={pub.authors_resolved ?? []}
                  />
                ) : (
                  // Fallback: raw citation isn't Pure HTML, just decode the
                  // entities + strip tags and dump as plain text.
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <SectionLabel>Vollständige Autor:innen-Angabe (laut Zitation)</SectionLabel>
                    <p className="mt-1 whitespace-pre-wrap">{decodeHtmlBlock(pub.citation)}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Projects */}
      {pub.projects && pub.projects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-brand" />
              Projekte ({pub.projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pub.projects.map((p) => {
              const isActive =
                p.ends_on && new Date(p.ends_on) > new Date() && !p.cancelled;
              return (
                <div key={p.id} className="text-sm border-l-2 border-border pl-3">
                  <div className="flex items-start gap-2">
                    <p className="font-medium flex-1">{p.title_de || p.title_en}</p>
                    {isActive && (
                      <TintBadge color="green" className="text-[10px]">aktiv</TintBadge>
                    )}
                    {p.cancelled && (
                      <TintBadge color="red" className="text-[10px]">abgebrochen</TintBadge>
                    )}
                  </div>
                  {p.summary_de && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.summary_de}</p>
                  )}
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {p.starts_on ? new Date(p.starts_on).getFullYear() : '?'}
                    {' – '}
                    {p.ends_on ? new Date(p.ends_on).getFullYear() : 'offen'}
                    {p.thematic_focus_de && ` | ${p.thematic_focus_de}`}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Enrichment card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand" />
            Externe Anreicherung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pub.enriched_source && (
            <div>
              <SectionLabel className="mb-2">Quellen</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {pub.enriched_source.split('+').map((src) => (
                  <EnrichmentSourceBadge key={src} source={src} />
                ))}
              </div>
            </div>
          )}
          {(pub.enriched_abstract || pub.abstract) && (
            <div>
              <SectionLabel>Abstract</SectionLabel>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {decodeHtmlBlock(pub.enriched_abstract || pub.abstract || '')}
              </p>
            </div>
          )}
          {pub.enriched_journal && (
            <div>
              <SectionLabel>{venueDisplayLabel(pub.enriched_journal)}</SectionLabel>
              <p className="text-sm">
                <VenueDisplay raw={pub.enriched_journal} />
              </p>
            </div>
          )}
          {pub.enriched_keywords && pub.enriched_keywords.length > 0 && (
            <div>
              <SectionLabel className="mb-2">Schlagwörter</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {pub.enriched_keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                ))}
              </div>
            </div>
          )}
          {pub.full_text_snippet && <CollapsibleSnippet text={pub.full_text_snippet} />}
          {pub.word_count > 0 && (
            <div className="text-xs text-muted-foreground/70 border-t pt-3">
              {pub.word_count.toLocaleString()} Wörter angereicherter Inhalt
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      {/* Ende linke Spalte */}

      {/* Sticky Mobile-Aktionsleiste über der Bottom-Tab-Nav (Mock Z. 886).
          Nur „Ins Board" — Verwerfen/Pitchen laufen über die DecisionToolbar
          oben (mit Rationale/Snooze), die mobil erhalten bleibt (vetobar). */}
      <div
        className="fixed inset-x-0 z-30 border-t border-line bg-surface px-3.5 py-2.5 md:hidden"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
      >
        <CreateCardButton
          source={publicationToCardSource(pub, titleForDisplay)}
          size="default"
          variant="default"
          wrapperClassName="flex w-full"
          className="flex-1"
        />
      </div>
    </div>
  );
}

function CollapsibleSnippet({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 500;
  const display = isLong && !expanded ? text.slice(0, 500) + '...' : text;
  return (
    <div>
      <SectionLabel>Textauszug</SectionLabel>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{display}</p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand hover:underline mt-1">
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}
