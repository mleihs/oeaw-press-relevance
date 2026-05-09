'use client';

import Link from 'next/link';
import { Sparkles, ChevronRight, Info } from 'lucide-react';
import { useApiQuery } from '@/lib/use-api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type SimilarPressed = {
  publication_id: string;
  similarity: number;
  title: string;
  released_at: string | null;
};

type Response = {
  publication_id: string;
  press_similarity: number | null;
  model: string;
  similar: SimilarPressed[];
};

/**
 * Card on the publication detail page showing how semantically close this
 * pub is to the historical ÖAW press-cluster (SPECTER2 embedding cosine
 * vs. centroid of the 101 historically pressed pubs), plus the top-3
 * nearest individual pressed pubs as concrete references.
 *
 * Only rendered when the pub has an embedding and is NOT itself already
 * pressed (otherwise the card would just say "this pub is most similar
 * to itself", which is noise).
 */
export function PressReferenceCard({
  pubId,
  isPressed,
}: {
  pubId: string;
  isPressed: boolean;
}) {
  const { data, isLoading } = useApiQuery<Response>(
    ['similar-pressed', pubId],
    `/api/publications/${pubId}/similar-pressed?limit=3`,
  );

  if (isLoading) return null;
  if (isPressed) return null;
  if (!data || data.press_similarity === null) return null;
  if ((data.similar?.length ?? 0) === 0) return null;

  const pct = Math.round(data.press_similarity * 100);

  return (
    <Card className="border-purple-200 bg-purple-50/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-purple-700 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-medium text-purple-900 uppercase tracking-wide">
                Press-Referenz
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-purple-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md text-xs">
                  Cosinus-Ähnlichkeit des SPECTER2-Embeddings (Title + Abstract) zum
                  Schwerpunkt aller historisch ÖAW-gepressten Publikationen.
                  Hohe Ähnlichkeit heißt: thematisch und sprachlich nahe an dem,
                  was die Pressestelle bisher pitchwürdig fand.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-purple-900 mt-1">
              Diese Publikation ist semantisch{' '}
              <span className="font-semibold">{pct}%</span>{' '}
              ähnlich zum historischen Press-Cluster.
            </p>
          </div>
        </div>

        <div className="ml-8 space-y-1.5">
          <div className="text-xs uppercase text-purple-700 font-medium">
            Ähnlichste gepresste Publikationen
          </div>
          {data.similar.map((s) => (
            <Link
              key={s.publication_id}
              href={`/publications/${s.publication_id}`}
              className="flex items-center gap-2 text-sm rounded px-1.5 py-1 hover:bg-purple-100/60 transition-colors"
            >
              <span className="text-xs font-mono text-purple-700 w-12 shrink-0 text-right">
                {Math.round(s.similarity * 100)}%
              </span>
              <span className="flex-1 truncate text-neutral-800">{s.title}</span>
              {s.released_at && (
                <span className="text-xs text-purple-600 shrink-0">
                  {new Date(s.released_at).toLocaleDateString('de-AT', {
                    year: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
              <ChevronRight className="h-3 w-3 text-purple-400 shrink-0" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
