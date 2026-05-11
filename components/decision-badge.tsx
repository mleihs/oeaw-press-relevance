'use client';

import { Check, Pause, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { Decision } from '@/lib/shared/types';

/**
 * Single source of truth for decision-state visuals.
 *
 * Each variant carries everything *any* surface needs to render that decision
 * consistently: icon, label, accent border, plus three styling slots for the
 * three places this colour-language shows up:
 *
 *   - `badgePill`      compact filled pill (DecisionBadge, recap-counts)
 *   - `largeButton`    Pitch/Hold/Skip toolbar buttons (DecisionToolbar)
 *   - `iconButton`     icon-only button (PublicationFlag's lifecycle icon)
 *
 * Adding a new decision state means one edit here, and every surface picks it
 * up automatically — no Tailwind-token-drift between badge and button.
 */
export const DECISION_VARIANTS = {
  pitch: {
    Icon: Check,
    label: 'Pitch',
    accentBorder: 'border-l-green-500 dark:border-l-green-400',
    badgePill:
      'bg-green-100 text-green-800 ring-green-200 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/30',
    largeButton: {
      active: 'bg-green-600 text-white hover:bg-green-700',
      idle: 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-500/30 dark:text-green-300 dark:hover:bg-green-500/15',
    },
    iconButton: 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/15',
  },
  hold: {
    Icon: Pause,
    label: 'Hold',
    accentBorder: 'border-l-blue-500 dark:border-l-blue-400',
    badgePill:
      'bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30',
    largeButton: {
      active: 'bg-blue-600 text-white hover:bg-blue-700',
      idle: 'border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/15',
    },
    iconButton: 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/15',
  },
  skip: {
    Icon: XIcon,
    label: 'Skip',
    accentBorder: 'border-l-muted-foreground/40 dark:border-l-muted-foreground/60',
    badgePill: 'bg-muted text-muted-foreground ring-border',
    largeButton: {
      active: 'bg-foreground text-background hover:bg-foreground/90',
      idle: 'border-border text-muted-foreground hover:bg-muted',
    },
    iconButton: 'text-muted-foreground hover:bg-muted',
  },
} as const;

/** Human-readable label for any decision (incl. undecided → "Offen"). */
export function getDecisionLabel(d: Decision): string {
  return d === 'undecided' ? 'Offen' : DECISION_VARIANTS[d].label;
}

interface DecisionBadgeProps {
  decision: Decision | null | undefined;
}

/**
 * Compact pill rendering the triage-decision state. Returns `null` for
 * `undecided` / null so callers can drop it in unconditionally.
 */
export function DecisionBadge({ decision }: DecisionBadgeProps) {
  if (!decision || decision === 'undecided') return null;
  const v = DECISION_VARIANTS[decision];
  const Icon = v.Icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
        v.badgePill,
      )}
      aria-label={`Entscheidung: ${v.label}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {v.label}
    </span>
  );
}

/**
 * Tailwind class for a 4px left-border accent based on decision state.
 * Returns empty string for `undecided` or null.
 */
export function decisionAccentClass(decision: Decision | null | undefined): string {
  if (!decision || decision === 'undecided') return '';
  return `border-l-4 ${DECISION_VARIANTS[decision].accentBorder}`;
}
