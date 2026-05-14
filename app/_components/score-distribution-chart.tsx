'use client';

import { useEffect, useState } from 'react';

const BUCKET_LABELS = [
  '0-9', '10-19', '20-29', '30-39', '40-49',
  '50-59', '60-69', '70-79', '80-89', '90-100',
] as const;

interface Props {
  /** 10-bucket histogram of `press_score` (analyzed pubs). */
  scoreBuckets: number[];
  /** 10-bucket histogram of `press_similarity` (enriched pubs with embedding). */
  similarityBuckets: number[];
}

/**
 * Mirror histogram. StoryScore grows UP from a centred midline, Press-Similarity
 * grows DOWN. Both share the same X-axis (10 equal-width buckets across 0..1) and
 * the same Y-scale (shared max so magnitude differences stay visible).
 *
 * Mount-time bar-grow animation is staggered per-bucket for the optical reveal;
 * an `<ul class="sr-only">` mirrors the data for assistive tech without the
 * decorative motion.
 */
export function ScoreDistributionChart({ scoreBuckets, similarityBuckets }: Props) {
  const max = Math.max(...scoreBuckets, ...similarityBuckets, 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-3" role="presentation">
      {/* Legend */}
      <div className="flex items-center justify-end gap-4 text-[11px]" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand/85" />
          <span className="text-muted-foreground">StoryScore</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-purple-500/85" />
          <span className="text-muted-foreground">Press-Similarity</span>
        </span>
      </div>

      {/* Mirror body — StoryScore up, Press-Similarity down, x-axis between */}
      <div className="space-y-px" aria-hidden="true">
        {/* StoryScore — grows UP */}
        <div className="flex items-end gap-1 h-28">
          {scoreBuckets.map((count, i) => {
            const targetHeight = (count / max) * 100;
            return (
              <div key={`s-${i}`} className="flex flex-1 flex-col items-center justify-end h-full">
                {count > 0 && (
                  <span
                    className={`text-[9px] tabular-nums text-muted-foreground mb-0.5 transition-opacity duration-300 motion-reduce:transition-none ${animated ? 'opacity-100' : 'opacity-0'}`}
                    style={{ transitionDelay: `${i * 40}ms` }}
                  >
                    {count}
                  </span>
                )}
                <div
                  className="w-full rounded-t bg-brand/85 transition-all duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    height: animated ? `${targetHeight}%` : '0%',
                    transitionDelay: `${i * 40}ms`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Midline / X-axis label band */}
        <div className="flex gap-1 border-y border-border bg-muted/40">
          {BUCKET_LABELS.map((label, i) => (
            <div
              key={`label-${i}`}
              className="flex-1 py-1 text-center text-[9px] tabular-nums text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Press-Similarity — grows DOWN */}
        <div className="flex items-start gap-1 h-28">
          {similarityBuckets.map((count, i) => {
            const targetHeight = (count / max) * 100;
            return (
              <div key={`p-${i}`} className="flex flex-1 flex-col items-center justify-start h-full">
                <div
                  className="w-full rounded-b bg-purple-500/85 transition-all duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    height: animated ? `${targetHeight}%` : '0%',
                    transitionDelay: `${i * 40}ms`,
                  }}
                />
                {count > 0 && (
                  <span
                    className={`text-[9px] tabular-nums text-muted-foreground mt-0.5 transition-opacity duration-300 motion-reduce:transition-none ${animated ? 'opacity-100' : 'opacity-0'}`}
                    style={{ transitionDelay: `${i * 40}ms` }}
                  >
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AT-friendly equivalent of the visual chart */}
      <ul className="sr-only" aria-label="Score- und Similarity-Verteilung">
        {BUCKET_LABELS.map((label, i) => (
          <li key={i}>
            {label}%: StoryScore {scoreBuckets[i] ?? 0} Publikationen, Press-Similarity {similarityBuckets[i] ?? 0} Publikationen
          </li>
        ))}
      </ul>
    </div>
  );
}
