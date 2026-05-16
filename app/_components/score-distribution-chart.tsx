'use client';

import { useEffect, useState } from 'react';
import {
  SIMILARITY_RANGE_MAX,
  SIMILARITY_RANGE_MIN,
} from '@/lib/shared/dashboard';

// Story Score histogram covers the full 0–100% range in 10 equal buckets.
const SCORE_LABELS = [
  '0–10', '10–20', '20–30', '30–40', '40–50',
  '50–60', '60–70', '70–80', '80–90', '90–100',
] as const;

// Press-Similarity histogram zooms into the SPECTER2-meaningful band.
// Labels derived from the shared constants so backend + frontend can't drift.
const SIMILARITY_LABELS = Array.from({ length: 10 }, (_, i) => {
  const step = (SIMILARITY_RANGE_MAX - SIMILARITY_RANGE_MIN) / 10;
  const lo = Math.round((SIMILARITY_RANGE_MIN + i * step) * 100);
  const hi = Math.round((SIMILARITY_RANGE_MIN + (i + 1) * step) * 100);
  return `${lo}–${hi}`;
});

interface Props {
  /** 10-bucket histogram of `press_score` across the full 0..1 range. */
  scoreBuckets: number[];
  /** 10-bucket histogram of `press_similarity` across SIMILARITY_RANGE_*. */
  similarityBuckets: number[];
}

/**
 * Mirror histogram with two independent X-axes.
 *
 *   ▆▇█▇▆▅▄        ← Story Score (grows up, axis: 0–100%)
 *   0  10 20 ...   ← Story Score X-axis labels
 *   ━━━━━━━━━━━    ← divider
 *   70 73 76 ...   ← Press-Similarity X-axis labels
 *      ▂▄▆▇▅▃     ← Press-Similarity (grows down, axis: 70–100%)
 *
 * The two distributions live on different X-scales because SPECTER2-cosine is
 * naturally clustered in the upper band even for unrelated papers — a shared
 * [0..1] axis would clump every similarity bucket against the right edge and
 * hide the actual distribution shape. The Y-scale is still shared (common
 * max across both series) so magnitude differences remain visible.
 *
 * An `<ul class="sr-only">` mirrors the data for assistive tech.
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
          <span className="text-muted-foreground">Story Score (0–100 %)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-purple-500/85" />
          <span className="text-muted-foreground">Press-Similarity (70–100 %, gezoomt)</span>
        </span>
      </div>

      <div className="space-y-px" aria-hidden="true">
        {/* Story Score — bars grow UP */}
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

        {/* Story Score X-axis labels — sit directly under the bars */}
        <div className="flex gap-1">
          {SCORE_LABELS.map((label, i) => (
            <div
              key={`sl-${i}`}
              className="flex-1 text-center text-[9px] tabular-nums text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Symmetry divider */}
        <div className="border-t border-border" />

        {/* Press-Similarity X-axis labels — sit directly above its bars */}
        <div className="flex gap-1">
          {SIMILARITY_LABELS.map((label, i) => (
            <div
              key={`pl-${i}`}
              className="flex-1 text-center text-[9px] tabular-nums text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Press-Similarity — bars grow DOWN */}
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
        {SCORE_LABELS.map((label, i) => (
          <li key={`sa-${i}`}>Story Score {label} %: {scoreBuckets[i] ?? 0} Publikationen</li>
        ))}
        {SIMILARITY_LABELS.map((label, i) => (
          <li key={`pa-${i}`}>Press-Similarity {label} %: {similarityBuckets[i] ?? 0} Publikationen</li>
        ))}
      </ul>
    </div>
  );
}
