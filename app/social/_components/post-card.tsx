import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Heart, MessageCircle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SocialPost } from '@/lib/shared/types';
import { PostImage } from './post-image';

const compact = new Intl.NumberFormat('de-AT', { notation: 'compact', maximumFractionDigits: 1 });

export function PostCard({ post }: { post: SocialPost }) {
  const when = post.posted_at
    ? formatDistanceToNow(new Date(post.posted_at), { addSuffix: true, locale: de })
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <PostImage src={post.image_url} alt={post.topic ?? 'Instagram-Post'} />

      {post.topic && (
        <p className="text-sm font-medium leading-snug">{post.topic}</p>
      )}
      {post.summary_de && (
        <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">
          {post.summary_de}
        </p>
      )}
      {post.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.keywords.slice(0, 5).map((k) => (
            <Badge key={k} variant="secondary" className="text-[10px]">
              {k}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {post.like_count != null && (
            <span className="inline-flex items-center gap-0.5">
              <Heart className="h-3 w-3" />
              {compact.format(post.like_count)}
            </span>
          )}
          {post.comment_count != null && (
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle className="h-3 w-3" />
              {compact.format(post.comment_count)}
            </span>
          )}
        </div>
        {when && <span>{when}</span>}
      </div>

      {post.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
        >
          Original ansehen <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
