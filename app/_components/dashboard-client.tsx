'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Pin,
  TrendingUp,
} from '@/lib/icons';
import { ImportDriftBubble } from './import-drift-bubble';
import type { SocialDashboardData } from '@/lib/server/social/dashboard';
import { PressScoreBadge } from '@/components/score-bar';
import { MobileScreenHeader } from '@/components/mobile-screen-header';
import { InfoBubble } from '@/components/info-bubble';
import { CapybaraEmpty } from '@/components/capybara-logo';
import { ChangelogPanel } from '@/components/changelog-panel';
import { VenueLine } from '@/components/venue-line';
import { FlagshipBadge } from '@/components/flagship-badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { displayAuthor, displayInstitute, displayTitle } from '@/lib/shared/publication-display';
import { formatPubDate, pubDateTitle } from '@/lib/shared/format-pub-date';
import {
  buildDashboardHref,
  DASHBOARD_PERIODS,
  PERIOD_LABELS,
  type DashboardPeriod,
  type SortBy,
} from '@/lib/shared/dashboard';
import type { DashboardData } from '@/lib/server/dashboard/fetch';
import type { BoardDashboardCards } from '@/lib/shared/board';
import type { ScoringStatus } from '@/lib/server/ingest/status';
import { ScoringStatusTile } from './scoring-status-tile';
import { KeywordCloud } from './keyword-cloud';
import { CARD } from './dashboard-card';
import { BoardTile } from './board-tile';
import { SocialTrendsTile } from './social-trends-tile';
import { StatTile, MobileStatTile } from './stat-tiles';
import { ScoreDistribution, DimensionMeans } from './analytics-tiles';

