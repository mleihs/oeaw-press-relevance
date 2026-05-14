'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, ChevronDown, Sparkles } from 'lucide-react';
import { changelogBackground, changelogClosing, changelogEntries } from '@/lib/shared/changelog';

interface Props {
  className?: string;
}

/**
 * Floating „Was ist neu"-Panel anchored to a trigger button.
 *
 * The popover is rendered via `createPortal` into `document.body` because the
 * dashboard hero (its visual home) carries `overflow-hidden` for the
 * AtmosphericOrb gradients. A plain absolute-positioned child would get
 * clipped at the hero's bottom edge. Fixed positioning + portal lifts the
 * popover out of every ancestor's clip and stacking context.
 */
export function ChangelogPanel({ className }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // SSR guard: createPortal needs document, which only exists in the browser.
  useEffect(() => setMounted(true), []);

  // Measure the trigger's position the moment the panel opens (and again on
  // resize so the layout stays correct when the viewport changes).
  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    const measure = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 12, // 12 px breathing space below the button
        right: window.innerWidth - rect.right, // right-align panel edge to button edge
      });
    };
    measure();
    window.addEventListener('resize', measure);
    // Close on scroll — fixed-position panels detach from their anchor as the
    // page scrolls past them; closing is the least-confusing behaviour.
    const onScroll = () => setOpen(false);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open]);

  // Esc closes; outside-click closes (but clicks inside the portal-rendered
  // panel must not count as outside).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      const panel = document.getElementById('changelog-content');
      if (panel?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const wrapperClass = ['relative inline-block', className].filter(Boolean).join(' ');

  const popover = (
    <AnimatePresence>
      {open && panelPos && (
        <motion.div
          id="changelog-content"
          role="region"
          aria-labelledby="changelog-heading"
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.6 }}
          style={{ top: panelPos.top, right: panelPos.right }}
          className="fixed z-50 w-[min(28rem,calc(100vw-2rem))] origin-top-right rounded-xl border border-border/80 bg-gradient-to-br from-card to-muted/50 p-6 shadow-[0_16px_48px_-16px_rgba(0,71,187,0.3),0_2px_8px_-2px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden />
            <h2
              id="changelog-heading"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Was ist neu
            </h2>
          </div>
          <dl className="mt-4 space-y-3.5 text-sm">
            {changelogEntries.map((entry, i) => (
              <motion.div
                key={entry.title}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 + i * 0.04, duration: 0.22, ease: 'easeOut' }}
              >
                <dt className="flex items-center gap-2 font-semibold text-brand">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                  {entry.href ? (
                    <Link
                      href={entry.href}
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1 hover:underline underline-offset-2 decoration-brand/40"
                    >
                      {entry.title}
                      <ArrowUpRight className="h-3 w-3 opacity-70" aria-hidden />
                      <span className="sr-only">(im Hilfe-Center)</span>
                    </Link>
                  ) : (
                    <span>{entry.title}</span>
                  )}
                </dt>
                <dd className="ml-3.5 mt-1 leading-snug text-foreground/90">{entry.body}</dd>
              </motion.div>
            ))}
          </dl>
          <hr className="mt-5 border-border/60" />
          <p className="mt-3 text-xs leading-relaxed text-foreground/80">{changelogBackground}</p>
          <p className="mt-2 text-xs italic text-muted-foreground">{changelogClosing}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-controls="changelog-content"
        className="group inline-flex items-center gap-2 rounded-full border border-border bg-gradient-to-br from-card to-muted/50 px-4 py-2 text-sm font-medium text-foreground shadow-[0_2px_18px_-10px_rgba(0,71,187,0.25)] transition hover:border-brand/30 hover:shadow-[0_4px_24px_-8px_rgba(0,71,187,0.35)]"
      >
        <motion.span
          aria-hidden
          animate={open ? { rotate: 0, scale: 1.1 } : { rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="inline-flex"
        >
          <Sparkles className="h-4 w-4 text-brand" />
        </motion.span>
        <span>Was ist neu</span>
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand tabular-nums">
          {changelogEntries.length}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          className="inline-flex"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
        </motion.span>
      </button>

      {mounted && createPortal(popover, document.body)}
    </div>
  );
}
