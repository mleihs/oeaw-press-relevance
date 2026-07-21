// Global team-wide social-monitor settings (singleton row id=1, seeded by the
// migration). Gelesen von der Refresh-Pipeline (Abruf- + Auswertungszeitraum)
// und der /social-Seite (Frisch-Markierung); bearbeitet über die Settings-UI.
//
// Die drei Fenster bilden eine Kette (abgerufen ⊇ ausgewertet ⊇ frisch); die
// Regel steht in lib/shared/social-windows.ts und wird HIER auf den
// zusammengeführten Zustand angewandt, nicht im Zod-Schema: ein PATCH darf
// partiell sein, und ob `theme_window_days: 30` zulässig ist, hängt vom
// gespeicherten `fetch_window_days` ab.

import { eq, sql } from 'drizzle-orm';
import { db, socialSettings } from '@/lib/server/db';
import { ApiValidationError } from '@/lib/server/http';
import {
  checkSocialWindowOrder,
  SOCIAL_WINDOW_DEFAULTS,
  type SocialWindows,
} from '@/lib/shared/social-windows';
import type { SocialSettings } from '@/lib/shared/types';
import type { SocialSettingsUpdate } from '@/lib/shared/schemas';

const DEFAULTS: SocialSettings = {
  ...SOCIAL_WINDOW_DEFAULTS,
  updated_at: new Date(0).toISOString(),
};

export async function getSocialSettings(): Promise<SocialSettings> {
  const row = await db.query.socialSettings.findFirst();
  if (!row) return DEFAULTS; // defensively (migration seeds a row)
  return {
    fetch_window_days: row.fetchWindowDays,
    theme_window_days: row.themeWindowDays,
    fresh_window_days: row.freshWindowDays,
    updated_at: row.updatedAt,
  };
}

export async function updateSocialSettings(
  patch: SocialSettingsUpdate,
): Promise<SocialSettings> {
  const current = await getSocialSettings();
  const merged: SocialWindows = {
    fetch_window_days: patch.fetch_window_days ?? current.fetch_window_days,
    theme_window_days: patch.theme_window_days ?? current.theme_window_days,
    fresh_window_days: patch.fresh_window_days ?? current.fresh_window_days,
  };

  // Klartext-400 statt eines 500 aus der CHECK-Bedingung. Die DB bleibt die
  // letzte Instanz, aber wer hier vorbeikommt, soll lesen können, warum.
  const violation = checkSocialWindowOrder(merged);
  if (violation) throw new ApiValidationError(violation);

  await db
    .update(socialSettings)
    .set({
      fetchWindowDays: merged.fetch_window_days,
      themeWindowDays: merged.theme_window_days,
      freshWindowDays: merged.fresh_window_days,
      updatedAt: sql`NOW()`,
    })
    .where(eq(socialSettings.id, 1));

  return getSocialSettings();
}
