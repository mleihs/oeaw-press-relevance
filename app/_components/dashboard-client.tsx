'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Kanban,
  Newspaper,
  Pin,
  TrendingUp,
} from '@/lib/icons';
import { PressScoreBadge } from '@/components/score-bar';
import { InfoBubble } from '@/components/info-bubble';
import { CapybaraEmpty } from '@/components/capybara-logo';
import { VenueLine } from '@/components/venue-line';
import { FlagshipBadge } from '@/components/flagship-badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { displayAuthor, displayInstitute, displayTitle } from '@/lib/shared/publication-display';
import { formatPubDate, pubDateTitle } from '@/lib/shared/format-pub-date';
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
  if (!hydrated) return { line: `Willkommen zurück${who}`, date: null as string | null };
  const now = new Date();
  return {
    line: `${greetingFor(now.getHours())}${who}`,
    date: now.toLocaleDateString('de-AT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}

interface DashboardClientProps {
  data: DashboardData;
  period: DashboardPeriod;
  sortBy: SortBy;
  /** Board-Karten-Kachel (null wenn nicht angemeldet — Board ist auth-gated). */
  boardCards: BoardDashboardCards | null;
}

export function DashboardClient({ data, period, sortBy, boardCards }: DashboardClientProps) {
  const {
    stats,
    topPubs,
    topPubsTotal,
    topPubsLimit,
    flaggedCount,
    pressReleasedCount,
    orphansCount,
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

  if (stats.total === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: Gruß + Perioden-Tabs */}
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting.line}</h1>
          <p className="mt-1.5 text-sm text-ink-subtle">{subParts.join(' · ')}</p>
        </div>
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

      {/* Row 1 — actionable tiles */}
      <div
        className={`grid gap-4 ${boardCards ? 'md:grid-cols-[1.25fr_1fr_1fr]' : 'md:grid-cols-2'}`}
      >
        {boardCards && (
          <BoardTile cards={dueCards} overdueCount={overdueCount} />
        )}

        <ActionTile
          icon={<ClipboardCheck className="h-[17px] w-[17px]" />}
          iconClass="bg-warning-tint text-warning"
          title="Triage"
          value={flaggedCount}
          unit="geflaggte Publikationen"
          note="Zum Pitchen markiert, in der Sichtung zu entscheiden"
          button={{
            href: '/review',
            label: 'Zur Triage-Sitzung',
            icon: <Pin weight="fill" className="h-3.5 w-3.5" />,
            class:
              'border border-[#f0d9ad] bg-warning-tint text-warning-ink hover:brightness-[0.98]',
          }}
        />

        <ActionTile
          icon={<Newspaper className="h-[17px] w-[17px]" />}
          iconClass="bg-success-tint text-success"
          title="Pressemitteilungen"
          value={pressReleasedCount}
          unit="mit ÖAW-Pressemitteilung"
          note={orphansCount > 0 ? `${orphansCount} Orphans ohne DOI-Match` : 'alle DOI-gematcht'}
          button={{
            href: '/press-releases',
            label: 'PMs ansehen',
            icon: <Newspaper className="h-3.5 w-3.5" />,
            class:
              'border border-[#b8e2cc] bg-success-tint text-success hover:brightness-[0.98]',
          }}
        />
      </div>

      {/* Row 2 — stat tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          icon={<BookOpen className="h-[21px] w-[21px]" />}
          value={stats.total}
          label={
            stats.peer_reviewed && stats.total
              ? `Publikationen · ${Math.round((stats.peer_reviewed / stats.total) * 100)} % peer-reviewed`
              : 'Publikationen'
          }
        />
        <StatTile
          icon={<BarChart3 className="h-[21px] w-[21px]" />}
          value={stats.analyzed}
          label={
            stats.total
              ? `analysiert · ${Math.round((stats.analyzed / stats.total) * 100)} % des Bestands`
              : 'analysiert'
          }
        />
        <StatTile
          icon={<TrendingUp className="h-[21px] w-[21px]" />}
          iconClass="bg-success-tint text-success"
          value={stats.high_score_count}
          label={
            stats.avg_score !== null
              ? `hohes Story-Potenzial · Ø ${Math.round(stats.avg_score * 100)} %`
              : 'hohes Story-Potenzial'
          }
        />
      </div>

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
              <span className="font-mono text-[11.5px] text-ink-muted">
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
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold leading-[1.35] text-ink group-hover:text-brand">
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
                            className="font-mono text-[10.5px] text-ink-muted"
                            title={pubDateTitle(pub.published_at)}
                          >
                            {formatPubDate(pub.published_at)}
                          </span>
                        )}
                      </div>
                      <VenueLine journal={pub.enriched_journal} />
                      {pub.pitch_suggestion && (
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-ink-soft">
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
              <p className="px-2.5 py-8 text-center text-[13.5px] text-ink-subtle">
                Keine analysierten Publikationen in diesem Zeitraum.
              </p>
            )}
          </div>
          <Link
            href="/publications"
            className="flex items-center gap-1.5 border-t border-line px-[18px] py-3 text-[12.5px] font-semibold text-brand transition-colors hover:bg-canvas"
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
              <div className="mb-3 text-[13.5px] font-semibold text-ink">Häufige Keywords</div>
              <KeywordCloud keywords={stats.top_keywords} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Aktions-Kacheln ───────────────────────────────────────────────────────

function BoardTile({ cards, overdueCount }: { cards: BoardCardRef[]; overdueCount: number }) {
  const shown = cards.slice(0, 4);
  return (
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-brand-50 text-brand">
          <Kanban className="h-[17px] w-[17px]" weight="duotone" />
        </span>
        <div className="flex-1 text-sm font-semibold text-ink">Redaktionsboard</div>
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeaea] px-2 py-[3px] font-mono text-[11px] font-medium text-destructive">
            {overdueCount} überfällig
          </span>
        )}
      </div>
      <div className="flex-1 px-2">
        {shown.length > 0 ? (
          shown.map((c) => (
            <Link
              key={c.id}
              href={cardDeepLink(c)}
              className="flex items-center gap-2.5 rounded-[9px] px-2 py-2 transition-colors hover:bg-canvas"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: c.due_at && new Date(c.due_at) < new Date() ? '#dc2626' : '#d97706' }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {c.title}
              </span>
              <DueLabel dueAt={c.due_at} />
            </Link>
          ))
        ) : (
          <p className="px-2 py-6 text-center text-[12.5px] text-ink-muted">Nichts Fälliges.</p>
        )}
      </div>
      <Link
        href="/board"
        className="flex items-center gap-1.5 border-t border-line px-4 py-[11px] text-[12.5px] font-semibold text-brand transition-colors hover:bg-canvas"
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
      className={`shrink-0 font-mono text-[11px] ${overdue ? 'text-destructive' : 'text-warning'}`}
    >
      {due.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })}
    </span>
  );
}

interface ActionTileButton {
  href: string;
  label: string;
  icon: ReactNode;
  class: string;
}

function ActionTile({
  icon,
  iconClass,
  title,
  value,
  unit,
  note,
  button,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  value: number;
  unit: string;
  note: string;
  button: ActionTileButton;
}) {
  return (
    <div className={`${CARD} flex flex-col p-4`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </span>
        <div className="text-sm font-semibold text-ink">{title}</div>
      </div>
      <div className="mt-3.5 flex items-baseline gap-2">
        <span className="font-mono text-[30px] font-semibold tracking-[-0.02em] text-ink tabular-nums">
          {value.toLocaleString('de-AT')}
        </span>
        <span className="text-[13px] text-ink-subtle">{unit}</span>
      </div>
      <div className="mt-1 text-[12.5px] text-ink-subtle">{note}</div>
      <span className="flex-1" />
      <Link
        href={button.href}
        className={`mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-[9px] px-3 py-2.5 text-[12.5px] font-semibold transition ${button.class}`}
      >
        {button.icon}
        {button.label}
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
}: {
  icon: ReactNode;
  iconClass?: string;
  value: number;
  label: string;
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
        <div className="mt-1 text-xs text-ink-subtle">{label}</div>
      </div>
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
        <span className="text-[13.5px] font-semibold text-ink">Score-Verteilung</span>
        <span className="font-mono text-[11px] text-ink-muted">analysierte Pubs</span>
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
      <div className="mt-[7px] flex justify-between font-mono text-[10.5px] text-ink-muted">
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
      <div className="mb-3 text-[13.5px] font-semibold text-ink">Dimensions-Mittelwerte</div>
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
