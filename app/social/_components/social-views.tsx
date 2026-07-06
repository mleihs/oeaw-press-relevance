'use client';

import type { ReactNode } from 'react';
import { GroupSection, type GroupItem } from './group-section';
import type { PostCardChannel } from './post-card';

export type SocialView = 'themen' | 'kanaele';

/** Two lenses on the same (filtered) data: topic clusters and the by-channel
 *  list, both rendered as always-open group cards (Mock — der Umschalter lebt
 *  in der Toolbar, nicht mehr als Tabs). */
export function SocialViews({
  view,
  themeItems,
  channelItems,
  channelById,
  hotIds,
  freshWindowDays,
  splitOlder,
  themeFocusKey,
  emptyState,
}: {
  view: SocialView;
  themeItems: GroupItem[];
  channelItems: GroupItem[];
  channelById: Record<string, PostCardChannel>;
  hotIds: ReadonlySet<string>;
  freshWindowDays: number;
  splitOlder: boolean;
  themeFocusKey: string;
  /** Shown in place of the default "no results" text when a lens is empty
   *  (used for the filtered-empty recovery state). */
  emptyState?: ReactNode;
}) {
  return view === 'themen' ? (
    <GroupSection
      items={themeItems}
      channelById={channelById}
      hotIds={hotIds}
      freshWindowDays={freshWindowDays}
      splitOlder={splitOlder}
      focusKey={themeFocusKey}
      emptyState={emptyState}
    />
  ) : (
    <GroupSection
      items={channelItems}
      channelById={channelById}
      hotIds={hotIds}
      freshWindowDays={freshWindowDays}
      splitOlder={splitOlder}
      emptyState={emptyState}
    />
  );
}
