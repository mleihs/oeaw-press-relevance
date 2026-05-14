'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Sparkles, ChevronRight, Info, ExternalLink } from 'lucide-react';
import { useApiQuery } from '@/lib/client/hooks/use-api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { InfoBubble } from '@/components/info-bubble';
import { AtmosphericOrb } from '@/components/atmospheric-orb';

/** Discriminated union: `kind` narrows `publication_id` to non-null for
 *  matched pubs and to `null` for orphans — so the routing branch in
 *  <SimilarRow> doesn't need a runtime null-check alongside the kind. */
type SimilarPressed =
  | {
      kind: 'publication';
      publication_id: string;
      press_release_id: string;
      similarity: number;
      title: string;
      released_at: string | null;
      press_url: string;
    }
  | {
      kind: 'orphan';
      publication_id: null;
      press_release_id: string;
      similarity: number;
      title: string;
      released_at: string | null;
      press_url: string;
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
 * vs. the press cluster — matched pubs in publication_embeddings + orphan
 * press_releases in press_release_embeddings), plus the top-3 nearest
 * individual pressed items as concrete references.
 *
 * Rendered whenever the pub has an embedding. For already-pressed pubs
 * the score is still meaningful — `press_similarity` is the mean cosine
 * over the top-5 OTHER pressed pubs (self excluded via the
 * `exclude_pub_id` k-NN filter in `refresh_press_similarity_knn`), so
 * the value tells the editor "this paper sits X% deep in the cluster
 * alongside its peers" rather than the tautological "similar to itself".
 */
export function PressReferenceCard({
  pubId,
  abstractLooksGerman,
}: {
  pubId: string;
  /** When true, surfaces a hint about reduced embedding quality (SPECTER2 is
   *  English-trained; deutschsprachige Pubs sind im Korpus selten und unter
   *  den historisch gepressten praktisch nicht vertreten). The parent computes
   *  this from the publication's abstract via a stopword heuristic. */
  abstractLooksGerman?: boolean;
}) {
  const { data, isLoading } = useApiQuery<Response>(
    ['similar-pressed', pubId],
    `/api/publications/${pubId}/similar-pressed?limit=3`,
  );

  if (isLoading) return null;
  if (!data || data.press_similarity === null) return null;
  if ((data.similar?.length ?? 0) === 0) return null;

  const pct = Math.round(data.press_similarity * 100);
  const isGerman = abstractLooksGerman === true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="relative overflow-hidden border-purple-300/50 dark:border-purple-500/30 bg-gradient-to-br from-purple-50/60 via-purple-50/30 to-transparent dark:from-purple-500/[0.08] dark:via-purple-500/[0.04] dark:to-transparent">
        <AtmosphericOrb position="top-right" size="md" color="purple" />
        <CardContent className="relative p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2 shrink-0 ring-1 ring-purple-500/20">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                  Press-Referenz
                </h3>
                <InfoBubble id="press_similarity" size="sm" />
              </div>
              <p className="text-sm text-foreground mt-1.5 leading-snug">
                Semantisch{' '}
                <span className="font-bold text-purple-700 dark:text-purple-300 tabular-nums">
                  {pct}%
                </span>
                {' '}ähnlich zum historischen Press-Cluster.
              </p>
              {isGerman && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] italic text-purple-700/70 dark:text-purple-400/70 leading-snug">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                  <span>
                    SPECTER2 ist auf englischen Texten trainiert. Deutschsprachige
                    Pubs sind im Korpus selten und unter den historisch gepressten
                    praktisch nicht vertreten. Die Similarity hier ist nur
                    orientierend, nicht direkt vergleichbar.
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="ml-1 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-purple-700/80 dark:text-purple-400/80 font-semibold mb-1">
              Ähnlichste gepresste Publikationen
            </div>
            {data.similar.map((s, i) => (
              <motion.div
                key={s.press_release_id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.3 }}
              >
                <SimilarRow item={s} />
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Single-row renderer. Matched items link to the internal pub detail page;
 * orphans link out to the ÖAW press-release URL (no internal detail page
 * exists since the paper isn't in WebDB).
 */
function SimilarRow({ item }: { item: SimilarPressed }) {
  const pct = Math.round(item.similarity * 100);
  const dateLabel = item.released_at
    ? new Date(item.released_at).toLocaleDateString('de-AT', { year: 'numeric', month: 'short' })
    : null;

  const inner = (
    <>
      <span className="text-xs font-mono font-semibold text-purple-700 dark:text-purple-300 w-10 shrink-0 text-right tabular-nums">
        {pct}%
      </span>
      <span className="flex-1 truncate text-foreground/90">{item.title}</span>
      {dateLabel && (
        <span className="text-xs text-purple-600/80 dark:text-purple-400/80 shrink-0">
          {dateLabel}
        </span>
      )}
      {item.kind === 'orphan' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <ExternalLink className="h-3 w-3 text-purple-500/70 dark:text-purple-400/70 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            ÖAW-Pressemitteilung; das zugehörige Paper liegt noch nicht in der WebDB. Link öffnet die ÖAW-Newsseite.
          </TooltipContent>
        </Tooltip>
      ) : (
        <ChevronRight className="h-3 w-3 text-purple-500/60 dark:text-purple-400/60 shrink-0 transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );

  const rowClass = 'group flex items-center gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-purple-500/10 transition-colors';

  // Discriminated union narrows publication_id automatically — no runtime null-check needed.
  if (item.kind === 'publication') {
    return (
      <Link href={`/publications/${item.publication_id}`} className={rowClass}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={item.press_url}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClass}
    >
      {inner}
    </a>
  );
}
