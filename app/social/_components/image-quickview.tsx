'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

// Record<string, number> (not a named interface) so it satisfies Motion's
// animation Target index signature directly.
export type QuickviewRect = Record<string, number>;

/** Centered target box; the image is object-contain inside it, so the full
 *  (uncropped) post image is visible whatever its aspect ratio. */
export function quickviewTarget(): QuickviewRect {
  const w = Math.min(window.innerWidth * 0.92, 1000);
  const h = Math.min(window.innerHeight * 0.86, 820);
  return { width: w, height: h, top: (window.innerHeight - h) / 2, left: (window.innerWidth - w) / 2 };
}

/**
 * Click-to-expand image quickview: the thumbnail "grows out" to a full,
 * uncropped view via a measured-rect FLIP morph (animating geometry, not scale,
 * so rounded corners never distort), on a dim backdrop. Esc or a click closes
 * it (morphs back). Portaled to <body> so the card's overflow / hover-transform
 * never clips it. Reduced-motion → instant. The origin rect is measured by the
 * caller at click time (keeps measurement at the interaction, not in an effect).
 */
export function ImageQuickview({
  src,
  alt,
  origin,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  origin: QuickviewRect | null;
  open: boolean;
  onClose: () => void;
}) {
  // SSR/hydration guard: render nothing until mounted so server and first client
  // render match (both empty); only then attach the body portal.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot mount flag for the body portal
  useEffect(() => setMounted(true), []);

  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null; // the quickview trigger
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus?.(); // return focus to the trigger, not document start
    };
  }, [open, close]);

  if (!mounted) return null;
  const target = open ? quickviewTarget() : null;

  return createPortal(
    <AnimatePresence>
      {open && origin && target && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          {/* No bg/shadow on the box: object-contain letterboxes the image, and
              any box background would show as a darker frame beside it. The
              image sits directly on the backdrop. */}
          <motion.div
            className="absolute"
            initial={reduce ? false : origin}
            animate={target}
            exit={reduce ? undefined : origin}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="h-full w-full object-contain" />
          </motion.div>

          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Schließen"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
