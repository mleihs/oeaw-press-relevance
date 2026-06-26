'use client';

import { useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, ZoomIn } from 'lucide-react';

/**
 * Image lightbox with a measured-rect FLIP morph: the full-size image flies
 * out of the trigger's exact on-screen box and back.
 *
 * Why this is built on Radix *primitives* (not the shadcn `Dialog` wrapper):
 * the wrapper bakes in its own zoom/fade animation, which we'd have to fight
 * with `!important`. Composing the primitives directly keeps the only motion
 * the FLIP, with zero overrides. `AnimatePresence` + `forceMount` makes Radix
 * defer unmount to Motion, so enter and exit are symmetric.
 *
 * Safari note: the box is animated by *geometry* (top/left/width/height), not
 * `scale`, so a constant px `borderRadius` cannot distort mid-morph — no
 * radius-correction hack needed. No `backdrop-filter` either (Safari
 * stacking/perf bugs).
 *
 * `children` (the resting visual / trigger, e.g. CapybaraGlitch) stays
 * permanently mounted — the lightbox never touches its lifecycle.
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CapybaraLightboxProps {
  /** High-res source. Use the raw (non-alpha) PNG: it carries its own paper
   *  background so it reads correctly on the dark scrim. */
  src: string;
  alt: string;
  width: number;
  height: number;
  children: ReactNode;
}

function targetRect(): Rect {
  const s = Math.min(
    window.innerWidth * 0.92,
    window.innerHeight * 0.86,
    880,
  );
  return {
    width: s,
    height: s,
    top: (window.innerHeight - s) / 2,
    left: (window.innerWidth - s) / 2,
  };
}

export function CapybaraLightbox({
  src,
  alt,
  width,
  height,
  children,
}: CapybaraLightboxProps) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  function handleOpenChange(next: boolean) {
    if (next && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setOrigin({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    setOpen(next);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Capybara in voller Größe ansehen"
          className="group relative shrink-0 cursor-zoom-in rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
          <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center justify-center rounded-full bg-background/80 p-1 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
            <ZoomIn className="h-3.5 w-3.5" />
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <AnimatePresence>
        {open && origin && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div className="fixed inset-0 z-50 outline-none">
                <DialogPrimitive.Title className="sr-only">
                  Science Propaganda Ninja Capybara in voller Größe
                </DialogPrimitive.Title>

                {/* Backdrop catcher: click anywhere (incl. the image, which is
                    pointer-events-none) closes. tabIndex -1 so the visible X
                    is the focusable close target Radix autofocuses. */}
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    aria-label="Schließen"
                    tabIndex={-1}
                    className="absolute inset-0 h-full w-full cursor-zoom-out"
                  />
                </DialogPrimitive.Close>

                <motion.div
                  className="pointer-events-none fixed overflow-hidden shadow-2xl"
                  style={{ borderRadius: 14 }}
                  initial={
                    reduce
                      ? { ...targetRect(), opacity: 0 }
                      : { ...origin, opacity: 1 }
                  }
                  animate={{ ...targetRect(), opacity: 1 }}
                  exit={
                    reduce
                      ? { opacity: 0, transition: { duration: 0.15 } }
                      : { ...origin, opacity: 1 }
                  }
                  transition={
                    reduce
                      ? { duration: 0.15 }
                      : { type: 'spring', stiffness: 230, damping: 28 }
                  }
                >
                  <Image
                    src={src}
                    alt={alt}
                    width={width}
                    height={height}
                    sizes="(max-width: 768px) 92vw, 880px"
                    className="h-full w-full object-contain"
                    priority
                  />

                  {/* Close sits inside the image box (top-right), so it
                      tracks the frame instead of the viewport corner.
                      pointer-events-auto re-enables it inside the
                      pointer-events-none box; fades in after the morph so it
                      isn't oversized on the tiny start frame. */}
                  <DialogPrimitive.Close asChild>
                    <motion.button
                      type="button"
                      aria-label="Schließen"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: reduce ? 0 : 0.18 }}
                      className="pointer-events-auto absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow ring-1 ring-border outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" />
                    </motion.button>
                  </DialogPrimitive.Close>
                </motion.div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
