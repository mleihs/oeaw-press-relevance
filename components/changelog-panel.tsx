'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { changelogBackground, changelogClosing, changelogEntries } from '@/lib/changelog';

interface Props {
  className?: string;
}

export function ChangelogPanel({ className }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const wrapperClass = ['relative inline-block', className].filter(Boolean).join(' ');

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-controls="changelog-content"
        className="group inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 shadow-[0_2px_18px_-10px_rgba(0,71,187,0.25)] transition hover:border-[#0047bb]/30 hover:shadow-[0_4px_24px_-8px_rgba(0,71,187,0.35)]"
      >
        <motion.span
          aria-hidden
          animate={open ? { rotate: 0, scale: 1.1 } : { rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="inline-flex"
        >
          <Sparkles className="h-4 w-4 text-[#0047bb]" />
        </motion.span>
        <span>Was ist neu</span>
        <span className="rounded-full bg-[#0047bb]/10 px-2 py-0.5 text-xs font-semibold text-[#0047bb] tabular-nums">
          {changelogEntries.length}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          className="inline-flex"
        >
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="changelog-content"
            role="region"
            aria-labelledby="changelog-heading"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.6 }}
            className="absolute right-0 top-full z-30 mt-3 w-[min(28rem,calc(100vw-2rem))] origin-top-right rounded-xl border border-neutral-200/80 bg-gradient-to-br from-white to-neutral-50 p-6 shadow-[0_16px_48px_-16px_rgba(0,71,187,0.3),0_2px_8px_-2px_rgba(0,0,0,0.06)]"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#0047bb]" aria-hidden />
              <h2
                id="changelog-heading"
                className="text-sm font-semibold tracking-tight text-neutral-800"
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
                  <dt className="flex items-center gap-2 font-semibold text-[#0047bb]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0047bb]" aria-hidden />
                    <span>{entry.title}</span>
                  </dt>
                  <dd className="ml-3.5 mt-1 leading-snug text-neutral-700">{entry.body}</dd>
                </motion.div>
              ))}
            </dl>
            <hr className="mt-5 border-neutral-200/60" />
            <p className="mt-3 text-xs leading-relaxed text-neutral-600">{changelogBackground}</p>
            <p className="mt-2 text-xs italic text-neutral-500">{changelogClosing}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
