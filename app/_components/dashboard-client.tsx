'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { AnimateNumber } from 'motion-number';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Newspaper,
  Pin,
  TrendingUp,
  X,
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
import { CapybaraGlitch } from '@/components/capybara-glitch';
import { CapybaraLightbox } from '@/components/capybara-lightbox';
import { PublicationFlag } from '@/components/publication-flag';
import { AUTH_STORAGE_KEY, AUTH_SUCCESS_EVENT } from '@/lib/client/auth-events';
import { displayTitle } from '@/lib/shared/html-utils';
import { displayAuthor, displayInstitute } from '@/lib/shared/publication-display';
import {
  buildDashboardHref,
  DASHBOARD_PERIODS,
  DBKEY_TO_SORT_KEY,
  SORT_BY_LABELS,
  TOP_PUBS_MAX,
  TOP_PUBS_STEP,
  type DashboardPeriod,
  type DimensionDbKey,
  type DimensionSortKey,
  type SortBy,
} from '@/lib/shared/dashboard';
import type { PublicationListItem } from '@/lib/server/publications/list';
// `import type` keeps `lib/server/dashboard/fetch.ts` out of the client bundle
// — that module transitively imports postgres + drizzle and would fail the
// RSC → Client boundary check if pulled in as a value import.
import type { DashboardData } from '@/lib/server/dashboard/fetch';
import { KeywordCloud } from './keyword-cloud';
import { ScoreSimilarityScatter } from './score-similarity-scatter';
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
  sortBy: SortBy;
}

/**
 * Typed getter table: each entry pulls the matching dimension field off a Pub
 * without the unsafe `as unknown as Record<...>` cast. If PublicationListItem
 * ever loses one of these fields, the TypeScript build fails right here.
 */
const DIMENSION_GETTERS: Record<
  DimensionSortKey,
  (pub: PublicationListItem) => number | null
> = {
  accessibility: (pub) => pub.public_accessibility,
  relevance:     (pub) => pub.societal_relevance,
  novelty:       (pub) => pub.novelty_factor,
  storytelling:  (pub) => pub.storytelling_potential,
  timeliness:    (pub) => pub.media_timeliness,
};

function DimensionBadge({
  pub,
  sortBy,
}: {
  pub: PublicationListItem;
  sortBy: DimensionSortKey;
}) {
  const value = DIMENSION_GETTERS[sortBy](pub);
  if (value === null) return null;
  return (
    <Badge
      variant="outline"
      className="text-[10px] border-brand/30 bg-brand/5 text-brand tabular-nums px-1.5 py-0"
    >
      {SORT_BY_LABELS[sortBy]} {Math.round(value * 100)} %
    </Badge>
  );
}

const DASHBOARD_GLITCH_DATE_KEY = 'storyscout-dashboard-glitch-date';

