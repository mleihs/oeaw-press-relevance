'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown, InstagramLogo } from '@/lib/icons';
import { isWithinDays } from '@/lib/shared/social-filter';
import type { SocialPost } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { PostCard, type PostCardChannel } from './post-card';
import { socialAccent } from './social-accents';

export interface GroupItem {
  key: string;
  title: string;
  /** Untertitel (Themen-Beschreibung bzw. Kanal-Anzeigename). */
  description?: ReactNode;
  /** Mono-Zeile im Kopf (Kanal-Handles bzw. Likes/Aktivität). */
  metaMono?: string;
  count: number;
  accentIndex: number;
  /** 'count' → getintes Zähler-Quadrat (Themen); 'avatar' → gesättigtes
   *  Instagram-Quadrat (Kanäle). Mock Toolkit-Redesign §Social. */
  badge: 'count' | 'avatar';
  posts: SocialPost[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Staggered grid of post cards. `autoFocus` (used when the user reveals older
 *  posts) moves focus to the grid so keyboard/SR users land on the new content
 *  (Load-More focus-management best practice). */
function PostGrid({
  posts,
  channelById,
  hotIds,
  reduce,
  autoFocus,
}: {
  posts: SocialPost[];
  channelById: Record<string, PostCardChannel>;
  hotIds: ReadonlySet<string>;
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
      className="grid grid-cols-1 gap-3 outline-none sm:grid-cols-2 lg:grid-cols-3"
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
          <PostCard post={p} channel={channelById[p.channel_id]} hot={hotIds.has(p.id)} />
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * Immer offene Gruppen-Karten (Mock: weiße Karte je Thema/Kanal mit Kopfzeile
 * + Post-Grid) — ersetzt das frühere Accordion. Auf Mobile liegen die Gruppen
 * flach auf dem Canvas (Kopf ohne Kartenrahmen, Mock Mobile-Social); ab sm
 * werden sie zur umrandeten Karte. Posts älter als `freshWindowDays` sitzen
 * weiterhin hinter „Ältere anzeigen" (Load-More statt Endlos-Wand), solange
 * nicht gefiltert wird.
 */
export function GroupSection({
  items,
  channelById,
  hotIds,
  freshWindowDays = 7,
  splitOlder = false,
  focusKey = '',
  emptyState,
}: {
  items: GroupItem[];
  channelById: Record<string, PostCardChannel>;
  hotIds: ReadonlySet<string>;
  freshWindowDays?: number;
  splitOlder?: boolean;
  /** `${itemKey}#${nonce}` — scrollt dieses Thema in den Blick (Theme-Chip). */
  focusKey?: string;
  /** Custom node for the zero-items case (e.g. a filtered-empty recovery
   *  state). Falls back to a neutral message when omitted. */
  emptyState?: ReactNode;
}) {
  const [openOlder, setOpenOlder] = useState<Set<string>>(new Set());
  const reduce = useReducedMotion();
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Scroll the focused theme into view (theme-chip click). DOM-only side-effect.
  useEffect(() => {
    const k = focusKey ? focusKey.split('#')[0] : '';
    if (!k) return;
    itemRefs.current.get(k)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [focusKey, reduce]);

  const revealOlder = (key: string) => setOpenOlder((prev) => new Set(prev).add(key));

  if (items.length === 0) {
    return (
      emptyState ?? (
        <p className="text-sm text-muted-foreground">Keine Treffer. Suche oder Filter anpassen.</p>
      )
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const a = socialAccent(item.accentIndex);
        const fresh = splitOlder
          ? item.posts.filter((p) => isWithinDays(p.posted_at, freshWindowDays))
          : item.posts;
        const older = splitOlder
          ? item.posts.filter((p) => !isWithinDays(p.posted_at, freshWindowDays))
          : [];
        // Auto-reveal older if there is nothing fresh (avoid an empty-looking panel).
        const olderRevealed = openOlder.has(item.key) || fresh.length === 0;

        return (
          <section
            key={item.key}
            ref={(el) => {
              const m = itemRefs.current;
              if (el) m.set(item.key, el);
              else m.delete(item.key);
            }}
            aria-label={item.title}
            className="scroll-mt-4 sm:overflow-hidden sm:rounded-[14px] sm:border sm:border-line sm:bg-card sm:shadow-[0_1px_2px_rgba(16,32,46,.05)]"
          >
            <header
              className={cn(
                'flex items-start gap-3 pb-3 sm:px-4 sm:py-3.5',
                item.posts.length > 0 && 'sm:border-b sm:border-line/70',
              )}
            >
              {item.badge === 'count' ? (
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] font-mono text-[13px] font-bold',
                    a.badge,
                  )}
                >
                  {item.count}
                </span>
              ) : (
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white',
                    a.avatar,
                  )}
                  aria-hidden
                >
                  <InstagramLogo className="h-4.5 w-4.5" weight="fill" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="m-0 text-[15px] font-bold leading-tight tracking-[-0.01em] text-foreground">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{item.description}</p>
                )}
                {item.metaMono && (
                  <p className="mt-1 truncate font-mono text-[11px] text-ink-soft">{item.metaMono}</p>
                )}
              </div>
              {item.badge === 'avatar' && (
                <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 font-mono text-[11px] font-medium text-ink-subtle">
                  {item.count} {item.count === 1 ? 'Post' : 'Posts'}
                </span>
              )}
            </header>

            <div className="space-y-3 sm:p-4">
              {item.posts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine zugeordneten Posts im Zeitfenster.
                </p>
              ) : (
                <>
                  {fresh.length > 0 && (
                    <PostGrid posts={fresh} channelById={channelById} hotIds={hotIds} reduce={reduce} />
                  )}

                  {older.length > 0 && !olderRevealed && (
                    <button
                      type="button"
                      onClick={() => revealOlder(item.key)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      {older.length} ältere {older.length === 1 ? 'Post' : 'Posts'} anzeigen
                    </button>
                  )}

                  {older.length > 0 && olderRevealed && (
                    <PostGrid
                      posts={older}
                      channelById={channelById}
                      hotIds={hotIds}
                      reduce={reduce}
                      autoFocus={openOlder.has(item.key)}
                    />
                  )}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
