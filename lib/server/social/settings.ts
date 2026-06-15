// Global team-wide social-monitor settings (singleton row id=1, seeded by the
// migration). Read by the page (fresh window) and the refresh pipeline (theme
// window + retention); edited via the Settings UI.

import { eq, sql } from 'drizzle-orm';
import { db, socialSettings } from '@/lib/server/db';
import type { SocialSettings } from '@/lib/shared/types';
import type { SocialSettingsUpdate } from '@/lib/shared/schemas';

const DEFAULTS: SocialSettings = {
  fresh_window_days: 7,
  theme_window_days: 14,
  retention_days: null,
  updated_at: new Date(0).toISOString(),
};

export async function getSocialSettings(): Promise<SocialSettings> {
  const row = await db.query.socialSettings.findFirst();
  if (!row) return DEFAULTS; // defensively (migration seeds a row)
  return {
    fresh_window_days: row.freshWindowDays,
    theme_window_days: row.themeWindowDays,
    retention_days: row.retentionDays,
    updated_at: row.updatedAt,
  };
}

export async function updateSocialSettings(
  patch: SocialSettingsUpdate,
): Promise<SocialSettings> {
  const set: Partial<typeof socialSettings.$inferInsert> = {};
  if (patch.fresh_window_days !== undefined) set.freshWindowDays = patch.fresh_window_days;
  if (patch.theme_window_days !== undefined) set.themeWindowDays = patch.theme_window_days;
  if (patch.retention_days !== undefined) set.retentionDays = patch.retention_days; // null clears

  await db
    .update(socialSettings)
    .set({ ...set, updatedAt: sql`NOW()` })
    .where(eq(socialSettings.id, 1));

  return getSocialSettings();
}