/** Local-timezone YYYY-MM-DD via en-CA locale (ISO format, no UTC offset confusion). */
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function DashboardClient({ data, period, sortBy }: DashboardClientProps) {
  const {
    stats,
    topPubs,
    topPubsTotal,
    topPubsLimit,
    flaggedCount,
    pressReleasedCount,
    orphansCount,
    scoreSimilarityPoints,
  } = data;
  const dimensionAvgs = stats.dimension_avgs;
  const topKeywords = stats.top_keywords;
  // „Mehr laden" only when more pubs exist AND the cap isn't reached yet — at
  // limit=TOP_PUBS_MAX the URL parser would clamp the next click back to MAX
  // and the request would no-op, so we hide the button instead.
  const hasMorePubs = topPubs.length < topPubsTotal && topPubsLimit < TOP_PUBS_MAX;
  const nextLimit = Math.min(topPubsLimit + TOP_PUBS_STEP, TOP_PUBS_MAX);

  // Capybara boot-sequence: play once per local-calendar-day. Triggered either
  // on mount (returning user already authenticated in this session) or on the
  // auth-success event (first password entry of the session). Either path
  // ends in the cyber image staying visible after the animation completes.
  const [playGlitch, setPlayGlitch] = useState(false);
  useEffect(() => {
    const tryTrigger = () => {
      if (sessionStorage.getItem(AUTH_STORAGE_KEY) !== '1') return false;
      const last = localStorage.getItem(DASHBOARD_GLITCH_DATE_KEY);
      if (last !== todayLocal()) setPlayGlitch(true);
      return true;
    };
    if (tryTrigger()) return;
    window.addEventListener(AUTH_SUCCESS_EVENT, tryTrigger);
    return () => window.removeEventListener(AUTH_SUCCESS_EVENT, tryTrigger);
  }, []);

  const handleGlitchComplete = useCallback(() => {
    localStorage.setItem(DASHBOARD_GLITCH_DATE_KEY, todayLocal());
  }, []);

  // Single navigation primitive: replace the URL with the same period+limit
  // but a different sortBy. router.replace + scroll:false keeps the scroll
  // position so the sort feels in-place rather than a full re-load. Both
  // the radar click and the pill's X reset route through here.
  // Navigate by changing the URL with a real navigation rather than
  // router.replace — the latter silently no-ops on query-only updates in
  // this Next.js 16.2.4 setup (Playwright-verified). The browser-native
  // cross-document View Transitions in `app/globals.css` make the perceived
  // UX a 200ms crossfade rather than a white-flash. Switch back to
  // `router.replace(href, { scroll: false })` if the Next.js navigation
  // regression is upstream-fixed; the View-Transition rule layers on top
  // of SPA transitions too and stays useful.
  const navigateToSort = useCallback(
    (next: SortBy) => {
      const href = buildDashboardHref({ period, topPubs: topPubsLimit, sortBy: next });
      window.location.assign(href);
    },
    [period, topPubsLimit],
  );

  // Radar click-to-sort. The axis emits a typed DimensionDbKey; the table
  // lookup is exhaustive by type, so no runtime guard is needed.
  const handleAxisClick = useCallback(
    (dbKey: DimensionDbKey) => {
      const sortKey = DBKEY_TO_SORT_KEY[dbKey];
      navigateToSort(sortBy === sortKey ? 'score' : sortKey);
    },
    [sortBy, navigateToSort],
  );

  const clearSort = useCallback(() => navigateToSort('score'), [navigateToSort]);

  // The active dimension sort key (or null when sorted by Story Score).
  const activeDimensionSort: DimensionSortKey | null = sortBy === 'score' ? null : sortBy;

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
            <CapybaraLightbox
              src="/capybara-logo-cyber.png"
              alt="Story Scout Capybara, Cyber-Edition, in voller Größe"
              width={1254}
              height={1254}
            >
              <CapybaraGlitch
                oldSrc="/capybara-logo-alpha.png"
                cyberSrc="/capybara-logo-cyber-alpha.png"
                oldAlt="Story Scout Capybara"
                cyberAlt="Story Scout Capybara, Cyber-Edition"
                play={playGlitch}
                onComplete={handleGlitchComplete}
                className="h-[140px] w-[140px]"
                priority
              />
            </CapybaraLightbox>

            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                  Story Scout
                </h1>
                <span className="text-xs font-medium tracking-wide text-muted-foreground/70 tabular-nums">
                  v0.2
                </span>
              </div>
              <p className="text-muted-foreground mt-1.5 max-w-md">
                Finde die besten Storys in ÖAW-Publikationen.
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
      <div className="grid gap-4 md:grid-cols-3">
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
          {pressReleasedCount + orphansCount > 0 && (
            <Button asChild variant="outline" className="border-emerald-300 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
              <Link href="/press-releases">
                <Newspaper className="mr-2 h-4 w-4" />
                {pressReleasedCount + orphansCount} ÖAW-Pressemitteilungen
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Top publications with time filter */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base inline-flex items-center gap-1.5 flex-wrap">
              Top {topPubs.length} Publikationen
              {sortBy === 'score' && (
                <span className="text-muted-foreground/70 font-normal">(nach Story Score)</span>
              )}
              <InfoBubble id="top10_panel" size="md" />
              <AnimatePresence>
                {activeDimensionSort && (
                  <motion.button
                    key="sort-pill"
                    type="button"
                    onClick={clearSort}
                    initial={{ opacity: 0, scale: 0.85, y: -2 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.85, y: -2 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                    className="inline-flex items-center gap-1 rounded-full bg-brand/10 hover:bg-brand/15 px-2.5 py-0.5 text-[11px] font-medium text-brand transition-colors ring-1 ring-inset ring-brand/20"
                    aria-label={`Sortierung nach ${SORT_BY_LABELS[activeDimensionSort]} aufheben`}
                  >
                    Sortiert: {SORT_BY_LABELS[activeDimensionSort]}
                    <X className="h-3 w-3 opacity-70" aria-hidden />
                  </motion.button>
                )}
              </AnimatePresence>
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
                navigation. buildDashboardHref preserves sortBy across period
                changes so an active dimension sort survives the click. */}
            <nav aria-label="Zeitraum" className="flex rounded-lg border bg-muted p-0.5">
              {DASHBOARD_PERIODS.map((value) => (
                // Plain <a> rather than <Link> because Next.js Link's onClick
                // intercepts the navigation and calls a router method that
                // silently no-ops on query-only dashboard updates in this
                // setup (same regression as the radar's click-to-sort).
                // <a> falls back to native browser navigation = real URL
                // change + server-rendered new content. See navigateToSort.
                <a
                  key={value}
                  href={buildDashboardHref({ period: value, topPubs: topPubsLimit, sortBy })}
                  aria-current={period === value ? 'page' : undefined}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    period === value
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {TIME_TAB_LABELS[value]}
                </a>
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
                      {/* Active-dimension badge appears only while the radar
                          is driving the sort, so the reason this pub is at
                          its current rank is visible at-a-glance. */}
                      {activeDimensionSort && (
                        <DimensionBadge pub={pub} sortBy={activeDimensionSort} />
                      )}
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
                {/* Plain <a> rather than <Link> — see Period-Tab comment
                    above. Same Next.js query-only navigation regression. */}
                <a
                  href={buildDashboardHref({ period, topPubs: nextLimit, sortBy })}
                  aria-label={`${TOP_PUBS_STEP} weitere Publikationen laden`}
                >
                  Mehr laden ({TOP_PUBS_STEP} weitere)
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Story Score x Press-Similarity joint scatter */}
      {scoreSimilarityPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              Story Score &times; Press-Similarity
              <InfoBubble id="score_distribution_chart" size="md" />
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Zwei unabhängige Signale gemeinsam: die LLM-Inhaltsbewertung
              (X, 0–100 %) gegen die semantische Nähe zum Press-Cluster
              (Y, gezoomt auf 70–100 %). Oben-links = niedriger Score trotz
              hoher Similarity (LLM evtl. zu streng).
            </p>
          </CardHeader>
          <CardContent>
            <ScoreSimilarityScatter points={scoreSimilarityPoints} />
          </CardContent>
        </Card>
      )}

      {/* Marginal mirror histogram — kept alongside the scatter: the scatter
          shows how the two metrics relate, this shows each metric's own
          distribution shape. */}
      {(stats.score_distribution.some((v) => v > 0) ||
        stats.similarity_distribution.some((v) => v > 0)) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Randverteilungen: Story Score &amp; Press-Similarity
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Jede Kennzahl für sich: Story Score oben (0–100 %),
              Press-Similarity gespiegelt unten (gezoomt auf 70–100 %, das
              SPECTER2-Cosinus-Band). Der Scatter darüber zeigt, wie beide
              zusammenhängen, dieses Diagramm ihre jeweilige Form.
            </p>
          </CardHeader>
          <CardContent>
            <ScoreDistributionChart
              scoreBuckets={stats.score_distribution}
              similarityBuckets={stats.similarity_distribution}
            />
          </CardContent>
        </Card>
      )}

      {/* Dimensions radar — click an axis to sort the Top-Pubs panel above
          by that dimension. The polygon itself shows the corpus average;
          the interactive layer flips the Top-N sort key. */}
      {Object.keys(dimensionAvgs).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              Dimensions-Profil (Durchschnitt)
              <InfoBubble id="dimensions_profile" size="md" />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Durchschnittswerte aller analysierten Publikationen. Klick eine
              Achse, um die Top-Pubs nach dieser Dimension zu sortieren.
            </p>
          </CardHeader>
          <CardContent>
            <DimensionsRadar
              averages={dimensionAvgs}
              activeSortBy={sortBy}
              onAxisClick={handleAxisClick}
            />
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
