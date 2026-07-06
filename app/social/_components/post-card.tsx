'use client';

import { formatDistanceToNow, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Heart, MessageCircle, ExternalLink, Flame } from '@/lib/icons';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { SocialPost } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { PostImage } from './post-image';
import { TagChip } from './social-filter-context';

const compact = new Intl.NumberFormat('de-AT', { notation: 'compact', maximumFractionDigits: 1 });

export interface PostCardChannel {
  handle: string;
  display_name: string | null;
  /** Kategorialer Farbpunkt des Kanals (Mock: `chDot`), z.B. 'bg-brand-500'. */
  dot?: string;
}

/** Post-Karte (Mock Toolkit-Redesign §Social): Bild, optionales „Top-Post"-
 *  Flame-Badge, Titel, Zusammenfassung, Keyword-Chips, Fußzeile mit
 *  Kanal-Punkt + Handle, Likes/Kommentaren und Zeit + Original-Link. */
export function PostCard({
  post,
  channel,
  hot = false,
}: {
  post: SocialPost;
  channel?: PostCardChannel;
  /** Markiert die interaktionsstärksten Posts des Fensters (Mock `hot`). */
  hot?: boolean;
}) {
  const posted = post.posted_at ? new Date(post.posted_at) : null;
  const rel = posted ? formatDistanceToNow(posted, { addSuffix: true, locale: de }) : null;
  const abs = posted ? format(posted, 'd. MMM yyyy, HH:mm', { locale: de }) : undefined;

  return (
    <article className="group flex flex-col gap-2 rounded-[13px] border border-line bg-card p-3 shadow-[0_1px_2px_rgba(16,32,46,.05)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(16,32,46,.09)]">
      <div className="relative">
        <PostImage postId={post.id} hasImage={Boolean(post.image_url)} label={post.topic} />
        {hot && (
          <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            <Flame className="h-3 w-3" weight="fill" aria-hidden />
            Top-Post
          </span>
        )}
      </div>

      {post.topic && (
        <h4 className="text-sm font-semibold leading-snug text-foreground">{post.topic}</h4>
      )}
      {post.summary_de && (
        <p className="line-clamp-3 text-xs leading-relaxed text-ink-subtle" title={post.caption ?? undefined}>
          {post.summary_de}
        </p>
      )}

      {post.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.keywords.slice(0, 4).map((k) => (
            <TagChip key={k} tag={k} />
          ))}
        </div>
      )}

      {/* All post meta in one semantic <footer>: row 1 = channel + engagement,
          row 2 = timestamp + link to the original. */}
      <footer className="mt-auto flex flex-col gap-1.5 border-t border-line/70 pt-2 text-[11px] text-ink-subtle">
        <div className="flex items-center justify-between gap-2">
          {channel ? (
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>
                <span className="inline-flex min-w-0 cursor-default items-center gap-1.5 truncate font-semibold text-ink-strong hover:text-brand">
                  {channel.dot && (
                    <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', channel.dot)} aria-hidden />
                  )}
                  @{channel.handle}
                </span>
              </HoverCardTrigger>
              <HoverCardContent className="w-60 text-sm" side="top" align="start">
                <p className="font-medium">{channel.display_name || channel.handle}</p>
                <a
                  href={`https://www.instagram.com/${channel.handle}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  @{channel.handle} <ExternalLink className="h-3 w-3" />
                </a>
                {abs && <p className="mt-2 text-xs text-muted-foreground">Gepostet: {abs}</p>}
              </HoverCardContent>
            </HoverCard>
          ) : (
            <span />
          )}

          {/* Engagement: display-only (monitoring view, not actionable). */}
          <div className="flex shrink-0 items-center gap-2">
            {post.like_count != null && (
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${post.like_count} Likes`}
              >
                <Heart className="h-3 w-3 text-rose-500" weight="fill" aria-hidden />
                <span aria-hidden className="font-mono">{compact.format(post.like_count)}</span>
              </span>
            )}
            {post.comment_count != null && (
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${post.comment_count} Kommentare`}
              >
                <MessageCircle className="h-3 w-3 text-ink-soft" weight="fill" aria-hidden />
                <span aria-hidden className="font-mono">{compact.format(post.comment_count)}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-ink-soft">
          {rel && <time dateTime={post.posted_at ?? undefined}>{rel}</time>}
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Original <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
