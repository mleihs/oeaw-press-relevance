'use client';

import { formatDistanceToNow, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Heart, MessageCircle, ExternalLink } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { SocialPost } from '@/lib/shared/types';
import { PostImage } from './post-image';
import { TagChip } from './social-filter-context';

const compact = new Intl.NumberFormat('de-AT', { notation: 'compact', maximumFractionDigits: 1 });

export interface PostCardChannel {
  handle: string;
  display_name: string | null;
}

export function PostCard({
  post,
  channel,
}: {
  post: SocialPost;
  channel?: PostCardChannel;
}) {
  const posted = post.posted_at ? new Date(post.posted_at) : null;
  const rel = posted ? formatDistanceToNow(posted, { addSuffix: true, locale: de }) : null;
  const abs = posted ? format(posted, 'd. MMM yyyy, HH:mm', { locale: de }) : undefined;

  return (
    <article className="group flex flex-col gap-2 rounded-lg border bg-card p-3 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <PostImage postId={post.id} hasImage={Boolean(post.image_url)} label={post.topic} />

      {post.topic && (
        <h4 className="text-sm font-medium leading-snug text-foreground">{post.topic}</h4>
      )}
      {post.summary_de && (
        <p className="line-clamp-3 text-xs leading-snug text-muted-foreground" title={post.caption ?? undefined}>
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

      <footer className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
        {channel ? (
          <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
              <span className="cursor-default truncate font-medium text-foreground/80 hover:text-brand">
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
              className="inline-flex items-center gap-0.5"
              aria-label={`${post.like_count} Likes`}
            >
              <Heart className="h-3 w-3" aria-hidden />
              <span aria-hidden>{compact.format(post.like_count)}</span>
            </span>
          )}
          {post.comment_count != null && (
            <span
              className="inline-flex items-center gap-0.5"
              aria-label={`${post.comment_count} Kommentare`}
            >
              <MessageCircle className="h-3 w-3" aria-hidden />
              <span aria-hidden>{compact.format(post.comment_count)}</span>
            </span>
          )}
        </div>
      </footer>

      <div className="flex items-center justify-between text-[11px]">
        {rel && <time dateTime={post.posted_at ?? undefined} className="text-muted-foreground">{rel}</time>}
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Original <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}
