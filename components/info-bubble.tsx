'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EXPL, type Explanation } from '@/lib/explanations';
import { useInfoBubblesEnabled } from '@/lib/use-info-bubbles';
import { cn } from '@/lib/utils';

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
 */
export function InfoBubble({
  id,
  content,
  size = 'sm',
  side = 'top',
  className,
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

  const expl = content ?? (id ? EXPL[id] : undefined);
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
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047bb]/50 focus-visible:opacity-100',
            pinned && 'opacity-100 text-[#0047bb]',
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
          <p className="text-sm font-medium text-neutral-900">{expl.title}</p>

          {expl.formula && (
            <div className="rounded bg-neutral-50 px-2 py-1.5 font-mono text-[10.5px] leading-snug text-neutral-700">
              {expl.formula}
            </div>
          )}

          <div className="space-y-1.5 text-neutral-600">{expl.body}</div>

          {expl.example && (
            <div className="rounded border border-dashed border-neutral-200 bg-neutral-50/40 px-2.5 py-1.5 text-[11px] text-neutral-600">
              {expl.example}
            </div>
          )}

          {expl.note && (
            <div className="rounded bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-900">
              {expl.note}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
