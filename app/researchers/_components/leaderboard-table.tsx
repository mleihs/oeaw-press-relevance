'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useQueryStates } from 'nuqs';
import { filterParsers } from '../_filters';
import {
  METRIC_SHORT_LABELS,
  type LeaderboardMetric,
  type TopResearcherRow,
} from '@/lib/researchers';
import { PersonAvatar } from './person-avatar';
import { Sparkline } from './sparkline';
import { TrendDelta } from './trend-delta';
import { InfoBubble } from '@/components/info-bubble';
import { LoadingState } from '@/components/loading-state';
import { displayTitle } from '@/lib/html-utils';
import { Crown, Award, Medal, BookOpen } from 'lucide-react';

interface LeaderboardTableProps {
  rows: TopResearcherRow[];
  loading: boolean;
}

function metricValue(row: TopResearcherRow, metric: LeaderboardMetric): string {
  switch (metric) {
    case 'count_high':    return String(row.count_high);
    case 'sum_score':     return row.sum_score.toFixed(2);
    case 'avg_score':     return (row.avg_score * 100).toFixed(0) + ' %';
    case 'weighted_avg':  return (row.weighted_avg * 100).toFixed(0) + ' %';
    case 'pubs_total':    return String(row.pubs_total);
  }
}

function metricBarValue(row: TopResearcherRow, metric: LeaderboardMetric, max: number): number {
  switch (metric) {
    case 'count_high':    return row.count_high / Math.max(1, max);
    case 'sum_score':     return row.sum_score / Math.max(1, max);
    case 'avg_score':     return row.avg_score;     // 0..1 already
    case 'weighted_avg':  return row.weighted_avg;  // 0..1 already
    case 'pubs_total':    return row.pubs_total / Math.max(1, max);
  }
}

function rankAccent(rank: number): string {
  if (rank === 1) return 'border-l-[#d4af37]';   // gold
  if (rank === 2) return 'border-l-[#a7a7ad]';   // silver
  if (rank === 3) return 'border-l-[#cd7f32]';   // bronze
  return 'border-l-transparent';
}

function rankIcon(rank: number) {
  const cls = 'h-3.5 w-3.5';
  if (rank === 1) return <Crown className={`${cls} text-[#d4af37]`} />;
  if (rank === 2) return <Award className={`${cls} text-[#9a9aa0]`} />;
  if (rank === 3) return <Medal className={`${cls} text-[#cd7f32]`} />;
  return null;
}

export function LeaderboardTable({ rows, loading }: LeaderboardTableProps) {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const metric = filters.metric;

  const max =
    metric === 'count_high' ? Math.max(1, ...rows.map((r) => r.count_high))
    : metric === 'sum_score' ? Math.max(1, ...rows.map((r) => r.sum_score))
    : metric === 'pubs_total' ? Math.max(1, ...rows.map((r) => r.pubs_total))
    : 1;  // avg_score & weighted_avg are already 0..1

  if (loading && rows.length === 0) {
    return <LoadingState variant="text" label="Lade Rangliste …" />;
  }
  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-sm font-medium">Keine Forschenden mit den aktuellen Filtern</p>
        <p className="mt-1 text-xs text-neutral-500">
          Filter lockern, Zeitraum erweitern oder Co-Autor:innen einbeziehen.
        </p>
      </div>
    );
  }

  return (
    <div
      role="table"
      aria-label="Forscher:innen-Rangliste"
      className="overflow-hidden rounded-lg border bg-white"
    >
      <div role="rowgroup">
        <div
          role="row"
          className="grid grid-cols-[44px_1fr_180px_200px_72px_80px_28px] items-center gap-x-3 border-b bg-neutral-50/60 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500"
        >
          <div role="columnheader" className="inline-flex items-center gap-1">Rang <InfoBubble id="rank" /></div>
          <div role="columnheader">Forscher:in</div>
          <div role="columnheader" className="inline-flex items-center gap-1">Sektion <InfoBubble id="oestat3" /></div>
          <div role="columnheader" className="inline-flex items-center gap-1">{METRIC_SHORT_LABELS[metric]} <InfoBubble id={metric} /></div>
          <div role="columnheader" className="flex items-center justify-end gap-1 text-right">Pubs (Σ) <InfoBubble id="pubs_total" /></div>
          <div role="columnheader" className="flex items-center justify-end gap-1 text-right">12 M <InfoBubble id="sparkline" /></div>
          <div role="columnheader" aria-hidden="true" />
        </div>
      </div>

      <ul role="rowgroup" className="divide-y divide-neutral-100">
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <motion.li
              key={row.person_id}
              role="row"
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.6 }}
              className={`group border-l-2 ${rankAccent(row.rank_now)} hover:bg-neutral-50/80`}
            >
              <Link
                href={`/persons/${row.person_id}`}
                aria-label={`Rang ${row.rank_now}: ${row.firstname} ${row.lastname}, ${METRIC_SHORT_LABELS[metric]}: ${metricValue(row, metric)}`}
                className="grid grid-cols-[44px_1fr_180px_200px_72px_80px_28px] items-center gap-x-3 px-4 py-3"
              >
                <div role="cell" className="flex items-center gap-1 text-sm font-medium tabular-nums text-neutral-700">
                  <span className="w-5 text-right">{row.rank_now}</span>
                  {rankIcon(row.rank_now)}
                </div>

                <div role="cell" className="flex min-w-0 items-center gap-3">
                  <PersonAvatar
                    firstname={row.firstname}
                    lastname={row.lastname}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-neutral-900">
                        {row.firstname} {row.lastname}
                      </span>
                      {row.member_type_de && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-sm bg-[#0047bb]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#0047bb]"
                          title={row.member_type_de}
                        >
                          ÖAW-Mitglied
                          <InfoBubble id="member_oeaw" />
                        </span>
                      )}
                      {row.external && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-neutral-400">
                          extern
                          <InfoBubble id="external_person" />
                        </span>
                      )}
                    </div>
                    {row.top_pub && (
                      <div
                        className="truncate text-xs text-neutral-500"
                        title={displayTitle(row.top_pub.title, row.top_pub.citation)}
                      >
                        <BookOpen className="mr-1 inline h-2.5 w-2.5 -translate-y-px" />
                        {displayTitle(row.top_pub.title, row.top_pub.citation)}
                      </div>
                    )}
                  </div>
                </div>

                <div role="cell" className="truncate text-xs text-neutral-500">
                  {row.oestat3_name_de || <span className="text-neutral-300">—</span>}
                </div>

                <div role="cell" className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <motion.div
                      className="h-full bg-[#0047bb]"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, metricBarValue(row, metric, max) * 100)}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-medium tabular-nums text-neutral-800">
                    {metricValue(row, metric)}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <TrendDelta delta={row.delta_count_high} isNewcomer={row.is_newcomer} />
                    <InfoBubble id="delta_count_high" />
                  </span>
                </div>

                <div role="cell" className="text-right text-xs tabular-nums text-neutral-500">
                  {row.pubs_total}
                </div>

                <div role="cell" className="flex justify-end text-[#0047bb]">
                  <Sparkline data={row.sparkline ?? []} width={70} height={20} stroke="currentColor" />
                </div>

                <div role="cell" aria-hidden="true" className="text-neutral-300 transition-colors group-hover:text-neutral-600">›</div>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
