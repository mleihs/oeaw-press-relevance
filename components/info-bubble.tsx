'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Info } from '@/lib/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EXPL, EXPL_KB_MAP, type Explanation, type KbAnchor } from '@/lib/client/explanations';
import { useInfoBubblesEnabled } from '@/lib/client/hooks/use-info-bubbles';
import { cn } from '@/lib/shared/utils';

interface InfoBubbleProps {
  /** Key into the central EXPL map. */
  id?: keyof typeof EXPL;
  /** Override / inline content. */
  content?: Explanation;
  /** Visual size. */
  size?: 'sm' | 'md';
  /** Side of the popover. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  /** Optional KB deep-link; overrides the auto-lookup via EXPL_KB_MAP. */
  kbAnchor?: KbAnchor;
}

const SIZES = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Pointer-capability detection. True on devices with a real mouse / fine pointer
 * (desktops, laptops); false on phones, tablets, touch-only devices.
 *
 * SSR-safe via useSyncExternalStore: the server snapshot returns true (desktop default,
 * matching most users); the client subscribes to the media query and reconciles.
 */
function useCanHover(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(HOVER_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(HOVER_QUERY).matches,
    () => true,
  );
}

/**
 * InfoBubble — hybrid hover+touch+click+focus trigger that opens a Popover with
 * a structured explanation (title / formula / body / example / note).
 *
 * Behaviour matrix:
 *   - Desktop hover         → opens on enter, closes on leave (unless pinned)
 *   - Click                 → toggles "pinned" state; pinned popovers stay open
 *   - Touch tap             → equivalent to a click (no hover events fire)
 *   - Keyboard focus        → opens on focus, closes on blur (unless pinned)
 *   - Outside click         → closes (Radix handles, also unpins)
 *   - Escape key            → closes (Radix handles)
 *
 * stopPropagation on click is required: bubbles often live inside <Link> rows
 * (leaderboard table, pub list); without it, every click would navigate away.
 *
 * The whole component renders nothing when the user has globally disabled bubbles
 * via the nav toggle (useInfoBubblesEnabled).
 *
 * ## Spacing convention (callers, please honour)
 *
 * InfoBubble is intentionally margin-free. When it sits next to text or an
 * icon, the parent container is responsible for the gap. The codebase
 * standardises on `gap-1` on an `inline-flex` (or `flex`) `items-center`
 * wrapper:
 *
 *     <span className="inline-flex items-center gap-1">
 *       Label
 *       <InfoBubble id="…" />
 *     </span>
 *
 * Reason for the parent-owns-spacing rule: InfoBubble also gets used as a
 * standalone child (table column headers, last cell in a row) where any
 * built-in `ml-*` would push it off the grid. Modern Flexbox `gap` doesn't
 * compound on standalone use, so it stays the safer default than baking
 * a margin into the component.
 *
 * Composites that already bundle a label + colour + InfoBubble in the
 * right layout — prefer these over rolling the wrapper yourself when the
 * same visual pattern repeats across more than one file:
 *
 *   - `components/enrichment-source-badge.tsx` (CrossRef / OpenAlex /
 *     Unpaywall / SemanticScholar / PDF source pills)
 *   - `StatusBadge` (local in `components/publication-table.tsx`) for
 *     enrichment status pills
 */
export function InfoBubble({
  id,
  content,
  size = 'sm',
  side = 'top',
  className,
  kbAnchor,
}: InfoBubbleProps) {
  const [globalEnabled] = useInfoBubblesEnabled();
  const canHover = useCanHover();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Debounce hover open/close to mirror the old HoverCard's openDelay/closeDelay UX —
  // prevents popups from flashing while the cursor passes through dense rows.
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const expl: Explanation | undefined = content ?? (id ? EXPL[id] : undefined);
  const link = kbAnchor ?? (id ? EXPL_KB_MAP[id] : undefined);
  if (!expl || !globalEnabled) return null;

  const cancelTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const handleEnter = () => {
    if (!canHover || pinned) return;
    cancelTimers();
    openTimer.current = setTimeout(() => setOpen(true), 120);
  };
  const handleLeave = () => {
    if (!canHover || pinned) return;
    cancelTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    cancelTimers();
    if (pinned) {
      setPinned(false);
      setOpen(false);
    } else {
      setPinned(true);
      setOpen(true);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPinned(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Erklärung: ${expl.title}`}
          aria-expanded={open}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onClick={handleClick}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (!pinned) setOpen(false);
          }}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded text-current',
            'opacity-40 hover:opacity-90 transition-opacity',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:opacity-100',
            pinned && 'opacity-100 text-brand',
            className,
          )}
        >
          <Info className={SIZES[size]} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={6}
        // Hover-open should not steal focus (Radix default); pin-open / focus-open is OK to focus.
        onOpenAutoFocus={(e) => {
          if (!pinned) e.preventDefault();
        }}
        // Bridge the gap: hovering onto the popover should not trigger close on the trigger.
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        // Stop propagation so clicks inside the popover (e.g., on links) don't fire on parent rows.
        onClick={(e) => e.stopPropagation()}
        className="w-80 max-w-[90vw] p-4 text-xs"
      >
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{expl.title}</p>

          {expl.formula && (
            <div className="rounded bg-muted px-2 py-1.5 font-mono text-[10.5px] leading-snug text-foreground/90">
              {expl.formula}
            </div>
          )}

          <div className="space-y-1.5 text-foreground/80">{expl.body}</div>

          {expl.example && (
            <div className="rounded border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground/80">
              {expl.example}
            </div>
          )}

          {expl.note && (
            <div className="rounded bg-amber-50/60 dark:bg-amber-500/[0.08] px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
              {expl.note}
            </div>
          )}

          {link && (
            <Link
              href={link.hash ? `${link.path}#${link.hash}` : link.path}
              onClick={(e) => e.stopPropagation()}
              className="inline-block pt-0.5 text-[11px] font-medium text-brand/80 hover:text-brand hover:underline transition-colors"
            >
              Mehr im Hilfe-Center →
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
