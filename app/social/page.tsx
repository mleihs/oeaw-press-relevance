import Link from 'next/link';
import { Radar, AlertCircle } from 'lucide-react';
import { getEnv } from '@/lib/server/env';
import {
  listChannelsWithRecentPosts,
  getLatestThemeSnapshot,
  getRefreshCostSummary,
} from '@/lib/server/social/list';
import { resolveThemePosts } from '@/lib/server/social/resolve';
import { StatusBanner } from '@/components/status-banner';
import type { PostCardChannel } from './_components/post-card';
import { StatStrip } from './_components/stat-strip';
import { Briefing } from './_components/briefing';
import { SocialViews } from './_components/social-views';
import { CostSummary } from './_components/cost-summary';
import { RefreshButton } from './_components/refresh-button';

// Pure DB read; a refresh writes new rows and calls router.refresh(). No Apify
// or LLM work happens on view, so the page itself is free.
export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  const env = getEnv();
  const apifyConfigured = Boolean(env.APIFY_TOKEN);

  const [snapshot, channels, cost] = await Promise.all([
    getLatestThemeSnapshot(),
    listChannelsWithRecentPosts(env.SOCIAL_WINDOW_DAYS),
    getRefreshCostSummary(),
  ]);

  // Flatten posts (within window) for theme resolution + a channel lookup so
  // theme-grouped cards still show their source channel.
  const allPosts = channels.flatMap((c) => c.posts);
  const channelById: Record<string, PostCardChannel> = {};
  for (const c of channels) {
    channelById[c.id] = { handle: c.handle, display_name: c.display_name };
  }

  const themeItems = snapshot ? resolveThemePosts(snapshot.themes, allPosts) : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radar className="h-6 w-6 text-brand" /> Social Media
          </h1>
          <p className="text-muted-foreground">
            Themen-Lagebild aus beobachteten Social-Media-Kanälen.
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

      <StatStrip
        posts={allPosts.length}
        channels={channels.length}
        themes={snapshot?.themes.length ?? 0}
        windowDays={env.SOCIAL_WINDOW_DAYS}
      />

      {snapshot?.narrative_de && <Briefing narrative={snapshot.narrative_de} />}

      {channels.length === 0 ? (
        <StatusBanner variant="neutral">
          Keine aktiven Kanäle. Füge welche unter{' '}
          <Link href="/settings" className="underline">
            Einstellungen
          </Link>{' '}
          hinzu.
        </StatusBanner>
      ) : allPosts.length === 0 && !snapshot ? (
        <StatusBanner variant="neutral">
          Noch keine Posts geladen.{' '}
          {apifyConfigured
            ? 'Klicke auf „Aktualisieren", um Posts zu laden und das Lagebild zu erzeugen.'
            : 'Sobald APIFY_TOKEN gesetzt ist, kann aktualisiert werden.'}
        </StatusBanner>
      ) : (
        <SocialViews themeItems={themeItems} channels={channels} channelById={channelById} />
      )}
    </div>
  );
}
