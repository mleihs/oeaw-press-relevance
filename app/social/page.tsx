import Link from 'next/link';
import { Radar, AlertCircle } from 'lucide-react';
import { getEnv } from '@/lib/server/env';
import {
  listChannelsWithRecentPosts,
  getLatestThemeSnapshot,
  getRefreshCostSummary,
} from '@/lib/server/social/list';
import { StatusBanner } from '@/components/status-banner';
import { ThemeOverview } from './_components/theme-overview';
import { ChannelSection } from './_components/channel-section';
import { CostSummary } from './_components/cost-summary';
import { RefreshButton } from './_components/refresh-button';

// Always render fresh — a refresh writes new posts/snapshot and calls
// router.refresh(); the page itself does no fetching or LLM work, so this is a
// pure DB read (no Apify/LLM cost on view).
export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  const env = getEnv();
  const apifyConfigured = Boolean(env.APIFY_TOKEN);

  const [snapshot, channels, cost] = await Promise.all([
    getLatestThemeSnapshot(),
    listChannelsWithRecentPosts(env.SOCIAL_WINDOW_DAYS),
    getRefreshCostSummary(),
  ]);

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

      {snapshot ? (
        <ThemeOverview snapshot={snapshot} />
      ) : (
        <StatusBanner variant="neutral">
          Noch kein Lagebild vorhanden.{' '}
          {apifyConfigured
            ? 'Klicke auf „Aktualisieren", um Posts zu laden und Themen zu extrahieren.'
            : 'Sobald APIFY_TOKEN gesetzt ist, kann aktualisiert werden.'}
        </StatusBanner>
      )}

      {channels.length === 0 ? (
        <StatusBanner variant="neutral">
          Keine aktiven Kanäle. Füge welche unter{' '}
          <Link href="/settings" className="underline">
            Einstellungen
          </Link>{' '}
          hinzu.
        </StatusBanner>
      ) : (
        <div className="space-y-8">
          {channels.map((c) => (
            <ChannelSection key={c.id} channel={c} />
          ))}
        </div>
      )}
    </div>
  );
}
