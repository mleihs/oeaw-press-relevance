'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isWithinDays } from '@/lib/shared/social-filter';
import type { SocialPost } from '@/lib/shared/types';
import { PostCard, type PostCardChannel } from './post-card';

export interface DisclosureItem {
  key: string;
  title: string;
  count: number;
  meta?: ReactNode;
  description?: ReactNode;
  posts: SocialPost[];
}

export type OpenMode = 'first' | 'none' | 'all';

const EASE = [0.22, 1, 0.36, 1] as const;

function seed(items: DisclosureItem[], mode: OpenMode, focusItemKey?: string): Set<number> {
  const s =
    mode === 'all'
      ? new Set(items.map((_, i) => i))
      : mode === 'first' && items.length
        ? new Set([0])
        : new Set<number>();
  // Ensure the externally-focused item (theme chip click) is open even on a
  // fresh mount (e.g. after switching from the Kanal tab).
  if (focusItemKey) {
    const idx = items.findIndex((it) => it.key === focusItemKey);
    if (idx >= 0) s.add(idx);
  }
  return s;
}

function focusItemOf(focusKey: string): string | undefined {
  return focusKey ? focusKey.split('#')[0] : undefined;
}

/** Staggered grid of post cards. `autoFocus` (used when the user reveals older
 *  posts) moves focus to the grid so keyboard/SR users land on the new content
 *  (Load-More focus-management best practice). */
function PostGrid({
  posts,
  channelById,
  reduce,
  autoFocus,
}: {
  posts: SocialPost[];
  channelById: Record<string, PostCardChannel>;
  reduce: boolean | null;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus once when revealed (not on every re-render, which would steal focus).
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <motion.div
      ref={ref}
      tabIndex={autoFocus ? -1 : undefined}
      className="grid grid-cols-2 gap-3 outline-none sm:grid-cols-3 lg:grid-cols-4"
      initial={reduce ? false : 'hidden'}
      animate={reduce ? undefined : 'show'}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035 } } }}
    >
      {posts.map((p) => (
        <motion.div
          key={p.id}
          variants={{
            hidden: { opacity: 0, y: 6 },
            show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
          }}
        >
          <PostCard post={p} channel={channelById[p.channel_id]} />
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * Accessible accordion (W3C APG) of theme/channel groups. Each panel reveals its
 * posts; when `splitOlder` is on (i.e. not actively filtering), posts older than
 * `freshWindowDays` sit behind a "Load More" button ("Ältere anzeigen") rather
 * than infinite scroll (Baymard/NN/g/BBC GEL). Motion is reduced-motion-gated;
 * `resetKey` re-seeds open state when the filter context changes.
 */
export function AccordionList({
  items,
  channelById,
  openMode = 'first',
  resetKey = '',
  freshWindowDays = 7,
  splitOlder = false,
  focusKey = '',
}: {
  items: DisclosureItem[];
  channelById: Record<string, PostCardChannel>;
  openMode?: OpenMode;
  resetKey?: string;
  freshWindowDays?: number;
  splitOlder?: boolean;
  /** `${itemKey}#${nonce}` — ensures that item is open (set from a theme chip). */
  focusKey?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(() => seed(items, openMode, focusItemOf(focusKey)));
  const [openOlder, setOpenOlder] = useState<Set<number>>(new Set());
  const reduce = useReducedMotion();
  const baseId = useId();
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll the focused theme into view (on chip click / fresh mount). DOM-only
  // side-effect — no setState, so no cascading-render lint concern.
  useEffect(() => {
    const k = focusItemOf(focusKey);
    if (!k) return;
    itemRefs.current.get(k)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [focusKey, reduce]);

  // Re-seed open state when the filter/view context changes (React's "adjust
  // state during render" pattern — no effect, fires once per change).
  const [prevKey, setPrevKey] = useState(`${resetKey}|${openMode}`);
  const sig = `${resetKey}|${openMode}`;
  if (sig !== prevKey) {
    setPrevKey(sig);
    setOpen(seed(items, openMode, focusItemOf(focusKey)));
    setOpenOlder(new Set());
  }

  // External focus (theme chip click while already mounted): open the target.
  const [prevFocus, setPrevFocus] = useState(focusKey);
  if (focusKey !== prevFocus) {
    setPrevFocus(focusKey);
    const k = focusItemOf(focusKey);
    const idx = k ? items.findIndex((it) => it.key === k) : -1;
    if (idx >= 0) setOpen((prev) => new Set(prev).add(idx));
  }

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const revealOlder = (i: number) => setOpenOlder((prev) => new Set(prev).add(i));

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Treffer. Suche oder Filter anpassen.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const headerId = `${baseId}-h-${i}`;
        const panelId = `${baseId}-p-${i}`;

        const fresh = splitOlder ? item.posts.filter((p) => isWithinDays(p.posted_at, freshWindowDays)) : item.posts;
        const older = splitOlder ? item.posts.filter((p) => !isWithinDays(p.posted_at, freshWindowDays)) : [];
        // Auto-reveal older if there is nothing fresh (avoid an empty-looking panel).
        const olderRevealed = openOlder.has(i) || fresh.length === 0;

        return (
          <div
            key={item.key}
            ref={(el) => {
              const m = itemRefs.current;
              if (el) m.set(item.key, el);
              else m.delete(item.key);
            }}
            className="scroll-mt-4 overflow-hidden rounded-lg border bg-card"
          >
            <h3 className="m-0">
              <button
                type="button"
                id={headerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(i)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                >
                  <ChevronRight className="h-4 w-4" />
                </motion.span>
                <span className="truncate font-medium text-foreground">{item.title}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {item.count} {item.count === 1 ? 'Post' : 'Posts'}
                </Badge>
                {item.meta && (
                  <span className="ml-auto hidden min-w-0 truncate text-xs text-muted-foreground md:inline">
                    {item.meta}
                  </span>
                )}
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={headerId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 px-4 pb-4 pt-1">
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

                    {item.posts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Keine zugeordneten Posts im Zeitfenster.</p>
                    ) : (
                      <>
                        {fresh.length > 0 && (
                          <PostGrid posts={fresh} channelById={channelById} reduce={reduce} />
                        )}

                        {older.length > 0 && !olderRevealed && (
                          <button
                            type="button"
                            onClick={() => revealOlder(i)}
                            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                            {older.length} ältere {older.length === 1 ? 'Post' : 'Posts'} anzeigen
                          </button>
                        )}

                        {older.length > 0 && olderRevealed && (
                          <PostGrid posts={older} channelById={channelById} reduce={reduce} autoFocus={openOlder.has(i)} />
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
