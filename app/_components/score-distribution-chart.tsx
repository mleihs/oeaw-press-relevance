'use client';

import { useEffect, useState } from 'react';

const BUCKET_LABELS = [
  '0-9%', '10-19%', '20-29%', '30-39%', '40-49%',
  '50-59%', '60-69%', '70-79%', '80-89%', '90-100%',
];
const BUCKET_COLORS = [
  'bg-chart-bucket-1',
  'bg-chart-bucket-2',
  'bg-chart-bucket-3',
  'bg-chart-bucket-4',
  'bg-chart-bucket-5',
  'bg-chart-bucket-6',
  'bg-chart-bucket-7',
  'bg-chart-bucket-8',
  'bg-chart-bucket-9',
  'bg-chart-bucket-10',
];

// 10-bucket histogram of press_score with a mount-time bar-grow-in. Lives
// next to the dashboard client because it's only consumed there. The
// `<ul class="sr-only">` mirror gives screen readers the same data without
// the decorative animation.
export function ScoreDistributionChart({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-1" role="presentation">
      <div className="flex items-end gap-1 h-32" aria-hidden="true">
        {buckets.map((count, i) => {
          const targetHeight = Math.max(count > 0 ? 4 : 0, (count / max) * 100);
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              {count > 0 && (
                <span
                  className={`text-[10px] text-muted-foreground mb-0.5 transition-opacity duration-300 motion-reduce:transition-none ${animated ? 'opacity-100' : 'opacity-0'}`}
                  style={{ transitionDelay: `${i * 50}ms` }}
                >
                  {count}
                </span>
              )}
              <div
                className={`w-full rounded-t ${BUCKET_COLORS[i]} transition-all duration-500 ease-out motion-reduce:transition-none`}
                style={{
                  height: animated ? `${targetHeight}%` : '0%',
                  transitionDelay: `${i * 50}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {BUCKET_LABELS.map((label, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
      {/* W3: AT-friendly equivalent of the visual chart. */}
      <ul className="sr-only" aria-label="StoryScore-Verteilung">
        {buckets.map((count, i) => (
          <li key={i}>{BUCKET_LABELS[i]}: {count} Publikationen</li>
        ))}
      </ul>
    </div>
  );
}
