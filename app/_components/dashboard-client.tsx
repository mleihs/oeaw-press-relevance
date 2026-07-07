'use client';

import { useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  AlarmClock,
  Heart,
  InstagramLogo,
  Kanban,
  MessageCircle,
  Pin,
  TrendingDown,
  TrendingUp,
} from '@/lib/icons';
import { socialAccent } from '@/app/social/_components/social-accents';
import type { SocialDashboardData, SocialDashboardTheme } from '@/lib/server/social/dashboard';
import { PressScoreBadge } from '@/components/score-bar';
import { MobileScreenHeader } from '@/components/mobile-screen-header';
import { InfoBubble } from '@/components/info-bubble';
import { CapybaraEmpty } from '@/components/capybara-logo';
import { VenueLine } from '@/components/venue-line';
import { FlagshipBadge } from '@/components/flagship-badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { displayAuthor, displayInstitute, displayTitle } from '@/lib/shared/publication-display';
import { formatPubDate, pubDateTitle } from '@/lib/shared/format-pub-date';
import { formatCompact } from '@/lib/shared/format-compact';
import {
  buildDashboardHref,
  DASHBOARD_PERIODS,
  DBKEY_TO_SORT_KEY,
  DIMENSION_DB_KEYS,
  PERIOD_LABELS,
  SORT_BY_LABELS,
  type DashboardPeriod,
  type SortBy,
} from '@/lib/shared/dashboard';
import { cardDeepLink, type BoardCardRef } from '@/lib/shared/board';
import type { DashboardData } from '@/lib/server/dashboard/fetch';
import type { BoardDashboardCards } from '@/lib/shared/board';
import { KeywordCloud } from './keyword-cloud';

// Kartengrund nach Design System §5 (Elevation-1) — überall gleich, damit die
// Panels als ein System lesen. Tokens statt Hex (docs/DESIGN_SYSTEM.md §2).
const CARD =
  'rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,46,.05)]';

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
}

