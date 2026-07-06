import Link from 'next/link';
import { Radar, AlertCircle } from '@/lib/icons';
import { getEnv } from '@/lib/server/env';
import {
  listChannelsWithRecentPosts,
  getLatestThemeSnapshot,
  getRefreshCostSummary,
  getPostsByIds,
} from '@/lib/server/social/list';
import { resolveThemePosts } from '@/lib/server/social/resolve';
import { getSocialSettings } from '@/lib/server/social/settings';
import { StatusBanner } from '@/components/status-banner';
import type { PostCardChannel } from './_components/post-card';
import { Briefing } from './_components/briefing';
import { CostSummary } from './_components/cost-summary';
import { RefreshButton } from './_components/refresh-button';
import { SocialDashboard } from './_components/social-dashboard';

// Pure DB read; a refresh writes new rows and calls router.refresh(). No Apify
// or LLM work happens on view, so the page itself is free.
export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  const env = getEnv();
  const apifyConfigured = Boolean(env.APIFY_TOKEN);

  const [snapshot, channels, cost, settings] = await Promise.all([
    getLatestThemeSnapshot(),
    listChannelsWithRecentPosts(env.SOCIAL_WINDOW_DAYS),
    getRefreshCostSummary(),
    getSocialSettings(),
  ]);

  const allPosts = channels.flatMap((c) => c.posts);
  const channelById: Record<string, PostCardChannel> = {};
  for (const c of channels) {
    channelById[c.id] = { handle: c.handle, display_name: c.display_name };
  }
  // Resolve themes against a pool that also includes snapshot-referenced posts
  // missing from the channel-capped list (theme window may exceed the display
  // window, or a busy channel exceeds the per-channel cap).
  let themeItems: ReturnType<typeof resolveThemePosts> = [];
  if (snapshot) {
    const have = new Set(allPosts.map((p) => p.id));
    const missing = [...new Set(snapshot.themes.flatMap((t) => t.post_ids ?? []))].filter(
      (id) => !have.has(id),
    );
    const pool = missing.length ? [...allPosts, ...(await getPostsByIds(missing))] : allPosts;
    themeItems = resolveThemePosts(snapshot.themes, pool);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radar className="h-6 w-6 text-brand" /> Social Media
          </h1>
          <p className="text-muted-foreground">
            Lagebild der ÖAW-Kanäle auf Instagram, geclustert nach Themen und Kanälen.
            Monitoring, keine Veröffentlichung.
          </p>
          <CostSummary cost={cost} />
        </div>
        <RefreshButton disabled={!apifyConfigured} />
      </header>

      {!apifyConfigured && (
        <StatusBanner variant="warning" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}>
          APIFY_TOKEN ist nicht konfiguriert. „Aktualisieren" ist deaktiviert.
          Bereits geladene Daten werden weiterhin angezeigt.
        </StatusBanner>
      )}

      {channels.length === 0 ? (
        <StatusBanner variant="neutral">
          Keine aktiven Kanäle. Füge welche unter{' '}
          <Link href="/settings#social-channels" className="underline">
            Einstellungen
          </Link>{' '}
          hinzu.
        </StatusBanner>
      ) : (
        <SocialDashboard
          themeItems={themeItems}
          channels={channels}
          channelById={channelById}
          windowDays={env.SOCIAL_WINDOW_DAYS}
          freshWindowDays={settings.fresh_window_days}
          briefing={snapshot?.narrative_de ? <Briefing narrative={snapshot.narrative_de} /> : null}
        />
      )}
    </div>
  );
}
