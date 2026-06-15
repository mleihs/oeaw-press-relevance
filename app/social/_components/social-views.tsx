'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { SocialChannelWithPosts } from '@/lib/shared/types';
import { ThemeAccordion, type ThemeItem } from './theme-accordion';
import { ChannelView } from './channel-view';
import type { PostCardChannel } from './post-card';

/** Two lenses on the same data: topic clusters (the value-add, default) and the
 *  raw by-channel feed. Tabs are a recommended progressive-disclosure pattern. */
export function SocialViews({
  themeItems,
  channels,
  channelById,
}: {
  themeItems: ThemeItem[];
  channels: SocialChannelWithPosts[];
  channelById: Record<string, PostCardChannel>;
}) {
  return (
    <Tabs defaultValue="themen" className="space-y-4">
      <TabsList>
        <TabsTrigger value="themen">Themen</TabsTrigger>
        <TabsTrigger value="kanaele">Nach Kanal</TabsTrigger>
      </TabsList>

      <TabsContent value="themen">
        {themeItems.length > 0 ? (
          <ThemeAccordion items={themeItems} channelById={channelById} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch keine Themen. „Aktualisieren", um das Lagebild zu erzeugen.
          </p>
        )}
      </TabsContent>

      <TabsContent value="kanaele">
        <ChannelView channels={channels} />
      </TabsContent>
    </Tabs>
  );
}
