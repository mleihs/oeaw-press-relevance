import { ExternalLink } from 'lucide-react';
import type { SocialChannelWithPosts } from '@/lib/shared/types';
import { PostCard } from './post-card';

export function ChannelSection({ channel }: { channel: SocialChannelWithPosts }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b pb-2">
        <h2 className="text-lg font-semibold">
          {channel.display_name || channel.handle}
        </h2>
        <a
          href={channel.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
        >
          @{channel.handle} <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {channel.posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Posts im aktuellen Zeitfenster.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {channel.posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </section>
  );
}
