'use client';

import { ExternalLink } from 'lucide-react';
import type { SocialChannelWithPosts } from '@/lib/shared/types';
import { PostCard } from './post-card';

/** "Nach Kanal" view: the raw feed grouped by channel. */
export function ChannelView({ channels }: { channels: SocialChannelWithPosts[] }) {
  if (channels.every((c) => c.posts.length === 0)) {
    return <p className="text-sm text-muted-foreground">Keine Posts im aktuellen Zeitfenster.</p>;
  }

  return (
    <div className="space-y-8">
      {channels.map((c) => (
        <section key={c.id} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 border-b pb-2">
            <h3 className="text-base font-semibold">{c.display_name || c.handle}</h3>
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
            >
              @{c.handle} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {c.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Posts im Zeitfenster.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {c.posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  channel={{ handle: c.handle, display_name: c.display_name }}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
