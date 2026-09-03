'use client';

import { Newspaper, ExternalLink } from '@/lib/icons';
import type { PublicationWithRelations } from '@/lib/shared/types';
import { InfoBubble } from '@/components/info-bubble';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PressReleaseCardProps {
  pub: PublicationWithRelations;
}

/** ÖAW-Pressemitteilung (cross-reference zur TYPO3-news). */
export function PressReleaseCard({ pub }: PressReleaseCardProps) {
  const pressRelease = pub.press_release;
  if (!pressRelease) return null;

  return (
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
              href={pressRelease.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-1 font-medium text-emerald-900 dark:text-emerald-200 hover:underline"
            >
              {pressRelease.paper_title ?? pressRelease.news_title ?? pressRelease.url}
              <ExternalLink className="inline-block h-3 w-3 ml-1 align-text-top" />
            </a>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              {pressRelease.released_at && <>veröffentlicht am {pressRelease.released_at} </>}
              {pressRelease.lang && <>· {pressRelease.lang.toUpperCase()}</>}
              {pressRelease.journal && <> · {pressRelease.journal}</>}
              {pressRelease.paper_year && <> ({pressRelease.paper_year})</>}
            </p>
          </div>
        </div>
        {pressRelease.abstract && (
          <details className="ml-8 group">
            <summary className="cursor-pointer text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-200 select-none">
              Abstract anzeigen
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {pressRelease.abstract}
            </p>
          </details>
        )}
        {pressRelease.authors && pressRelease.authors.length > 0 && (
          <p className="ml-8 text-xs text-foreground/80">
            <span className="font-medium text-emerald-900 dark:text-emerald-200">Autor:innen (Paper):</span>{' '}
            {pressRelease.authors.slice(0, 5).join(', ')}
            {pressRelease.authors.length > 5 && ` +${pressRelease.authors.length - 5}`}
          </p>
        )}
        {pressRelease.keywords && pressRelease.keywords.length > 0 && (
          <div className="ml-8 flex flex-wrap gap-1">
            {pressRelease.keywords.slice(0, 8).map((k, i) => (
              <Badge key={i} variant="secondary" className="text-2xs">{k}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
