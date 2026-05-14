'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/shared/utils';
import {
  type ChangelogCategory,
  type ChangelogEntry,
  changelogBackground,
  changelogClosing,
  changelogEntries,
  changelogLastUpdated,
  changelogStandLabel,
} from '@/lib/shared/changelog';

interface Props {
  className?: string;
}

const SEEN_KEY = 'storyscout_changelog_seen_at';
const OPENED_KEY = 'storyscout_changelog_ever_opened';

const STAGGER = {
  hero: 0.08,
  listStart: 0.18,
  listStep: 0.05,
  footerExtra: 0.06,
} as const;

const CATEGORY_META: Record<
  ChangelogCategory,
  { label: string; icon: LucideIcon; chipClass: string }
> = {
  neu: {
    label: 'Neu',
    icon: Sparkles,
    chipClass:
      'bg-brand/10 text-brand ring-1 ring-inset ring-brand/20 dark:bg-brand/20 dark:ring-brand/30',
  },
  verbesserung: {
    label: 'Verbesserung',
    icon: TrendingUp,
    chipClass:
      'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  },
  hintergrund: {
    label: 'Hintergrund',
    icon: Wrench,
    chipClass:
      'bg-purple-500/10 text-purple-700 ring-1 ring-inset ring-purple-500/20 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/30',
  },
};

const makeEnter = (reduce: boolean | null) => (delay = 0) => ({
  initial: { opacity: 0, y: reduce ? 0 : 6 },
  animate: { opacity: 1, y: 0 },
  transition: {
    delay: reduce ? 0 : delay,
    duration: reduce ? 0.12 : 0.34,
    ease: 'easeOut' as const,
  },
});

type EnterProps = ReturnType<ReturnType<typeof makeEnter>>;

/**
 * „Was ist neu"-Sheet: right-side drawer with a Hero entry, categorised list,
 * soft anchor date, and an unread-dot driven by a localStorage watermark.
 * Pre-first-click the trigger plays an attention loop (halo + amplified pulse)
 * that calms down after the first open.
 */
type PostHydrationState = {
  mounted: boolean;
  hasUnread: boolean;
  everOpened: boolean;
};

const INITIAL_STATE: PostHydrationState = {
  mounted: false,
  hasUnread: false,
  // Optimistic-true on the server pass so first paint matches the calm state
  // and we never flash "attention" for returning users while hydration runs.
  everOpened: true,
};

export function ChangelogPanel({ className }: Props) {
  const [state, setState] = useState<PostHydrationState>(INITIAL_STATE);
  const reduce = useReducedMotion();

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_KEY);
    let hasUnread = false;
    if (!seen) {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } else {
      hasUnread = seen < changelogLastUpdated;
    }
    setState({
      mounted: true,
      hasUnread,
      everOpened: localStorage.getItem(OPENED_KEY) === '1',
    });
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    if (!state.everOpened) localStorage.setItem(OPENED_KEY, '1');
    if (state.hasUnread) localStorage.setItem(SEEN_KEY, new Date().toISOString());
    if (!state.everOpened || state.hasUnread) {
      setState((s) => ({ ...s, hasUnread: false, everOpened: true }));
    }
  };

  const { mounted, hasUnread, everOpened } = state;

  const [hero, ...rest] = changelogEntries;
  const enter = makeEnter(reduce);
  const attention = mounted && !everOpened && !reduce;

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <motion.button
          type="button"
          whileHover={reduce ? undefined : { y: -1 }}
          whileTap={reduce ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className={cn(
            'group relative inline-flex items-center gap-2 rounded-full',
            'border border-border/80 bg-card px-4 py-2',
            'text-sm font-medium text-foreground',
            'shadow-[0_2px_18px_-10px_rgba(0,71,187,0.28)]',
            'transition-[box-shadow,border-color] duration-300',
            'hover:border-brand/30 hover:shadow-[0_6px_28px_-8px_rgba(0,71,187,0.4)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            attention &&
              'border-brand/40 shadow-[0_4px_24px_-6px_rgba(0,71,187,0.45)]',
            className,
          )}
        >
          <AnimatePresence>
            {attention && (
              <motion.span
                key="halo"
                aria-hidden
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 1.18, 1.32], opacity: [0.55, 0.2, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand/40"
              />
            )}
          </AnimatePresence>
          <motion.span
            aria-hidden
            animate={
              reduce
                ? undefined
                : attention
                  ? { scale: [1, 1.18, 1], rotate: [0, 12, -8, 0] }
                  : { scale: [1, 1.08, 1] }
            }
            transition={
              reduce
                ? undefined
                : {
                    duration: attention ? 2.0 : 2.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
            className="relative inline-flex"
          >
            <Sparkles className="h-4 w-4 text-brand" />
          </motion.span>
          <span className="relative">Was ist neu</span>
          <AnimatePresence>
            {mounted && hasUnread && (
              <motion.span
                key="unread-dot"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                className="relative ml-0.5 inline-flex h-2 w-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 rounded-full bg-brand opacity-70',
                    !reduce && 'animate-ping',
                  )}
                />
                <span
                  aria-hidden
                  className="relative inline-flex h-2 w-2 rounded-full bg-brand"
                />
                <span className="sr-only">Neue Einträge seit deinem letzten Besuch</span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className={cn(
          'w-full sm:max-w-[480px]',
          'gap-0 p-0',
          'bg-card border-l border-border/80',
          'shadow-[-24px_0_64px_-16px_rgba(0,71,187,0.25)]',
          '[&>button]:top-5 [&>button]:right-5 [&>button]:z-20',
        )}
      >
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0',
            '[background-image:radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.045)_1px,transparent_0)]',
            'dark:[background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)]',
            '[background-size:14px_14px]',
          )}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-brand/0 via-brand/50 to-purple-500/30"
        />

        <div className="relative flex h-full flex-col">
          <header className="relative border-b border-border/60 bg-gradient-to-b from-card/95 to-card/80 px-6 pt-6 pb-5 backdrop-blur-[2px]">
            <div className="flex items-center gap-2">
              <motion.span
                aria-hidden
                animate={reduce ? undefined : { scale: [1, 1.1, 1], rotate: [0, 4, 0] }}
                transition={
                  reduce
                    ? undefined
                    : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
                }
                className="inline-flex"
              >
                <Sparkles className="h-5 w-5 text-brand" />
              </motion.span>
              <SheetTitle className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-base font-semibold tracking-tight text-transparent">
                Was ist neu
              </SheetTitle>
            </div>
            <SheetDescription className="mt-1 text-xs">
              {changelogStandLabel}
            </SheetDescription>
          </header>

          <div className="relative flex-1 overflow-y-auto px-6 pt-5 pb-8">
            {hero && (
              <HeroCard entry={hero} enter={enter(STAGGER.hero)} reduce={reduce} />
            )}

            {rest.length > 0 && (
              <ul className="mt-4 space-y-1">
                {rest.map((entry, i) => (
                  <ChangelogItem
                    key={entry.title}
                    entry={entry}
                    enter={enter(STAGGER.listStart + i * STAGGER.listStep)}
                  />
                ))}
              </ul>
            )}

            <motion.section
              {...enter(
                STAGGER.listStart + rest.length * STAGGER.listStep + STAGGER.footerExtra,
              )}
              className="mt-6 rounded-xl border border-border/40 bg-muted/40 p-4 dark:bg-muted/20"
            >
              <p className="text-xs leading-relaxed text-muted-foreground">
                {changelogBackground}
              </p>
              <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground/85">
                {changelogClosing}
              </p>
            </motion.section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HeroCard({
  entry,
  enter,
  reduce,
}: {
  entry: ChangelogEntry;
  enter: EnterProps;
  reduce: boolean | null;
}) {
  return (
    <motion.article
      {...enter}
      className={cn(
        'group relative overflow-hidden rounded-xl p-5',
        'bg-gradient-to-br from-brand/[0.08] via-purple-500/[0.06] to-brand/[0.04]',
        'dark:from-brand/[0.18] dark:via-purple-500/[0.12] dark:to-brand/[0.06]',
        'border border-brand/20 dark:border-brand/30',
        'shadow-[0_8px_32px_-12px_rgba(0,71,187,0.25)]',
        'transition-shadow duration-300',
        'hover:shadow-[0_14px_40px_-12px_rgba(0,71,187,0.4)]',
      )}
    >
      <motion.div
        aria-hidden
        animate={reduce ? undefined : { rotate: 360 }}
        transition={
          reduce ? undefined : { duration: 40, repeat: Infinity, ease: 'linear' }
        }
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br from-brand/40 via-purple-500/25 to-transparent opacity-70 blur-3xl dark:opacity-50"
      />
      {entry.href && (
        <SheetClose asChild>
          <Link
            href={entry.href}
            className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            aria-label={`Mehr zu: ${entry.title}`}
          />
        </SheetClose>
      )}
      <div className="relative">
        <CategoryChip category={entry.category} />
        <h3 className="mt-3 text-base font-semibold leading-tight tracking-tight text-foreground transition-colors duration-200 group-hover:text-brand">
          {entry.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{entry.body}</p>
        {entry.href && <MoreLink tone="hero" />}
      </div>
    </motion.article>
  );
}

function ChangelogItem({ entry, enter }: { entry: ChangelogEntry; enter: EnterProps }) {
  const content = (
    <>
      <CategoryChip category={entry.category} />
      <h4 className="mt-1.5 text-sm font-semibold leading-tight text-foreground transition-colors duration-200 group-hover:text-brand">
        {entry.title}
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-foreground/75">{entry.body}</p>
      {entry.href && <MoreLink tone="item" />}
    </>
  );

  return (
    <motion.li {...enter} className="list-none">
      {entry.href ? (
        <SheetClose asChild>
          <Link
            href={entry.href}
            className="group block rounded-lg p-3 transition-colors duration-200 hover:bg-brand/[0.04] focus-visible:bg-brand/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 dark:hover:bg-brand/[0.07]"
          >
            {content}
          </Link>
        </SheetClose>
      ) : (
        <div className="block rounded-lg p-3">{content}</div>
      )}
    </motion.li>
  );
}

function MoreLink({ tone }: { tone: 'hero' | 'item' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium transition-all duration-200',
        'group-hover:text-brand',
        tone === 'hero'
          ? 'mt-3 gap-1 text-xs text-brand/85 group-hover:gap-1.5'
          : 'mt-1.5 gap-0.5 text-[11px] text-brand/70 group-hover:gap-1',
      )}
    >
      Mehr im Hilfe-Center
      <ArrowUpRight
        className="size-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden
      />
    </span>
  );
}

function CategoryChip({ category }: { category: ChangelogCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide',
        meta.chipClass,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  );
}
