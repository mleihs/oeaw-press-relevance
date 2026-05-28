import Link from 'next/link';
import { ArrowRight, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PressScoreBadge } from '@/components/score-bar';
import { SimilarityIndicator } from '@/components/similarity-indicator';
import { DecisionBadge } from '@/components/decision-badge';
import { InfoBubble } from '@/components/info-bubble';
import { displayTitle } from '@/lib/shared/publication-display';
import { cn } from '@/lib/shared/utils';
import type { PressReleaseWithPub } from '@/lib/server/press-releases/list';

interface Props {
  rows: PressReleaseWithPub[];
  /** Amber tint orphan rows when present in the mixed `all` tab. */
  highlightOrphans: boolean;
}

/**
 * Server-rendered table for the `all` and `matched` tabs. Score/decision/
 * similarity pills are shared client components (radix tooltip + info
 * bubbles), so they hydrate as small islands; everything else is RSC.
 */
export function PressReleasesMainTable({ rows, highlightOrphans }: Props) {
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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
        </table>
      </div>
    </Card>
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
              {/* AlertCircle is decorative (status flag); the trailing
                  InfoBubble carries the actual "why is this Pub missing
                  from WebDB?" explanation — same dual-icon pattern as
                  the orphans-list description card so callers across the
                  page get a consistent rest-state alert + interactive
                  help affordance. */}
              <AlertCircle aria-hidden className="h-2.5 w-2.5" />
              Pub noch nicht in WebDB
              <InfoBubble id="orphan_press_release" size="sm" />
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
