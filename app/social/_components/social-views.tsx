'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccordionList, type DisclosureItem, type OpenMode } from './accordion-list';
import type { PostCardChannel } from './post-card';

export type SocialView = 'themen' | 'kanaele';

/** Two lenses on the same (filtered) data: topic clusters and the by-channel
 *  list, both rendered as the accessible accordion. Controlled tabs so the KPI
 *  tiles can switch the active lens. */
export function SocialViews({
  view,
  onView,
  themeItems,
  channelItems,
  channelById,
  themeOpenMode,
  channelOpenMode,
  resetKey,
}: {
  view: SocialView;
  onView: (v: SocialView) => void;
  themeItems: DisclosureItem[];
  channelItems: DisclosureItem[];
  channelById: Record<string, PostCardChannel>;
  themeOpenMode: OpenMode;
  channelOpenMode: OpenMode;
  resetKey: string;
}) {
  return (
    <Tabs value={view} onValueChange={(v) => onView(v as SocialView)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="themen">Themen</TabsTrigger>
        <TabsTrigger value="kanaele">Nach Kanal</TabsTrigger>
      </TabsList>

      <TabsContent value="themen">
        <AccordionList
          items={themeItems}
          channelById={channelById}
          openMode={themeOpenMode}
          resetKey={resetKey}
        />
      </TabsContent>

      <TabsContent value="kanaele">
        <AccordionList
          items={channelItems}
          channelById={channelById}
          openMode={channelOpenMode}
          resetKey={resetKey}
        />
      </TabsContent>
    </Tabs>
  );
}
