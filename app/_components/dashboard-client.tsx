'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { motion } from 'motion/react';
import { AnimateNumber } from 'motion-number';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Newspaper,
  Pin,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PressScoreBadge } from '@/components/score-bar';
import { SimilarityIndicator } from '@/components/similarity-indicator';
import { StatCard } from '@/components/stat-card';
import { AtmosphericOrb } from '@/components/atmospheric-orb';
import { InfoBubble } from '@/components/info-bubble';
import { EmptyState } from '@/components/empty-state';
import { CapybaraEmpty } from '@/components/capybara-logo';
import { ChangelogPanel } from '@/components/changelog-panel';
import { PublicationFlag } from '@/components/publication-flag';
import { displayTitle } from '@/lib/shared/html-utils';
import { displayAuthor, displayInstitute } from '@/lib/shared/publication-display';
import { DASHBOARD_PERIODS, type DashboardPeriod } from '@/lib/shared/dashboard';
// `import type` keeps `lib/server/dashboard/fetch.ts` out of the client bundle
// — that module transitively imports postgres + drizzle and would fail the
// RSC → Client boundary check if pulled in as a value import.
import type { DashboardData } from '@/lib/server/dashboard/fetch';
import { KeywordCloud } from './keyword-cloud';
import { ScoreDistributionChart } from './score-distribution-chart';

// Recharts is ~100kB gz; lazy-load via next/dynamic so it only ships when
// the dashboard actually has data to show in this card.
const DimensionsRadar = dynamic(() => import('./dimensions-radar'), {
  ssr: false,
  loading: () => <div className="h-[280px]" aria-hidden />,
});

const TIME_TAB_LABELS: Record<DashboardPeriod, string> = {
  week: 'Woche',
  month: '2 Monate',
  year: 'Jahr',
  all: 'Gesamt',
};

function getTimeRangeLabel(period: DashboardPeriod): string {
  switch (period) {
    case 'week':
      return 'Letzte 7 Tage';
    case 'month':
      return 'Letzte 2 Monate';
    case 'year':
      return 'Letztes Jahr';
    case 'all':
      return 'Alle Zeiträume';
  }
}

interface DashboardClientProps {
  data: DashboardData;
  period: DashboardPeriod;
}

// How many extra pubs each „Mehr laden" click reveals.
const TOP_PUBS_STEP = 20;

