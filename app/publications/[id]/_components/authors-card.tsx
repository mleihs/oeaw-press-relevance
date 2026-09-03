'use client';

import Link from 'next/link';
import { Award, Users, Mail, Crown } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import { CitationCard } from './citation-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/section-label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface AuthorsCardProps {
  pub: PublicationWithRelations;
}

/** Authors. OEAW-linked persons (external=false) render in brand-blue
 *  as the press-triage signal: these are the realistic contact points.
 *  External co-authors stay neutral and carry an "Ext" badge so the
 *  distinction is visible without hover. The citation is shown as a
 *  footer so the full author string from the original publication is
 *  available even when WebDB's person_publications is sparse (the
 *  ~4% cohort the author-affiliation orgunit derivation also covers). */
export function AuthorsCard({ pub }: AuthorsCardProps) {
  if (!((pub.authors_resolved && pub.authors_resolved.length > 0) || pub.citation)) return null;

  return (
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
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
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
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
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
                      <Badge variant="outline" className="text-2xs">{a.authorship}</Badge>
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
  );
}
