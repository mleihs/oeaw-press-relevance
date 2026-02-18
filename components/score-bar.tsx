'use client';

import { SCORE_COLORS, SCORE_LABELS } from '@/lib/constants';

interface ScoreBarProps {
  dimension: string;
  value: number | null;
  compact?: boolean;
}

export function ScoreBar({ dimension, value, compact }: ScoreBarProps) {
  const color = SCORE_COLORS[dimension] || '#6b7280';
  const label = SCORE_LABELS[dimension] || dimension;
  const pct = value !== null ? Math.round(value * 100) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-16 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
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
        <span className="text-neutral-600">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

interface PressScoreBadgeProps {
  score: number | null;
}

export function PressScoreBadge({ score }: PressScoreBadgeProps) {
  if (score === null) return <span className="text-neutral-400 text-sm">N/A</span>;

  const pct = Math.round(score * 100);
  let bgColor = 'bg-neutral-100 text-neutral-600';
  if (pct >= 70) bgColor = 'bg-[#0047bb] text-white';
  else if (pct >= 50) bgColor = 'bg-amber-100 text-amber-800';
  else if (pct >= 30) bgColor = 'bg-orange-100 text-orange-800';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${bgColor}`}>
      {pct}%
    </span>
  );
}
