// Channel CRUD for the Settings management UI. Thin wrappers over Drizzle —
// the only domain logic is normalizing user input (a pasted profile URL or a
// bare handle) to a canonical handle + URL via parseInstagramHandle.

import { and, eq } from 'drizzle-orm';
import { db, socialChannels } from '@/lib/server/db';
import type { SocialChannel } from '@/lib/shared/types';
import type { SocialChannelUpdate } from '@/lib/shared/schemas';
import { parseInstagramHandle, instagramUrl } from './apify';
import { socialChannelToApi } from './to-api';
import { SocialChannelConflictError } from './errors';

export async function createChannel(input: {
  handle: string;
  display_name?: string | null;
  lookback_days?: number | null;
}): Promise<SocialChannel> {
  const handle = parseInstagramHandle(input.handle);

  const existing = await db.query.socialChannels.findFirst({
    where: and(
      eq(socialChannels.platform, 'instagram'),
      eq(socialChannels.handle, handle),
    ),
  });
  if (existing) {
    throw new SocialChannelConflictError(`Kanal @${handle} wird bereits beobachtet.`);
  }

  const displayName = input.display_name?.trim() || null;
  const [row] = await db
    .insert(socialChannels)
    .values({
      platform: 'instagram',
      handle,
      displayName,
      url: instagramUrl(handle),
      lookbackDays: input.lookback_days ?? null,
    })
    .returning();

  return socialChannelToApi(row);
}

export async function updateChannel(
  id: string,
  patch: SocialChannelUpdate,
): Promise<SocialChannel | null> {
  const set: Partial<typeof socialChannels.$inferInsert> = {};
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.display_name !== undefined) {
    set.displayName = patch.display_name?.trim() || null;
  }
  if (patch.lookback_days !== undefined) {
    set.lookbackDays = patch.lookback_days; // number → override, null → inherit
  }
  if (Object.keys(set).length === 0) {
    const row = await db.query.socialChannels.findFirst({
      where: eq(socialChannels.id, id),
    });
    return row ? socialChannelToApi(row) : null;
  }

  const [row] = await db
    .update(socialChannels)
    .set(set)
    .where(eq(socialChannels.id, id))
    .returning();

  return row ? socialChannelToApi(row) : null;
}

/** Delete a channel (its posts cascade). Returns true if a row was removed. */
export async function deleteChannel(id: string): Promise<boolean> {
  const deleted = await db
    .delete(socialChannels)
    .where(eq(socialChannels.id, id))
    .returning({ id: socialChannels.id });
  return deleted.length > 0;
}
