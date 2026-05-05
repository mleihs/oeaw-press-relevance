'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { PublicationWithRelations } from '@/lib/types';
import { useApiQuery } from '@/lib/use-api-query';
import { displayTitle } from '@/lib/html-utils';
import { doiToUrl } from '@/lib/enrichment/doi-utils';
import { ScoreBar } from '@/components/score-bar';
import { HaikuBlock } from '@/components/haiku-block';
import { PublicationFlag } from '@/components/publication-flag';
import { DecisionToolbar } from '@/components/decision-toolbar';
import { InfoBubble } from '@/components/info-bubble';
import {
  SOURCE_LABELS,
  SOURCE_BADGE_CLASSES as SOURCE_COLORS,
  SOURCE_DESCRIPTIONS,
  STATUS_LABELS,
  STATUS_COLORS,
  OA_LABELS,
} from '@/lib/constants';
import { getScoreBandClass, getScoreBandStoryLabel } from '@/lib/score-utils';
import { CapybaraLogo } from '@/components/capybara-logo';
import { MeistertaskButton } from './_components/meistertask-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  ExternalLink, FileText, Brain, ChevronRight, Info,
  Award, ShieldCheck, Megaphone, Users, Building2, FolderOpen, BookText,
  Mail, Crown,
} from 'lucide-react';