export function DashboardClient({ data, period }: DashboardClientProps) {
  const {
    stats,
    topPubs,
    topPubsTotal,
    topPubsLimit,
    flaggedCount,
    pressReleasedCount,
    orphansCount,
  } = data;
  const scoreDistribution = stats.score_distribution;
  const dimensionAvgs = stats.dimension_avgs;
  const topKeywords = stats.top_keywords;
  const hasMorePubs = topPubs.length < topPubsTotal;
  const nextLimit = topPubsLimit + TOP_PUBS_STEP;

  return (
    <div className="space-y-6">
      {/* Hero — atmospheric gradient panel with animated live stats */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-brand/[0.06] via-purple-500/[0.04] to-amber-500/[0.05] dark:from-brand/[0.12] dark:via-purple-500/[0.08] dark:to-amber-500/[0.06] p-6 md:p-8"
      >
        <AtmosphericOrb position="top-right" size="lg" color="brand" />
        <AtmosphericOrb position="bottom-left" size="md" color="purple" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <Image
              src="/capybara-logo.png"
              alt="StoryScout Capybara"
              width={140}
              height={140}
              className="shrink-0 mix-blend-multiply dark:mix-blend-normal dark:opacity-90"
              priority
            />

            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                StoryScout
              </h1>
              <p className="text-muted-foreground mt-1.5 max-w-md">
                Press-Triage und Pitch-Pipeline für ÖAW-Publikationen.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  <AnimateNumber className="font-semibold text-foreground tabular-nums">{stats.total}</AnimateNumber>
                  <span>Pubs</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <AnimateNumber className="font-semibold text-foreground tabular-nums">{stats.analyzed}</AnimateNumber>
                  <span>analysiert</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-brand" />
                  <AnimateNumber className="font-semibold text-brand tabular-nums">{stats.high_score_count}</AnimateNumber>
                  <span>mit hohem Story-Potenzial</span>
                </div>
              </div>
            </div>
          </div>
          <ChangelogPanel />
        </div>
      </motion.section>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Publikationen gesamt"
          explId="stat_total_pubs"
          value={stats.total}
          icon={<BookOpen className="h-5 w-5" />}
          subtitle={
            stats.peer_reviewed && stats.total
              ? `${stats.peer_reviewed.toLocaleString('de-AT')} peer-reviewed (${Math.round((stats.peer_reviewed / stats.total) * 100)}%)`
              : undefined
          }
        />
        <StatCard
          label="Popular Science"
          explId="stat_popular_science"
          value={stats.popular_science}
          icon={<Sparkles className="h-5 w-5" />}
          subtitle={
            stats.popular_science && stats.total
              ? `${Math.round((stats.popular_science / stats.total) * 100)}% aller Publikationen — Quellsignal`
              : 'Vorklassifiziert in WebDB'
          }
        />
        <StatCard
          label="Analysiert"
          explId="stat_analyzed"
          value={stats.analyzed}
          icon={<BarChart3 className="h-5 w-5" />}
          subtitle={stats.total ? `${Math.round((stats.analyzed / stats.total) * 100)}% aller Publikationen` : undefined}
        />
        <StatCard
          label="Hohes Story-Potenzial"
          explId="stat_high_score"
          value={stats.high_score_count}
          icon={<TrendingUp className="h-5 w-5" />}
          subtitle={stats.avg_score !== null ? `Durchschnitt: ${Math.round(stats.avg_score * 100)}%` : undefined}
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schnellzugriff</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/publications">
              <BookOpen className="mr-2 h-4 w-4" />
              Publikationen durchsuchen
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/15">
            <Link href="/review">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Zur Triage-Sitzung
              {flaggedCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300/90">
                  <Pin className="h-3 w-3 fill-amber-400 text-amber-500" />
                  {flaggedCount} geflaggt
                </span>
              )}
            </Link>
          </Button>
          {pressReleasedCount > 0 && (
            <Button asChild variant="outline" className="border-emerald-300 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
              <Link href="/publications?pressReleased=yes">
                <Newspaper className="mr-2 h-4 w-4" />
                {pressReleasedCount} mit ÖAW-Pressemitteilung
              </Link>
            </Button>
          )}
          {orphansCount > 0 && (
            <Button asChild variant="outline" className="border-emerald-200 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
              <Link href="/press-releases?tab=orphans">
                <Newspaper className="mr-2 h-4 w-4 opacity-60" />
                {orphansCount} Pressemitteilungen ohne Pub-Match
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Top publications with time filter */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              Top {topPubs.length} Publikationen (nach StoryScore)
              <InfoBubble id="top10_panel" size="md" />
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {getTimeRangeLabel(period)} · ohne Pop-Science
              {topPubsTotal > topPubs.length && (
                <span> · {topPubsTotal.toLocaleString('de-AT')} insgesamt im Pool</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
              Zeitraum:
              <InfoBubble id="dashboard_time_range" size="sm" />
            </span>
            {/* URL-driven tabs use <nav> + aria-current per phaseA4 Lesson #16
                — the in-page <Tabs> primitive is for mutation-driven STATE
                (still correct on /review's score-mode toggle), this is
                navigation. */}
            <nav aria-label="Zeitraum" className="flex rounded-lg border bg-muted p-0.5">
              {DASHBOARD_PERIODS.map((value) => (
                <Link
                  key={value}
                  href={`?period=${value}`}
                  replace
                  scroll={false}
                  aria-current={period === value ? 'page' : undefined}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    period === value
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {TIME_TAB_LABELS[value]}
                </Link>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent>
          {topPubs.length > 0 ? (
            <div className="space-y-2">
              {topPubs.map((pub, i) => {
                const institute = displayInstitute(pub);
                return (
                  <Link
                    key={pub.id}
                    href={`/publications/${pub.id}`}
                    className="flex items-start gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-brand">
                        {displayTitle(pub.title, pub.citation)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {displayAuthor(pub)}{institute ? ` | ${institute}` : ''}
                        </p>
                        {pub.publication_type && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pub.publication_type}</Badge>
                        )}
                        {pub.published_at && (
                          <span className="text-[10px] text-muted-foreground/70">{pub.published_at.slice(0, 4)}</span>
                        )}
                      </div>
                      {pub.pitch_suggestion && (
                        <p className="text-xs text-foreground/80 mt-1 line-clamp-2">
                          {pub.pitch_suggestion}
                        </p>
                      )}
                      {pub.haiku && (
                        <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-1">
                          {pub.haiku.replace(/\n/g, ' / ')}
                        </p>
                      )}
                    </div>
                    <div
                      className="shrink-0"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      <PublicationFlag pubId={pub.id} flagNotes={pub.flag_notes ?? []} size="sm" decision={pub.decision} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="inline-flex items-center gap-1">
                        <PressScoreBadge
                          score={pub.press_score}
                          analysisStatus={pub.analysis_status}
                          enrichmentStatus={pub.enrichment_status}
                        />
                        <InfoBubble id="press_score" size="sm" />
                      </div>
                      {pub.press_similarity !== null && pub.press_similarity !== undefined && (
                        <div className="inline-flex items-center gap-1">
                          <SimilarityIndicator similarity={pub.press_similarity} />
                          <InfoBubble id="press_similarity" size="sm" />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState variant="inline" title="Keine analysierten Publikationen in diesem Zeitraum." />
          )}

          {hasMorePubs && (
            <div className="mt-4 flex justify-center">
              <Button asChild variant="outline" size="sm">
                {/* `scroll={false}` keeps the user at the load-more position
                    when the server re-renders with more pubs in the list. */}
                <Link
                  href={`?period=${period}&topPubs=${nextLimit}`}
                  scroll={false}
                  aria-label={`${TOP_PUBS_STEP} weitere Publikationen laden`}
                >
                  Mehr laden ({TOP_PUBS_STEP} weitere)
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score distribution chart */}
      {scoreDistribution.some((v) => v > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              StoryScore-Verteilung
              <InfoBubble id="score_distribution_chart" size="md" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreDistributionChart buckets={scoreDistribution} />
          </CardContent>
        </Card>
      )}

      {/* Dimensions radar */}
      {Object.keys(dimensionAvgs).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              Dimensions-Profil (Durchschnitt)
              <InfoBubble id="dimensions_profile" size="md" />
            </CardTitle>
            <p className="text-xs text-muted-foreground">Durchschnittswerte aller analysierten Publikationen</p>
          </CardHeader>
          <CardContent>
            <DimensionsRadar averages={dimensionAvgs} />
          </CardContent>
        </Card>
      )}

      {/* Top keywords cloud */}
      {topKeywords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              Top Keywords
              <InfoBubble id="top_keywords" size="md" />
            </CardTitle>
            <p className="text-xs text-muted-foreground">Häufigste Schlagwörter aus angereicherten Publikationen</p>
          </CardHeader>
          <CardContent>
            <KeywordCloud keywords={topKeywords} />
          </CardContent>
        </Card>
      )}

      {stats.total === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <CapybaraEmpty
              message="Noch keine Publikationen"
              submessage="Importieren Sie zuerst einen WebDB-Datenbankabzug, um zu starten."
            />
            <div className="flex justify-center mt-4">
              <Button asChild>
                <Link href="/upload">Zum WebDB-Import</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