export function DashboardClient({ data, period, sortBy, boardCards, socialData }: DashboardClientProps) {
  const {
    stats,
    topPubs,
    topPubsTotal,
    topPubsLimit,
    flaggedCount,
    webdbAsOf,
  } = data;
  const { user } = useCurrentUser();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? null;
  const greeting = useGreeting(firstName);

  const dueCards = [...(boardCards?.overdue ?? []), ...(boardCards?.due_soon ?? [])];
  const overdueCount = boardCards?.overdue.length ?? 0;

  const subParts = [
    greeting.date,
    webdbAsOf ? `WebDB-Stand ${webdbAsOf}` : null,
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
      {/* Header: Gruß + Perioden-Tabs */}
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting.line}</h1>
          <p className="mt-1.5 text-sm text-ink-subtle">{subParts.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1.5">
        <InfoBubble id="dashboard_time_range" size="sm" />
        <nav
          aria-label="Zeitraum"
          className="flex gap-0.5 rounded-[9px] bg-fill p-[3px]"
        >
          {DASHBOARD_PERIODS.map((value) => (
            // Native <a> statt Link: query-only-Navigation no-opt in diesem
            // Next.js-Setup (bestehende Regression, s. Git-Historie).
            <a
              key={value}
              href={buildDashboardHref({ period: value, topPubs: topPubsLimit, sortBy })}
              aria-current={period === value ? 'page' : undefined}
              className={`rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {/* Row 1 — Social-Trends + Redaktionsboard (Design Toolkit-Redesign
          §Dashboard 2026-07-06). Fehlt eine Hälfte (kein Snapshot / nicht
          angemeldet), nimmt die andere die volle Breite. */}
      {(socialData || boardCards) && (
        <div className={`grid items-stretch gap-4 ${socialData && boardCards ? 'lg:grid-cols-2' : ''}`}>
          {socialData && <SocialTrendsTile data={socialData} />}
          {boardCards && <BoardTile cards={dueCards} overdueCount={overdueCount} />}
        </div>
      )}

      {/* Row 3 — top storys + analytics */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Top-Storys */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-[18px] pb-3 pt-4">
            <span className="text-[14.5px] font-semibold text-ink">Top-Storys</span>
            <span className="text-xs text-ink-muted">
              nach Story Score · {getTimeRangeLabel(period)} · ohne Pop-Science
            </span>
            <InfoBubble id="top10_panel" size="sm" />
            <span className="flex-1" />
            {topPubsTotal > topPubs.length && (
              <span className="font-mono text-xs text-ink-muted">
                {topPubsTotal.toLocaleString('de-AT')} im Pool
              </span>
            )}
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
      {/* Perioden-Chips, x-scroll bis an den Viewport-Rand (main hat px-4) */}
      <nav
        aria-label="Zeitraum"
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max gap-[7px]">
          {DASHBOARD_PERIODS.map((value) => (
            // Native <a> statt Link — wie bei den Desktop-Tabs oben.
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

      {/* Board-Kachel (wie Desktop, Karte trägt Fälliges + „Zum Board") */}
      {boardCards && <BoardTile cards={dueCards} overdueCount={overdueCount} />}

      {/* Social-Trends (Mock Board-Mobile §Dashboard 2026-07-06) */}
      {socialData && <SocialTrendsTile data={socialData} />}

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

      {/* Top-Storys, kompakte Zeilen (Rang · Titel/Meta · Score) */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-2 border-b border-line px-[15px] pb-[11px] pt-3.5">
          <span className="text-sm font-semibold text-ink">Top-Storys</span>
          <span className="flex-1" />
          <span className="font-mono text-2xs text-ink-muted">
            {topPubsTotal.toLocaleString('de-AT')} im Pool
          </span>
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

// ─── Aktions-Kacheln ───────────────────────────────────────────────────────

function BoardTile({ cards, overdueCount }: { cards: BoardCardRef[]; overdueCount: number }) {
  const shown = cards.slice(0, 5);
  return (
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-[11px] border-b border-line bg-[linear-gradient(120deg,#eef4ff,#f8fbff)] px-4 pb-[13px] pt-[15px] dark:bg-none">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand text-white shadow-[0_3px_10px_rgba(0,71,187,.3)]">
          <Kanban className="h-[19px] w-[19px]" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight text-ink">Redaktionsboard</div>
          <div className="mt-px font-mono text-2xs text-[#6f8bbf]">
            Überfällig &amp; demnächst fällig
          </div>
        </div>
        {overdueCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger-tint px-2 py-[3px] font-mono text-2xs font-semibold text-destructive">
            <AlarmClock weight="bold" className="h-3 w-3" />
            {overdueCount} überfällig
          </span>
        )}
      </div>
      <div className="flex-1 px-2 py-1.5">
        {shown.length > 0 ? (
          shown.map((c) => (
            <Link
              key={c.id}
              href={cardDeepLink(c)}
              className="flex items-center gap-[11px] rounded-[10px] px-2 py-[9px] transition-colors hover:bg-canvas"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: c.column_color ?? '#64748b' }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {c.title}
              </span>
              <DueLabel dueAt={c.due_at} />
            </Link>
          ))
        ) : (
          <p className="px-2 py-6 text-center text-xs text-ink-muted">Nichts Fälliges.</p>
        )}
      </div>
      <Link
        href="/board"
        className="flex items-center gap-1.5 border-t border-line px-4 py-3 text-xs font-semibold text-brand transition-colors hover:bg-canvas"
      >
        Zum Board
        <span className="flex-1" />
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function DueLabel({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const overdue = due < new Date();
  return (
    <span
      className={`shrink-0 font-mono text-2xs ${overdue ? 'text-destructive' : 'text-warning'}`}
    >
      {due.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })}
    </span>
  );
}

// ─── Social-Media-Trends (Design Toolkit-Redesign §Dashboard 2026-07-06) ───

function DeltaChip({ pct, small }: { pct: number | null; small?: boolean }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-mono font-semibold ${
        small ? 'px-[7px] py-0.5 text-2xs' : 'px-2 py-[3px] text-2xs'
      } ${up ? 'bg-success-tint text-success' : 'bg-danger-tint text-destructive'}`}
    >
      <Icon weight="bold" className="h-3 w-3" />
      {up ? '+' : ''}
      {pct} %
    </span>
  );
}

function ThemeSparkline({ theme }: { theme: SocialDashboardTheme }) {
  const accent = socialAccent(theme.accent_index);
  const max = Math.max(1, ...theme.spark);
  return (
    <span aria-hidden className="flex h-[22px] shrink-0 items-end gap-0.5">
      {theme.spark.map((v, i) => (
        <span
          key={i}
          className={`block w-1 rounded-[2px] ${accent.dot}`}
          style={{
            height: `${Math.max(2, Math.round((v / max) * 22))}px`,
            opacity: 0.35 + 0.65 * (i / (theme.spark.length - 1)),
          }}
        />
      ))}
    </span>
  );
}

function SocialTrendsTile({ data }: { data: SocialDashboardData }) {
  const topAccent = data.top_post ? socialAccent(data.top_post.accent_index) : null;
  return (
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-[11px] border-b border-line bg-[linear-gradient(120deg,#fbf1ff,#eef4ff_52%,#eafaf4)] px-4 pb-[13px] pt-[15px] dark:bg-none">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7a3ab4,#c13584_52%,#f0842e)] text-white shadow-[0_3px_10px_rgba(193,53,132,.32)]">
          <InstagramLogo weight="fill" className="h-[19px] w-[19px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight text-ink">Social-Media-Trends</div>
          <div className="mt-px font-mono text-2xs text-[#9a7fb5]">
            Instagram · {data.channel_count} Kanäle · {data.window_days} Tage
          </div>
        </div>
        <DeltaChip pct={data.delta_pct} />
        <InfoBubble id="social_momentum" size="sm" />
      </div>

      <div className="flex-1 px-2.5 pb-1 pt-2">
        <div className="px-1.5 pb-[7px] pt-0.5 font-mono text-3xs font-semibold uppercase tracking-wider text-ink-muted">
          Trend-Themen
        </div>
        {/* Alle Themen mit internem Scrollbalken (wie die Kanäle im Board):
            max-Höhe deckelt die Kachel, die Liste scrollt darin. */}
        <div className="max-h-[196px] overflow-y-auto">
        {data.themes.map((t) => {
          const accent = socialAccent(t.accent_index);
          return (
            <Link
              key={t.name}
              // Deep-Link auf das Thema (per Name; /social löst ihn auf den
              // Theme-Index auf und scrollt/fokussiert die Gruppe).
              href={`/social?theme=${encodeURIComponent(t.name)}`}
              className="flex items-center gap-[11px] rounded-[10px] px-1.5 py-2 transition-colors hover:bg-canvas"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${accent.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{t.name}</div>
                <div className="mt-px font-mono text-2xs text-ink-muted">
                  {t.post_count} {t.post_count === 1 ? 'Post' : 'Posts'} · {formatCompact(t.likes)} Likes
                </div>
              </div>
              <ThemeSparkline theme={t} />
              <DeltaChip pct={t.delta_pct} small />
            </Link>
          );
        })}
        </div>
      </div>

      {data.top_post && (
        <div className="mx-2.5 mb-2.5 border-t border-line pt-2">
          <div className="px-1.5 pb-1.5 font-mono text-3xs font-semibold uppercase tracking-wider text-ink-muted">
            Stärkster Post
          </div>
          <Link
            href="/social"
            className="flex items-center gap-[11px] rounded-[10px] px-1.5 py-2 transition-colors hover:bg-canvas"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${topAccent?.avatar ?? 'bg-brand'}`}
            >
              <InstagramLogo weight="fill" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold leading-[1.3] text-ink">
                {data.top_post.topic}
              </div>
              <div className="mt-0.5 font-mono text-2xs text-ink-muted">
                {data.top_post.handle}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#e1306c]">
                <Heart weight="fill" className="h-[13px] w-[13px]" />
                {formatCompact(data.top_post.likes)}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-2xs text-ink-muted">
                <MessageCircle className="h-[11px] w-[11px]" />
                {data.top_post.comments.toLocaleString('de-AT')}
              </span>
            </div>
          </Link>
        </div>
      )}

      <Link
        href="/social"
        className="flex items-center gap-1.5 border-t border-line px-4 py-3 text-xs font-semibold text-brand transition-colors hover:bg-canvas"
      >
        Zum Social-Media-Lagebild
        <span className="flex-1" />
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ─── Stat-Kacheln ──────────────────────────────────────────────────────────

function StatTile({
  icon,
  iconClass = 'bg-brand-50 text-brand',
  value,
  label,
  bubbleId,
}: {
  icon: ReactNode;
  iconClass?: string;
  value: number;
  label: string;
  /** InfoBubble-Ziel im Hilfesystem (lib/client/explanations). */
  bubbleId?: ComponentProps<typeof InfoBubble>['id'];
}) {
  return (
    <div className={`${CARD} flex items-center gap-3.5 px-[18px] py-4`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${iconClass}`}>
        {icon}
      </span>
      <div>
        <div className="font-mono text-[22px] font-semibold leading-none tracking-[-0.01em] text-ink tabular-nums">
          {value.toLocaleString('de-AT')}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
          {label}
          {bubbleId && <InfoBubble id={bubbleId} size="sm" />}
        </div>
      </div>
    </div>
  );
}

// Mobile-Variante (Mock Z. 306–314): Icon oben, Wert darunter, 2-Spalten-Grid.
function MobileStatTile({
  icon,
  iconClass = 'bg-brand-50 text-brand',
  value,
  label,
}: {
  icon: ReactNode;
  iconClass?: string;
  value: number;
  label: string;
}) {
  return (
    <div className={`${CARD} px-3.5 py-[13px]`}>
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[9px] ${iconClass}`}>
        {icon}
      </span>
      <div className="mt-2.5 font-mono text-xl font-semibold leading-[1.1] tracking-[-0.01em] text-ink tabular-nums">
        {value.toLocaleString('de-AT')}
      </div>
      <div className="mt-[3px] text-xs leading-[1.35] text-ink-subtle">{label}</div>
    </div>
  );
}

// ─── Analytics ─────────────────────────────────────────────────────────────

// Literale Klassennamen (Tailwind JIT scannt Quelltext — dynamisch
// zusammengesetzte `bg-chart-bucket-${i}` würden NICHT generiert).
const BUCKET_BG = [
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

function ScoreDistribution({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <div className={`${CARD} px-[18px] py-4`}>
      <div className="mb-3.5 flex items-baseline justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          Score-Verteilung
          <InfoBubble id="score_distribution_chart" size="sm" />
        </span>
        <span className="font-mono text-2xs text-ink-muted">analysierte Pubs</span>
      </div>
      <div className="flex h-[74px] items-end gap-1">
        {buckets.map((v, i) => (
          <span
            key={i}
            title={`${i * 10}–${i * 10 + 10} %: ${v.toLocaleString('de-AT')}`}
            className={`flex-1 rounded-t-[3px] ${BUCKET_BG[i] ?? 'bg-brand'}`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-[7px] flex justify-between font-mono text-2xs text-ink-muted">
        <span>0 %</span>
        <span>Story Score</span>
        <span>100 %</span>
      </div>
    </div>
  );
}

function DimensionMeans({ averages }: { averages: Record<string, number> }) {
  const rows = DIMENSION_DB_KEYS.map((dbKey) => ({
    label: SORT_BY_LABELS[DBKEY_TO_SORT_KEY[dbKey]],
    value: averages[dbKey],
  })).filter((r) => typeof r.value === 'number');
  if (rows.length === 0) return null;
  return (
    <div className={`${CARD} px-[18px] py-4`}>
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        Dimensions-Mittelwerte
        <InfoBubble id="dimensions_profile" size="sm" />
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-ink-soft">{r.label}</span>
              <span className="font-mono text-ink-subtle">{Math.round(r.value * 100)} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-fill">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${Math.round(r.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
