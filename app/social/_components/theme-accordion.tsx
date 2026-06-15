'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SocialPost, SocialTheme } from '@/lib/shared/types';
import { PostCard, type PostCardChannel } from './post-card';

export interface ThemeItem {
  theme: SocialTheme;
  posts: SocialPost[];
}

/**
 * Topic clusters as an accessible accordion (W3C APG): each theme header is a
 * real button with aria-expanded + aria-controls; the panel reveals its member
 * posts on demand (progressive disclosure, max 2 levels). Multiple panels may
 * be open. Gentle motion (chevron, height, staggered cards) is gated by
 * prefers-reduced-motion. Toggling only happens on click/Enter/Space, never on
 * hover.
 */
export function ThemeAccordion({
  items,
  channelById,
}: {
  items: ThemeItem[];
  channelById: Record<string, PostCardChannel>;
}) {
  // First theme open by default: demonstrates the interaction without flooding.
  const [open, setOpen] = useState<Set<number>>(() => new Set(items.length ? [0] : []));
  const reduce = useReducedMotion();
  const baseId = useId();

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="space-y-2">
      {items.map(({ theme, posts }, i) => {
        const isOpen = open.has(i);
        const headerId = `${baseId}-h-${i}`;
        const panelId = `${baseId}-p-${i}`;
        return (
          <div key={i} className="overflow-hidden rounded-lg border bg-card">
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

                <span className="font-medium text-foreground">{theme.theme}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {posts.length} {posts.length === 1 ? 'Post' : 'Posts'}
                </Badge>

                {theme.channels.length > 0 && (
                  <span className="ml-auto hidden truncate text-xs text-muted-foreground md:inline">
                    {theme.channels.join(' · ')}
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
                    {theme.description && (
                      <p className="mb-3 text-sm text-muted-foreground">{theme.description}</p>
                    )}
                    {posts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Keine zugeordneten Posts im Zeitfenster.
                      </p>
                    ) : (
                      <motion.div
                        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                        initial={reduce ? false : 'hidden'}
                        animate={reduce ? undefined : 'show'}
                        variants={{
                          hidden: {},
                          show: { transition: { staggerChildren: 0.04 } },
                        }}
                      >
                        {posts.map((p) => (
                          <motion.div
                            key={p.id}
                            variants={{
                              hidden: { opacity: 0, y: 6 },
                              show: { opacity: 1, y: 0, transition: { duration: 0.25, ease } },
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
