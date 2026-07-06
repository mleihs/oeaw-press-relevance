// No `'use client'` directive: this is a hookless display component.
// Constants + a pure-render Badge + a pure helper. The Next.js build
// bundles it to the client tree on demand (when imported by a client
// component) without us forcing the boundary here. Same convention as
// `citation-card.tsx`, `enrichment-source-badge.tsx`.
import { Check, Pause, X as XIcon } from '@/lib/icons';
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
  // Farben hängen an den State-Tokens (Fixplan F4): pitch=success, hold=info
  // (= ÖAW-Blau). Die Tints (bg-*-tint) flippen in dark über die Token-
  // Overrides in globals.css; die State-Textfarben bleiben dort light-Werte,
  // deshalb heben dark:-Lifts auf die Familien-Nachbarn (emerald-300/-400,
  // brand-300) — gleiche Konvention wie badge.tsx info/success.
  pitch: {
    Icon: Check,
    label: 'Pitch',
    accentBorder: 'border-l-success dark:border-l-emerald-400',
    badgePill:
      'bg-success-tint text-success ring-success/25 dark:text-emerald-300 dark:ring-success/40',
    largeButton: {
      active: 'bg-success text-white hover:bg-success/90',
      idle: 'border-success/40 text-success hover:bg-success-tint dark:text-emerald-300',
    },
    iconButton: 'text-success hover:bg-success-tint dark:text-emerald-400',
  },
  hold: {
    Icon: Pause,
    label: 'Hold',
    accentBorder: 'border-l-info dark:border-l-brand-300',
    badgePill:
      'bg-info-tint text-info ring-info/25 dark:text-brand-300 dark:ring-info/40',
    largeButton: {
      active: 'bg-info text-white hover:bg-info/90',
      idle: 'border-info/40 text-info hover:bg-info-tint dark:border-brand-300/30 dark:text-brand-300',
    },
    iconButton: 'text-info hover:bg-info-tint dark:text-brand-300',
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
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset',
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