export default function PublicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: pub, error, isLoading } = useApiQuery<PublicationWithRelations>(
    ['publication-detail', id],
    `/api/publications/${id}`,
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <CapybaraLogo size="md" />
        <p className="text-sm text-neutral-500">Lade Publikation...</p>
      </div>
    );
  }

  if (error || !pub) {
    const message = error instanceof Error ? error.message : 'Publikation nicht gefunden';
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Breadcrumb />
        <Card className="border-red-200">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 font-medium">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const doiUrl = doiToUrl(pub.doi);
  const hasAnalysis = pub.analysis_status === 'analyzed' && pub.press_score !== null;
  const pressScorePct = pub.press_score !== null ? Math.round(pub.press_score * 100) : null;
  const titleForDisplay = displayTitle(pub.original_title || pub.title, pub.citation);
  const isMaHighlighted = pub.authors_resolved?.some((a) => a.mahighlight);
  const isHighlighted = pub.authors_resolved?.some((a) => a.highlight);
  // Match the lead_author string (typically "Lastname, Firstname") against
  // the resolved authors so the meta line can link to the person profile.
  const leadAuthorPerson = (() => {
    if (!pub.lead_author || !pub.authors_resolved?.length) return null;
    const norm = (s: string) => s.toLowerCase().replace(/[\s,.\-]/g, '');
    const target = norm(pub.lead_author);
    return pub.authors_resolved.find(
      (a) => norm(`${a.lastname}${a.firstname}`) === target ||
             norm(`${a.firstname}${a.lastname}`) === target,
    ) ?? null;
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Breadcrumb title={titleForDisplay} />

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <h1 className="text-2xl font-bold leading-tight flex-1">{titleForDisplay}</h1>
          <div className="mt-0.5 shrink-0">
            <PublicationFlag pubId={pub.id} flagNotes={pub.flag_notes ?? []} decision={pub.decision} />
          </div>
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

        {/* Lead author + date */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          {pub.lead_author && (
            leadAuthorPerson ? (
              <Link
                href={`/persons/${leadAuthorPerson.id}`}
                className="font-medium text-neutral-700 hover:text-brand transition-colors"
              >
                {pub.lead_author}
              </Link>
            ) : (
              <span className="font-medium text-neutral-700">{pub.lead_author}</span>
            )
          )}
          {pub.published_at && (
            <>
              {pub.lead_author && <span className="text-neutral-300">|</span>}
              <span>
                {new Date(pub.published_at).toLocaleDateString('de-AT', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            </>
          )}
          {pub.publication_type_lookup && (
            <>
              <span className="text-neutral-300">|</span>
              <span className="text-neutral-500">{pub.publication_type_lookup.name_de}</span>
            </>
          )}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          {pub.peer_reviewed && (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 gap-1">
              <ShieldCheck className="h-3 w-3" /> Peer-reviewed
            </Badge>
          )}
          {pub.popular_science && (
            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 gap-1">
              <Megaphone className="h-3 w-3" /> Popular Science
            </Badge>
          )}
          {pub.open_access_status && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
              {OA_LABELS[pub.open_access_status] || pub.open_access_status}
            </Badge>
          )}
          <Badge className={STATUS_COLORS[pub.enrichment_status] || STATUS_COLORS.pending}>
            {STATUS_LABELS[pub.enrichment_status] || pub.enrichment_status}
          </Badge>
          {hasAnalysis && (
            <Badge className={STATUS_COLORS.analyzed}>{STATUS_LABELS.analyzed}</Badge>
          )}
        </div>

        {/* Institutes inline */}
        {pub.orgunits && pub.orgunits.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Building2 className="h-3.5 w-3.5 text-neutral-400" />
            {pub.orgunits.map((o) => (
              <Tooltip key={o.id}>
                <TooltipTrigger asChild>
                  {o.url_de ? (
                    <a
                      href={o.url_de}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 transition-colors"
                    >
                      {o.akronym_de || o.name_de}
                    </a>
                  ) : (
                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {o.akronym_de || o.name_de}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">{o.name_de}</TooltipContent>
              </Tooltip>
            ))}
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

      {/* Decision-Toolbar */}
      <DecisionToolbar pub={pub} />

      {/* Pitch */}
      {hasAnalysis && pub.pitch_suggestion && (
        <Card className="border-brand/20 bg-brand/[0.02]">
          <CardContent className="p-5">
            <h3 className="text-xs font-medium text-brand uppercase mb-2">Pitch-Vorschlag</h3>
            <p className="text-sm leading-relaxed">{pub.pitch_suggestion}</p>
            {pub.suggested_angle && (
              <p className="text-sm text-neutral-600 mt-3">
                <span className="font-medium text-neutral-500">Blickwinkel:</span> {pub.suggested_angle}
              </p>
            )}
            {pub.target_audience && (
              <p className="text-sm text-neutral-600 mt-1">
                <span className="font-medium text-neutral-500">Zielgruppe:</span> {pub.target_audience}
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-brand/10 flex justify-end">
              <MeistertaskButton pub={pub} />
            </div>
          </CardContent>
        </Card>
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
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Deutsch</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{pub.summary_de}</p>
              </div>
            )}
            {pub.summary_en && pub.summary_en !== pub.summary_de && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">English</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{pub.summary_en}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Haiku — poetic distillation of the content, placed right after the summary */}
      {pub.haiku && (
        <Card>
          <CardContent className="px-5 py-4">
            <HaikuBlock haiku={pub.haiku} model={pub.llm_model} />
          </CardContent>
        </Card>
      )}

      {/* Authors */}
      {pub.authors_resolved && pub.authors_resolved.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-brand" />
              Autor:innen ({pub.authors_resolved.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-neutral-100">
              {pub.authors_resolved.map((a) => (
                <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
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
                        className="text-sm font-medium truncate hover:text-brand block"
                      >
                        {a.degree_before && <span className="text-neutral-500 font-normal mr-1">{a.degree_before}</span>}
                        {a.firstname} {a.lastname}
                        {a.degree_after && <span className="text-neutral-500 font-normal ml-1">{a.degree_after}</span>}
                        {a.deceased && <span className="text-neutral-400 ml-2 text-xs">†</span>}
                      </Link>
                      {a.oestat3_name_de && (
                        <p className="text-xs text-neutral-500 truncate">{a.oestat3_name_de}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.email && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={`mailto:${a.email}`} className="text-neutral-400 hover:text-brand">
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
                        className="text-xs font-mono text-neutral-400 hover:text-[#a6ce39]"
                      >
                        ORCID
                      </a>
                    )}
                    {a.authorship && (
                      <Badge variant="outline" className="text-[10px]">{a.authorship}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
                <div key={p.id} className="text-sm border-l-2 border-neutral-200 pl-3">
                  <div className="flex items-start gap-2">
                    <p className="font-medium flex-1">{p.title_de || p.title_en}</p>
                    {isActive && (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">aktiv</Badge>
                    )}
                    {p.cancelled && (
                      <Badge className="bg-red-100 text-red-700 text-[10px]">abgebrochen</Badge>
                    )}
                  </div>
                  {p.summary_de && (
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-3">{p.summary_de}</p>
                  )}
                  <p className="text-xs text-neutral-400 mt-1">
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

      {/* Analysis card */}
      {hasAnalysis && (
        <Card className="border-brand/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-brand" />
              StoryScout Analyse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center h-16 w-16 rounded-full text-xl font-bold ${
                getScoreBandClass(pub.press_score, 'hero')
              }`}>
                {pressScorePct}%
              </div>
              <div>
                <p className="font-medium text-lg flex items-center gap-1.5">
                  StoryScore
                  <InfoBubble id="press_score" size="md" />
                </p>
                <p className="text-sm text-neutral-500 inline-flex items-center gap-1">
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
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Begründung</h4>
                <p className="text-sm text-neutral-600">{pub.reasoning}</p>
              </div>
            )}
            {pub.llm_model && (
              <div className="text-xs text-neutral-400 border-t pt-3 inline-flex items-center gap-1">
                Modell: {pub.llm_model} | Kosten: ${pub.analysis_cost?.toFixed(4) || '0'}
                <InfoBubble id="ai_provenance" />
              </div>
            )}
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
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Quellen</h4>
              <div className="flex flex-wrap gap-1.5">
                {pub.enriched_source.split('+').map((src) => (
                  <span
                    key={src}
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${SOURCE_COLORS[src] || 'bg-neutral-100 text-neutral-600'}`}
                  >
                    {SOURCE_LABELS[src] || src}
                    <SourceInfoBubble source={src} />
                  </span>
                ))}
              </div>
            </div>
          )}
          {(pub.enriched_abstract || pub.abstract) && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Abstract</h4>
              <p className="text-sm leading-relaxed">
                {pub.enriched_abstract || pub.abstract}
              </p>
            </div>
          )}
          {pub.enriched_journal && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Journal</h4>
              <p className="text-sm">{pub.enriched_journal}</p>
            </div>
          )}
          {pub.enriched_keywords && pub.enriched_keywords.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Schlagwörter</h4>
              <div className="flex flex-wrap gap-1.5">
                {pub.enriched_keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                ))}
              </div>
            </div>
          )}
          {pub.full_text_snippet && <CollapsibleSnippet text={pub.full_text_snippet} />}
          {pub.word_count > 0 && (
            <div className="text-xs text-neutral-400 border-t pt-3">
              {pub.word_count.toLocaleString()} Wörter angereicherter Inhalt
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Breadcrumb({ title }: { title?: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-neutral-500">
      <Link href="/publications" className="hover:text-brand transition-colors">
        Publikationen
      </Link>
      {title && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-neutral-700 truncate max-w-[300px]">{title}</span>
        </>
      )}
    </nav>
  );
}

function SourceInfoBubble({ source }: { source: string }) {
  const desc = SOURCE_DESCRIPTIONS[source];
  if (!desc) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-current opacity-40 hover:opacity-80 transition-opacity ml-0.5">
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-52 font-normal">{desc}</TooltipContent>
    </Tooltip>
  );
}

function CollapsibleSnippet({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 500;
  const display = isLong && !expanded ? text.slice(0, 500) + '...' : text;
  return (
    <div>
      <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Textauszug</h4>
      <p className="text-sm text-neutral-600 whitespace-pre-wrap leading-relaxed">{display}</p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand hover:underline mt-1">
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}
