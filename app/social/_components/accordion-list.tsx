'use client';

import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SocialPost } from '@/lib/shared/types';
import { PostCard, type PostCardChannel } from './post-card';

export interface DisclosureItem {
  key: string;
  title: string;
  count: number;
  /** Right-aligned header content (e.g. channels for themes, stats for channels). */
  meta?: ReactNode;
  /** Shown at the top of the expanded panel. */
  description?: ReactNode;
  posts: SocialPost[];
}

export type OpenMode = 'first' | 'none' | 'all';

function seed(items: DisclosureItem[], mode: OpenMode): Set<number> {
  if (mode === 'all') return new Set(items.map((_, i) => i));
  if (mode === 'first' && items.length) return new Set([0]);
  return new Set();
}

/**
 * Accessible accordion (W3C APG): each header is a real <button> with
 * aria-expanded + aria-controls; the panel reveals its posts on demand.
 * Generic over themes / channels. `resetKey` re-seeds the open set when the
 * active filter changes (so a search auto-opens matching groups). Motion is
 * gated by prefers-reduced-motion; toggling never happens on hover.
 */
export function AccordionList({
  items,
  channelById,
  openMode = 'first',
  resetKey = '',
}: {
  items: DisclosureItem[];
  channelById: Record<string, PostCardChannel>;
  openMode?: OpenMode;
  resetKey?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(() => seed(items, openMode));
  const reduce = useReducedMotion();
  const baseId = useId();

  // Re-seed the open set when the filter/view context changes (so matches
  // become visible). React's "adjust state during render" pattern — preferred
  // over an effect, and remounts no DOM.
  const [prevKey, setPrevKey] = useState(`${resetKey}|${openMode}`);
  const key = `${resetKey}|${openMode}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setOpen(seed(items, openMode));
  }

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const ease = [0.22, 1, 0.36, 1] as const;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Treffer. Suche oder Filter anpassen.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const headerId = `${baseId}-h-${i}`;
        const panelId = `${baseId}-p-${i}`;
        return (
          <div key={item.key} className="overflow-hidden rounded-lg border bg-card">
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
                  transition={{ duration: reduce ? 0 : 0.2, ease }}
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
                  transition={{ duration: reduce ? 0 : 0.28, ease }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1">
                    {item.description && (
                      <p className="mb-3 text-sm text-muted-foreground">{item.description}</p>
                    )}
                    {item.posts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Keine zugeordneten Posts im Zeitfenster.
                      </p>
                    ) : (
                      <motion.div
                        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                        initial={reduce ? false : 'hidden'}
                        animate={reduce ? undefined : 'show'}
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035 } } }}
                      >
                        {item.posts.map((p) => (
                          <motion.div
                            key={p.id}
                            variants={{
                              hidden: { opacity: 0, y: 6 },
                              show: { opacity: 1, y: 0, transition: { duration: 0.22, ease } },
                            }}
                          >
                            <PostCard post={p} channel={channelById[p.channel_id]} />
                          </motion.div>
                        ))}
                      </motion.div>
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