function greetingFor(hour: number): string {
  if (hour < 5) return 'Gute Nacht';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Guten Tag';
  if (hour < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

// Hydration-Signal (Muster wie useHydrated in use-current-user.ts): false im
// Server- und Client-Hydrations-Render, true danach. `new Date()` erst nach
// der Hydration lesen, sonst weicht der Gruß (Server-TZ) vom Client-HTML ab.
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function useGreeting(name: string | null) {
  const hydrated = useHydrated();
  const who = name ? `, ${name}` : '';
  if (!hydrated) {
    return {
      line: `Willkommen zurück${who}`,
      date: null as string | null,
      shortDate: null as string | null,
    };
  }
  const now = new Date();
  return {
    line: `${greetingFor(now.getHours())}${who}`,
    date: now.toLocaleDateString('de-AT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    // Kompaktform für die Mono-Subzeile des mobilen App-Headers (M2).
    shortDate: now.toLocaleDateString('de-AT', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }),
  };
}

interface DashboardClientProps {
  data: DashboardData;
  period: DashboardPeriod;
  sortBy: SortBy;
  /** Board-Karten-Kachel (null wenn nicht angemeldet — Board ist auth-gated). */
  boardCards: BoardDashboardCards | null;
  /** Social-Trends-Karte (null solange kein Themen-Snapshot existiert). */
  socialData: SocialDashboardData | null;
  /** Bewertungs-Status je Entität (Import-Datum + unbewertete Kandidaten). */
  scoringStatus: ScoringStatus;
}

export function DashboardClient({ data, period, sortBy, boardCards, socialData, scoringStatus }: DashboardClientProps) {
  const {
    stats,
    topPubs,
    topPubsTotal,
    topPubsLimit,
    flaggedCount,
    webdbAsOf,
    importDrift,
  } = data;
  const { user } = useCurrentUser();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? null;
  const greeting = useGreeting(firstName);

  const dueCards = [...(boardCards?.overdue ?? []), ...(boardCards?.due_soon ?? [])];
  const overdueCount = boardCards?.overdue.length ?? 0;

  // Knoten statt Strings: an „WebDB-Stand" haengt eine Info-Blase, sobald der
  // letzte Import unvollstaendige Verknuepfungen mitgebracht hat. Die Zahl lag
  // bis 2026-08-26 nur im ingest_runs-Journal und war nirgends sichtbar.
  const subParts: ReactNode[] = [
    greeting.date,
    webdbAsOf ? (
      <span key="webdb" className="inline-flex items-center gap-1">
        WebDB-Stand {webdbAsOf}
        {importDrift ? <ImportDriftBubble drift={importDrift} /> : null}
      </span>
    ) : null,
    boardCards ? `${dueCards.length} Karten fällig` : null,
    `${flaggedCount} Publikationen geflaggt`,
  ].filter(Boolean);

  // Mono-Subzeile des mobilen App-Headers (Mock: „Fr, 3. Juli · Stand 06:30").
  const mobileSub = [greeting.shortDate, webdbAsOf ? `WebDB-Stand ${webdbAsOf}` : null]
    .filter(Boolean)
    .join(' · ');

  if (stats.total === 0) {
    return (
      <>
        <MobileScreenHeader
          icon={<BarChart3 size={16} weight="fill" />}
          title={greeting.line}
          sub={greeting.shortDate}
        />
        <div className={`${CARD} border-dashed py-6`}>
          <CapybaraEmpty
            message="Noch keine Publikationen"
            submessage="Importieren Sie zuerst einen WebDB-Datenbankabzug, um zu starten."
          />
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link href="/upload">Zum WebDB-Import</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Stat-Beschriftungen, in Desktop- und Mobile-Layer identisch verwendet.
  const statLabels = {
    pubs:
      stats.peer_reviewed && stats.total
        ? `Publikationen · ${Math.round((stats.peer_reviewed / stats.total) * 100)} % peer-reviewed`
        : 'Publikationen',
    analyzed: stats.total
      ? `analysiert · ${Math.round((stats.analyzed / stats.total) * 100)} % des Bestands`
      : 'analysiert',
    high:
      stats.avg_score !== null
        ? `hohes Story-Potenzial · Ø ${Math.round(stats.avg_score * 100)} %`
        : 'hohes Story-Potenzial',
  };

  return (
    <>
    {/* Blauer App-Header (M2) — nur mobil; Desktop behält den <h1>-Gruß. */}
    <MobileScreenHeader
      icon={<BarChart3 size={16} weight="fill" />}
      title={greeting.line}
      sub={mobileSub}
    />

    {/* ── Desktop-Layer (≥ md) ─────────────────────────────────────────── */}
    <div className="hidden space-y-4 md:block">
      {/* Header: Gruß. Der Zeitraum-Umschalter lebt jetzt im Kopf der
          Top-Storys-Kachel — er scoped nur diese Zeile (Row 3), nicht die
          Stat-Kacheln, und wirkte im Seitenkopf fälschlich global. */}
      <div className="mb-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting.line}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-subtle">
            {subParts.map((part, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden="true">·</span> : null}
                {part}
              </span>
            ))}
          </p>
        </div>
        {/* „Was ist neu": im Toolkit-Redesign (c532111) beim Umbau des
            Hero-Blocks verloren gegangen. Der Auslöser gehört in den Seitenkopf,
            weil der Unread-Punkt dort ohne Scrollen sichtbar ist. */}
        <ChangelogPanel className="mt-0.5 shrink-0" />
      </div>

      {/* Row 1 — Social-Trends + Redaktionsboard (Design Toolkit-Redesign
          §Dashboard 2026-07-06). Fehlt eine Hälfte (kein Snapshot / nicht
          angemeldet), nimmt die andere die volle Breite. */}
      {(socialData || boardCards) && (
        <div className={`grid items-stretch gap-4 ${socialData && boardCards ? 'lg:grid-cols-2' : ''}`}>
          {socialData && <SocialTrendsTile data={socialData} fullWidth={!boardCards} />}
          {boardCards && <BoardTile cards={dueCards} overdueCount={overdueCount} />}
        </div>
      )}

      {/* Row 2 — Bewertungs-Status (Import-Datum + unbewertete Kandidaten + Fallback-Bewerten) */}
      <ScoringStatusTile status={scoringStatus} />

      {/* Row 3 — top storys + analytics */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Top-Storys */}
        <div className={`${CARD} overflow-hidden`}>
          {/* Kopf im Stil der Social-/Board-Kacheln: Verlauf + Icon-Quadrat.
              BookOpen (= Publikationen-Nav-Icon) + „Publikationen" im
              Untertitel machen unmissverständlich, dass hier Publikationen
              ranken — „Top-Storys" bleibt als redaktioneller Name. Brand-Blau
              als Akzent (Board trägt jetzt Bernstein). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-[linear-gradient(120deg,#eef4ff,#f8fbff)] px-4 pb-[13px] pt-[15px] dark:bg-none">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand text-white shadow-[0_3px_10px_rgba(0,71,187,.3)]">
              <BookOpen className="h-[19px] w-[19px]" weight="duotone" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-ink">Top-Storys</span>
                <InfoBubble id="top10_panel" size="sm" />
              </div>
              <div className="mt-px font-mono text-2xs text-[#6f8bbf] dark:text-brand-300/80">
                Publikationen nach Story Score
                {topPubsTotal > topPubs.length && ` · ${topPubsTotal.toLocaleString('de-AT')} im Pool`}
              </div>
            </div>
            <span className="flex-1" />
            {/* Zeitraum-Umschalter — scoped Top-Storys + die Analytik rechts. */}
            <div className="flex items-center gap-1.5">
              <InfoBubble id="dashboard_time_range" size="sm" />
              <nav aria-label="Zeitraum" className="flex gap-0.5 rounded-[9px] bg-surface/70 p-[3px] shadow-sm dark:bg-fill">
                {DASHBOARD_PERIODS.map((value) => (
                  // Native <a> statt Link: query-only-Navigation no-opt in
                  // diesem Next.js-Setup (bestehende Regression, s. Git-Historie).
                  <a
                    key={value}
                    href={buildDashboardHref({ period: value, topPubs: topPubsLimit, sortBy })}
                    aria-current={period === value ? 'page' : undefined}
                    className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors ${
                      period === value
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-ink-subtle hover:text-ink'
                    }`}
                  >
                    {PERIOD_LABELS[value]}
                  </a>
                ))}
              </nav>
            </div>
          </div>
          <div className="px-2 py-2">
            {topPubs.length > 0 ? (
              topPubs.map((pub, i) => {
                const institute = displayInstitute(pub);
                return (
                  <Link
                    key={pub.id}
                    href={`/publications/${pub.id}`}
                    className="group flex items-start gap-3 rounded-[10px] px-2.5 py-[11px] transition-colors hover:bg-canvas"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-2xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-[1.35] text-ink group-hover:text-brand">
                        {displayTitle(pub.title, pub.citation)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-subtle">
                          {displayAuthor(pub)}
                          {institute ? ` · ${institute}` : ''}
                        </span>
                        <FlagshipBadge journal={pub.enriched_journal} />
                        {pub.published_at && (
                          <span
                            className="font-mono text-2xs text-ink-muted"
                            title={pubDateTitle(pub.published_at)}
                          >
                            {formatPubDate(pub.published_at)}
                          </span>
                        )}
                      </div>
                      <VenueLine journal={pub.enriched_journal} />
                      {pub.pitch_suggestion && (
                        <p className="mt-1 line-clamp-2 text-xs leading-[1.45] text-ink-soft">
                          {pub.pitch_suggestion}
                        </p>
                      )}
                    </div>
                    <PressScoreBadge
                      score={pub.press_score}
                      analysisStatus={pub.analysis_status}
                      enrichmentStatus={pub.enrichment_status}
                    />
                  </Link>
                );
              })
            ) : (
              <p className="px-2.5 py-8 text-center text-sm text-ink-subtle">
                Keine analysierten Publikationen in diesem Zeitraum.
              </p>
            )}
          </div>
          <Link
            href="/publications"
            className="flex items-center gap-1.5 border-t border-line px-[18px] py-3 text-xs font-semibold text-brand transition-colors hover:bg-canvas"
          >
            Alle Publikationen
            <span className="flex-1" />
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Analytics column */}
        <div className="flex flex-col gap-4">
          <ScoreDistribution buckets={stats.score_distribution} />
          <DimensionMeans averages={stats.dimension_avgs} />
          {stats.top_keywords.length > 0 && (
            <div className={`${CARD} px-[18px] py-4`}>
              <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                Häufige Keywords
                <InfoBubble id="top_keywords" size="sm" />
              </div>
              <KeywordCloud keywords={stats.top_keywords} />
            </div>
          )}
        </div>
      </div>

      {/* Row 4 — Bestand (Design: ganz unten) */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          icon={<BookOpen className="h-[21px] w-[21px]" />}
          value={stats.total}
          label={statLabels.pubs}
          bubbleId="stat_total_pubs"
        />
        <StatTile
          icon={<BarChart3 className="h-[21px] w-[21px]" />}
          value={stats.analyzed}
          label={statLabels.analyzed}
          bubbleId="stat_analyzed"
        />
        <StatTile
          icon={<TrendingUp className="h-[21px] w-[21px]" />}
          iconClass="bg-success-tint text-success"
          value={stats.high_score_count}
          label={statLabels.high}
          bubbleId="stat_high_score"
        />
      </div>
    </div>

    {/* ── Mobile-Layer (< md) — Mock Board-Mobile.dc.html Z. 263–358 (M3) ──
        Gruß trägt der blaue App-Header oben (M2); Score-Verteilung hat der
        Mobile-Mock bewusst nicht. */}
    <div className="space-y-3.5 md:hidden">
      {/* „Was ist neu" — mobil rechtsbündig über der ersten Kachel, weil der
          blaue App-Header (M2) keinen Platz für einen zweiten Auslöser hat. */}
      <div className="flex justify-end">
        <ChangelogPanel />
      </div>

      {/* Board-Kachel (wie Desktop, Karte trägt Fälliges + „Zum Board") */}
      {boardCards && <BoardTile cards={dueCards} overdueCount={overdueCount} />}

      {/* Social-Trends (Mock Board-Mobile §Dashboard 2026-07-06) */}
      {socialData && <SocialTrendsTile data={socialData} />}

      {/* Bewertungs-Status (identisch zum Desktop-Layer) */}
      <ScoringStatusTile status={scoringStatus} />

      {/* 2-Spalten-Stat-Grid; 4. Kachel = Triage (Desktop-Aktions-Kachel) */}
      <div className="grid grid-cols-2 gap-2.5">
        <MobileStatTile
          icon={<BookOpen className="h-[18px] w-[18px]" weight="duotone" />}
          value={stats.total}
          label={statLabels.pubs}
        />
        <MobileStatTile
          icon={<BarChart3 className="h-[18px] w-[18px]" weight="duotone" />}
          value={stats.analyzed}
          label={statLabels.analyzed}
        />
        <MobileStatTile
          icon={<TrendingUp className="h-[18px] w-[18px]" weight="duotone" />}
          iconClass="bg-success-tint text-success"
          value={stats.high_score_count}
          label={statLabels.high}
        />
        <MobileStatTile
          icon={<Pin className="h-[18px] w-[18px]" weight="duotone" />}
          iconClass="bg-warning-tint text-warning"
          value={flaggedCount}
          label="für Triage geflaggt"
        />
      </div>

      {/* Zeitraum-Chips — direkt über Top-Storys, weil sie nur diese Liste
          scopen (nicht die Stat-Kacheln darüber). x-scroll bis Viewport-Rand. */}
      <nav
        aria-label="Zeitraum"
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max gap-[7px]">
          {DASHBOARD_PERIODS.map((value) => (
            // Native <a> statt Link — wie bei den Desktop-Tabs.
            <a
              key={value}
              href={buildDashboardHref({ period: value, topPubs: topPubsLimit, sortBy })}
              aria-current={period === value ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-[13px] py-[7px] text-xs font-semibold transition-colors ${
                period === value
                  ? 'bg-brand text-white'
                  : 'border border-line bg-surface text-ink-subtle'
              }`}
            >
              {PERIOD_LABELS[value]}
            </a>
          ))}
        </div>
      </nav>

      {/* Top-Storys, kompakte Zeilen (Rang · Titel/Meta · Score) */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-2.5 border-b border-line bg-[linear-gradient(120deg,#eef4ff,#f8fbff)] px-[15px] pb-[11px] pt-3 dark:bg-none">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand text-white shadow-[0_3px_10px_rgba(0,71,187,.3)]">
            <BookOpen className="h-[17px] w-[17px]" weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold tracking-tight text-ink">Top-Storys</div>
            <div className="mt-px font-mono text-2xs text-[#6f8bbf] dark:text-brand-300/80">
              Publikationen · {topPubsTotal.toLocaleString('de-AT')} im Pool
            </div>
          </div>
        </div>
        <div className="px-[7px] pb-[7px] pt-[5px]">
          {topPubs.length > 0 ? (
            topPubs.map((pub, i) => {
              const institute = displayInstitute(pub);
              return (
                <Link
                  key={pub.id}
                  href={`/publications/${pub.id}`}
                  className="flex items-start gap-[11px] rounded-[10px] px-2 py-2.5 transition-colors active:bg-canvas"
                >
                  <span
                    className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                      i < 3 ? 'bg-brand text-white' : 'bg-fill text-ink-subtle'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-[1.35] text-ink">
                      {displayTitle(pub.title, pub.citation)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {displayAuthor(pub)}
                      {institute ? ` · ${institute}` : ''}
                    </p>
                  </div>
                  <PressScoreBadge
                    score={pub.press_score}
                    analysisStatus={pub.analysis_status}
                    enrichmentStatus={pub.enrichment_status}
                  />
                </Link>
              );
            })
          ) : (
            <p className="px-2.5 py-8 text-center text-sm text-ink-subtle">
              Keine analysierten Publikationen in diesem Zeitraum.
            </p>
          )}
        </div>
        <Link
          href="/publications"
          className="flex items-center gap-1.5 border-t border-line px-[15px] py-3 text-xs font-semibold text-brand"
        >
          Alle Publikationen
          <span className="flex-1" />
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <DimensionMeans averages={stats.dimension_avgs} />

      {stats.top_keywords.length > 0 && (
        <div className={`${CARD} p-[15px]`}>
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
            Häufige Keywords
            <InfoBubble id="top_keywords" size="sm" />
          </div>
          <KeywordCloud keywords={stats.top_keywords} />
        </div>
      )}
    </div>
    </>
  );
}
