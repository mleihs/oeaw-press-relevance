'use client';

import { SCORE_COLORS, SCORE_LABELS } from '@/lib/constants';
import { getScoreBandClass, type ScoreBandVariant } from '@/lib/score-utils';
import { InfoBubble } from '@/components/info-bubble';
import type { EXPL } from '@/lib/explanations';

interface ScoreBarProps {
  dimension: string;
  value: number | null;
  compact?: boolean;
}

const DIM_TO_EXPL: Record<string, keyof typeof EXPL> = {
  public_accessibility: 'dim_public_accessibility',
  societal_relevance: 'dim_societal_relevance',
  novelty_factor: 'dim_novelty_factor',
  storytelling_potential: 'dim_storytelling_potential',
  media_timeliness: 'dim_media_timeliness',
};

export function ScoreBar({ dimension, value, compact }: ScoreBarProps) {
  const color = SCORE_COLORS[dimension] || '#6b7280';
  const label = SCORE_LABELS[dimension] || dimension;
  const pct = value !== null ? Math.round(value * 100) : 0;
  const explId = DIM_TO_EXPL[dimension];

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className="h-2 w-16 rounded-full bg-neutral-200 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${pct}%`}
        >
          <div
            className="h-full rounded-full transition-all duration-300 motion-reduce:transition-none"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs text-neutral-500">{pct}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1 text-neutral-600">
          {label}
          {explId && <InfoBubble id={explId} />}
        </span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div
        className="h-2.5 w-full rounded-full bg-neutral-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct}%`}
      >
        <div
          className="h-full rounded-full transition-all duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

interface PressScoreBadgeProps {
  score: number | null;
  variant?: ScoreBandVariant;
}

export function PressScoreBadge({ score, variant = 'badge' }: PressScoreBadgeProps) {
  if (score === null) return <span className="text-neutral-400 text-sm">N/A</span>;

  const pct = Math.round(score * 100);
  const bgColor = getScoreBandClass(score, variant);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${bgColor}`}
      aria-label={`StoryScore: ${pct}%`}
    >
      {pct}%
    </span>
  );
}
