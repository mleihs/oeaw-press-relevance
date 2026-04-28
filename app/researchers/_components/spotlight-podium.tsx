'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { AnimateNumber } from 'motion-number';
import { Crown, Award, Medal, Sparkles } from 'lucide-react';
import {
  METRIC_SHORT_LABELS,
  type LeaderboardMetric,
  type TopResearcherRow,
} from '@/lib/researchers';
import { PersonAvatar } from './person-avatar';
import { Sparkline } from './sparkline';
import { InfoBubble } from '@/components/info-bubble';
import { displayTitle } from '@/lib/html-utils';

interface SpotlightPodiumProps {
  rows: TopResearcherRow[];
  metric: LeaderboardMetric;
}

const RANK_META = [
  { color: '#d4af37', label: '1. Platz', Icon: Crown },
  { color: '#9a9aa0', label: '2. Platz', Icon: Award },
  { color: '#cd7f32', label: '3. Platz', Icon: Medal },
];

function metricNumber(row: TopResearcherRow, metric: LeaderboardMetric): number {
  switch (metric) {
    case 'count_high':    return row.count_high;
    case 'sum_score':     return Number(row.sum_score.toFixed(2));
    case 'avg_score':     return Math.round(row.avg_score * 100);
    case 'weighted_avg':  return Math.round(row.weighted_avg * 100);
    case 'pubs_total':    return row.pubs_total;
  }
}

function metricSuffix(metric: LeaderboardMetric): string {
  return metric === 'avg_score' || metric === 'weighted_avg' ? ' %' : '';
}

export function SpotlightPodium({ rows, metric }: SpotlightPodiumProps) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <section
      aria-label="Spotlight: Top 3"
      className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-white via-white to-[#0047bb]/[0.03] p-6"
    >
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#0047bb]">
            <Sparkles className="mr-1 inline h-3 w-3 -translate-y-px" />
            Im Spotlight
          </p>
          <h2 className="mt-1 flex items-center gap-1.5 text-lg font-medium">
            Top 3 nach {METRIC_SHORT_LABELS[metric]}
            <InfoBubble id={metric} size="md" />
          </h2>
        </div>
        <p className="flex items-center gap-1 text-xs text-neutral-400">
          algorithmische Auswahl
          <InfoBubble id="rank" />
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {top3.map((row, i) => {
          const meta = RANK_META[i];
          const Icon = meta.Icon;
          return (
            <motion.div
              key={row.person_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={`/persons/${row.person_id}`}
                className="block rounded-lg border bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderTopColor: meta.color, borderTopWidth: 2 }}
              >
                <div className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    {meta.label}
                  </span>
                  {row.member_type_de && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-[#0047bb]/10 px-1.5 py-0.5 text-[#0047bb]">
                      ÖAW-Mitglied
                      <InfoBubble id="member_oeaw" />
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <PersonAvatar firstname={row.firstname} lastname={row.lastname} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium leading-tight">
                      {row.firstname} {row.lastname}
                    </p>
                    {row.oestat3_name_de && (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {row.oestat3_name_de}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400">
                      {METRIC_SHORT_LABELS[metric]}
                      <InfoBubble id={metric} />
                    </p>
                    <div className="mt-0.5 flex items-baseline gap-0.5 text-3xl font-light tabular-nums text-neutral-900">
                      <AnimateNumber
                        format={{ maximumFractionDigits: metric === 'sum_score' ? 2 : 0 }}
                        locales="de-AT"
                      >
                        {metricNumber(row, metric)}
                      </AnimateNumber>
                      <span className="text-base text-neutral-400">{metricSuffix(metric)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end text-[#0047bb] opacity-70">
                    <Sparkline data={row.sparkline ?? []} width={80} height={26} stroke="currentColor" />
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-neutral-400 opacity-60">
                      12 M
                      <InfoBubble id="sparkline" />
                    </span>
                  </div>
                </div>

                {row.top_pub && (
                  <div className="mt-4 border-t pt-3">
                    <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400">
                      Stärkste Publikation im Zeitraum
                      <InfoBubble
                        content={{
                          title: 'Stärkste Pub',
                          body: (
                            <p className="leading-relaxed">
                              Die Pub mit dem höchsten StoryScore aus dem aktuellen
                              Filter-Scope dieser Person. Klick auf die Karte führt zur
                              Detail-Seite.
                            </p>
                          ),
                        }}
                      />
                    </p>
                    <p
                      className="line-clamp-2 text-sm leading-snug"
                      style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
                    >
                      {displayTitle(row.top_pub.title, row.top_pub.citation)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                      Score: {(row.top_pub.press_score * 100).toFixed(0)} %
                      <InfoBubble id="press_score" />
                    </p>
                  </div>
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
