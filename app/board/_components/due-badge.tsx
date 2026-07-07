'use client';

import { Clock, AlarmClock } from '@/lib/icons';
import { dueState, formatDueLabel } from '../_lib/due';

// Fälligkeits-Badge mit overdue/soon/normal-Zuständen (Design Book §2.3).
// Konsumiert die Phase-A-Tokens (bg-*-tint + Zustandstext) statt Inline-Hex.
const STYLES: Record<'overdue' | 'soon' | 'normal', string> = {
  // Überfällig in Bernstein (warning) statt Alarm-Rot — passt zur warmen
  // Kartentönung; warning-ink liest kräftig auf dem Tint.
  overdue: 'text-warning-ink bg-warning-tint',
  soon: 'text-soon bg-soon-tint',
  normal: 'text-ink-soft bg-fill',
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
  const Icon = state === 'overdue' ? AlarmClock : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-2xs font-medium ${STYLES[state]}`}
    >
      <Icon className="h-3 w-3" />
      {formatDueLabel(dueAt)}
    </span>
  );
}
