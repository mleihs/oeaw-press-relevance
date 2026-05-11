'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { motion } from 'motion/react';
import { AnimateNumber } from 'motion-number';
import { Sparkles, BookOpen, BarChart3, TrendingUp, Pin, ClipboardCheck, Newspaper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PressScoreBadge } from '@/components/score-bar';
import { StatCard } from '@/components/stat-card';
import { AtmosphericOrb } from '@/components/atmospheric-orb';
import { InfoBubble } from '@/components/info-bubble';
import { LoadingState } from '@/components/loading-state';
import { EmptyState } from '@/components/empty-state';
import { ApiErrorCard } from '@/components/api-error-card';
import { CapybaraEmpty } from '@/components/capybara-logo';
import { ChangelogPanel } from '@/components/changelog-panel';
import { PublicationFlag } from '@/components/publication-flag';
import { useApiQuery } from '@/lib/client/hooks/use-api-query';
import { PublicationStats, PublicationWithRelations } from '@/lib/shared/types';
import { displayTitle } from '@/lib/shared/html-utils';
import { displayAuthor, displayInstitute } from '@/lib/shared/publication-display';

// Recharts is ~100kB gz; lazy-load via next/dynamic so it only ships when
// the dashboard actually has data to show in this card.
const DimensionsRadar = dynamic(() => import('./_components/dimensions-radar'), {
  ssr: false,
  loading: () => <div className="h-[280px]" aria-hidden />,
});

type TimePeriod = 'week' | 'month' | 'year' | 'all';

const TIME_TABS: { value: TimePeriod; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year', label: 'Jahr' },
  { value: 'all', label: 'Gesamt' },
];

function getPublishedAfter(period: TimePeriod): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function getTimeRangeLabel(period: TimePeriod): string {
  if (period === 'all') return 'Alle Zeiträume';
  const now = new Date();
  const monthNames = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  if (period === 'week') return `Letzte 7 Tage`;
  if (period === 'month') return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  return `Letztes Jahr`;
}

