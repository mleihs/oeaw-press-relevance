'use client';

import { Clock, AlarmClock } from 'lucide-react';
import { dueState, formatDueLabel } from '../_lib/due';

// Fälligkeits-Badge mit overdue/soon/normal-Zuständen (Design Book §1.6).
const STYLES: Record<'overdue' | 'soon' | 'normal', { color: string; bg: string }> = {
  overdue: { color: '#dc2626', bg: '#fdeaea' },
  soon: { color: '#c2410c', bg: '#fdeee3' },
  normal: { color: '#475262', bg: '#eef1f5' },
};

export function DueBadge({
  dueAt,
  completedAt,
}: {
  dueAt: string | null;
  completedAt: string | null;
}) {
  const state = dueState(dueAt, completedAt);
  if (state === 'none' || !dueAt) return null;
  const s = STYLES[state];
  const Icon = state === 'overdue' ? AlarmClock : Clock;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <Icon className="h-3 w-3" />
      {formatDueLabel(dueAt)}
    </span>
  );
}
