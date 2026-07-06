'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/shared/utils';
import { socialAccent } from './social-accents';

export interface ThemeChipItem {
  key: string;
  title: string;
  count: number;
  /** Index in der Original-Themenliste → kategorialer Akzent (Mock). */
  accentIndex: number;
}

/** Die Lagebild-Themen als farbige Pill-Chips (Mock: Punkt + Name + Zähler).
 *  Klick springt in die Themen-Ansicht und öffnet das Thema. Auf Mobile eine
 *  horizontal scrollbare Zeile (Mock Mobile-Social), ab sm umbrechend. */
export function ThemeChips({
  themes,
  activeKey,
  onSelect,
}: {
  themes: ThemeChipItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const reduce = useReducedMotion();
  if (themes.length === 0) return null;

  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0">
      <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {themes.map((t, i) => {
          const a = socialAccent(t.accentIndex);
          const active = activeKey === t.key;
          return (
            <motion.button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              aria-pressed={active}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: reduce ? 0 : i * 0.03 }}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-[0_1px_2px_rgba(16,32,46,.04)] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? a.chipActive
                  : 'border-line bg-surface text-ink-subtle hover:border-line-strong hover:text-foreground',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', a.dot)} aria-hidden />
              {t.title}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[10px] font-semibold',
                  active ? 'bg-surface' : 'bg-fill text-ink-soft',
                )}
              >
                {t.count}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