export default function DashboardPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');

  // statsQuery liefert seit 2026-05-05 auch dimension_avgs + top_keywords aus
  // einer PG-Funktion (publication_dashboard_aggregates). Vorher gab es einen
  // zweiten Query, der bis zu 500 Pubs gezogen hat, nur um clientseitig 5
  // Mittelwerte und 30 Top-Keywords zu berechnen — ~3 MB Network → 2 KB JSON.
  const statsQuery = useApiQuery<PublicationStats>(
    ['dashboard-stats'],
    '/api/publications/stats?default_eligible=true',
  );

  // ITA-subtree exclusion is enforced server-side via exclude_ita=true,
  // which translates to a single indexed predicate on the cached
  // publications.is_ita_subtree column (set by the ETL after every
  // webdb-import). No client-side filtering needed.
  //
  // popular_science=false: Pop-Science-Pubs sind primär bereits Outreach
  // — das Dashboard-Top-10 ist als „was sollten wir pitchen?" gemeint und
  // soll daher nur wissenschaftliche Pubs zeigen. Pop-Science-Pubs bleiben
  // über /publications mit `Popular Science`-Preset weiterhin auffindbar.
  const topUrl = (() => {
    const params = new URLSearchParams({
      sort: 'press_score',
      order: 'desc',
      pageSize: '10',
      analysis_status: 'analyzed',
      default_eligible: 'true',
      exclude_ita: 'true',
      popular_science: 'false',
    });
    const publishedAfter = getPublishedAfter(timePeriod);
    if (publishedAfter) params.set('published_after', publishedAfter);
    return `/api/publications?${params}`;
  })();
  const topQuery = useApiQuery<{ publications?: PublicationWithRelations[] }>(
    ['dashboard-top', timePeriod],
    topUrl,
  );

  // Geflaggt-Count: separater Mini-Query, nutzt das `flagged=true`-Filter
  // im /api/publications-Listing. pageSize=1 weil wir nur den Count brauchen.
  const flaggedQuery = useApiQuery<{ total?: number }>(
    ['dashboard-flagged'],
    '/api/publications?flagged=true&pageSize=1',
  );

  // Press-Released-Count: pubs die schon eine ÖAW-Pressemitteilung haben
  // (cross-reference aus TYPO3-news per DOI). Zeigt dem Press-Team auf einen
  // Blick wie viele Papers schon gepressed sind.
  const pressReleasedQuery = useApiQuery<{ total?: number }>(
    ['dashboard-press-released'],
    '/api/publications?press_released=true&pageSize=1',
  );

  // Orphan press-releases: TYPO3-news mit DOI, aber Paper nicht in unserer
  // publications-DB (z.B. weil OeAW-Co-Author statt -Lead).
  const orphansQuery = useApiQuery<{ total?: number }>(
    ['dashboard-orphans'],
    '/api/press-releases?orphans=true',
  );

  const stats = statsQuery.data ?? null;
  const scoreDistribution = stats?.score_distribution ?? [];
  const topPubs = topQuery.data?.publications ?? [];
  const loading = statsQuery.isLoading;
  const topLoading = topQuery.isLoading;
  const firstError = statsQuery.error ?? topQuery.error;
  const error = firstError?.message ?? null;

  // dimension_avgs + top_keywords kommen jetzt aus stats (PG-Funktion).
  // Konvertierung in das Render-Shape, das die unteren Karten erwarten.
  const dimensionAvgs: Record<string, number> = stats?.dimension_avgs ?? {};
  const topKeywords = stats?.top_keywords ?? [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Image src="/capybara-logo.png" alt="StoryScout" width={80} height={80} className="opacity-50 mix-blend-multiply dark:mix-blend-normal" />
        <p className="text-sm text-muted-foreground">Lade Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <ApiErrorCard
        title="Verbindungsfehler"
        message={error}
        hint={
          <>
            Prüfen Sie die Supabase-Konfiguration in den{' '}
            <Link href="/settings" className="underline text-brand">Einstellungen</Link>.
          </>
        }
      />
    );
  }

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
              {stats && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <div className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    <AnimateNumber className="font-semibold text-foreground tabular-nums">{stats.total ?? 0}</AnimateNumber>
                    <span>Pubs</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <AnimateNumber className="font-semibold text-foreground tabular-nums">{stats.analyzed ?? 0}</AnimateNumber>
                    <span>analysiert</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-brand" />
                    <AnimateNumber className="font-semibold text-brand tabular-nums">{stats.high_score_count ?? 0}</AnimateNumber>
                    <span>mit hohem Story-Potenzial</span>
                  </div>
                </div>
              )}
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
          value={stats?.total ?? 0}
          icon={<BookOpen className="h-5 w-5" />}
          subtitle={
            stats?.peer_reviewed && stats?.total
              ? `${stats.peer_reviewed.toLocaleString('de-AT')} peer-reviewed (${Math.round(stats.peer_reviewed / stats.total * 100)}%)`
              : undefined
          }
        />
        <StatCard
          label="Popular Science"
          explId="stat_popular_science"
          value={stats?.popular_science ?? 0}
          icon={<Sparkles className="h-5 w-5" />}
          subtitle={
            stats?.popular_science && stats?.total
              ? `${Math.round(stats.popular_science / stats.total * 100)}% aller Publikationen — Quellsignal`
              : 'Vorklassifiziert in WebDB'
          }
        />
        <StatCard
          label="Analysiert"
          explId="stat_analyzed"
          value={stats?.analyzed ?? 0}
          icon={<BarChart3 className="h-5 w-5" />}
          subtitle={stats?.total ? `${Math.round((stats.analyzed / stats.total) * 100)}% aller Publikationen` : undefined}
        />
        <StatCard
          label="Hohes Story-Potenzial"
          explId="stat_high_score"
          value={stats?.high_score_count ?? 0}
          icon={<TrendingUp className="h-5 w-5" />}
          subtitle={stats?.avg_score !== null && stats?.avg_score !== undefined ? `Durchschnitt: ${Math.round(stats.avg_score * 100)}%` : undefined}
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
              {(() => {
                const n = flaggedQuery.data?.total ?? 0;
                if (n === 0) return null;
                return (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300/90">
                    <Pin className="h-3 w-3 fill-amber-400 text-amber-500" />
                    {n} geflaggt
                  </span>
                );
              })()}
            </Link>
          </Button>
          {(() => {
            const n = pressReleasedQuery.data?.total ?? 0;
            if (n === 0) return null;
            return (
              <Button asChild variant="outline" className="border-emerald-300 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
                <Link href="/publications?pressReleased=yes">
                  <Newspaper className="mr-2 h-4 w-4" />
                  {n} mit ÖAW-Pressemitteilung
                </Link>
              </Button>
            );
          })()}
          {(() => {
            const n = orphansQuery.data?.total ?? 0;
            if (n === 0) return null;
            return (
              <Button asChild variant="outline" className="border-emerald-200 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
                <Link href="/press-releases">
                  <Newspaper className="mr-2 h-4 w-4 opacity-60" />
                  {n} externe Pressemitteilungen
                </Link>
              </Button>
            );
          })()}
        </CardContent>
      </Card>

      {/* Top publications with time filter */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base inline-flex items-center gap-1.5">
              Top 10 Publikationen (nach StoryScore)
              <InfoBubble id="top10_panel" size="md" />
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {getTimeRangeLabel(timePeriod)} · ohne Pop-Science
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span id="time-tabs-label" className="text-xs text-muted-foreground hidden sm:block">Zeitraum:</span>
            <div role="tablist" aria-labelledby="time-tabs-label" className="flex rounded-lg border bg-muted p-0.5">
            {TIME_TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={timePeriod === tab.value}
                onClick={() => setTimePeriod(tab.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  timePeriod === tab.value
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <LoadingState label="Lade Top-Publikationen …" />
          ) : topPubs.length > 0 ? (
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
                  <PressScoreBadge score={pub.press_score} analysisStatus={pub.analysis_status} enrichmentStatus={pub.enrichment_status} />
                </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState variant="inline" title="Keine analysierten Publikationen in diesem Zeitraum." />
          )}
        </CardContent>
      </Card>

      {/* Score distribution chart */}
      {scoreDistribution.some(v => v > 0) && (
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

      {stats?.total === 0 && (
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

function KeywordCloud({ keywords }: { keywords: { word: string; count: number }[] }) {
  // Hooks must come BEFORE any early return — React hook count must be stable
  // across renders or the second render after the dataset toggles produces a warning.
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (keywords.length === 0) return null;
  const max = Math.max(...keywords.map(k => k.count));
  const getSize = (count: number) => 12 + (count / max) * 12;

  return (
    <>
      <div
        className="flex flex-wrap gap-2 justify-center items-baseline"
        role="presentation"
        aria-hidden="true"
      >
        {keywords.map(({ word, count }, i) => (
          <span
            key={word}
            className={`inline-block px-2 py-0.5 rounded-full bg-muted text-foreground/80
              hover:bg-brand hover:text-white cursor-default
              transition-all duration-500 ease-out
              motion-reduce:transition-none`}
            style={{
              fontSize: `${getSize(count)}px`,
              opacity: animated ? 1 : 0,
              transform: animated ? 'scale(1)' : 'scale(0.5)',
              transitionDelay: `${i * 30}ms`,
            }}
            title={`${count}× in Publikationen`}
          >
            {word}
          </span>
        ))}
      </div>
      {/* W3: AT-friendly equivalent of the visual cloud. */}
      <ul className="sr-only" aria-label="Top Keywords aus angereicherten Publikationen">
        {keywords.map(({ word, count }) => (
          <li key={word}>{word}: {count} mal</li>
        ))}
      </ul>
    </>
  );
}

const BUCKET_LABELS = ['0-9%', '10-19%', '20-29%', '30-39%', '40-49%', '50-59%', '60-69%', '70-79%', '80-89%', '90-100%'];
const BUCKET_COLORS = [
  'bg-chart-bucket-1',
  'bg-chart-bucket-2',
  'bg-chart-bucket-3',
  'bg-chart-bucket-4',
  'bg-chart-bucket-5',
  'bg-chart-bucket-6',
  'bg-chart-bucket-7',
  'bg-chart-bucket-8',
  'bg-chart-bucket-9',
  'bg-chart-bucket-10',
];

function ScoreDistributionChart({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-1" role="presentation">
      <div className="flex items-end gap-1 h-32" aria-hidden="true">
        {buckets.map((count, i) => {
          const targetHeight = Math.max(count > 0 ? 4 : 0, (count / max) * 100);
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              {count > 0 && (
                <span
                  className={`text-[10px] text-muted-foreground mb-0.5 transition-opacity duration-300 motion-reduce:transition-none ${animated ? 'opacity-100' : 'opacity-0'}`}
                  style={{ transitionDelay: `${i * 50}ms` }}
                >
                  {count}
                </span>
              )}
              <div
                className={`w-full rounded-t ${BUCKET_COLORS[i]} transition-all duration-500 ease-out motion-reduce:transition-none`}
                style={{
                  height: animated ? `${targetHeight}%` : '0%',
                  transitionDelay: `${i * 50}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {BUCKET_LABELS.map((label, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
      {/* W3: AT-friendly equivalent of the visual chart. */}
      <ul className="sr-only" aria-label="StoryScore-Verteilung">
        {buckets.map((count, i) => (
          <li key={i}>{BUCKET_LABELS[i]}: {count} Publikationen</li>
        ))}
      </ul>
    </div>
  );
}
