'use client';

import { ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { AnimateNumber } from 'motion-number';
import { PersonAvatar } from '@/app/researchers/_components/person-avatar';
import { TrendDelta } from '@/app/researchers/_components/trend-delta';
import { InfoBubble } from '@/components/info-bubble';
import type { EXPL } from '@/lib/explanations';
import type { ResearcherDetailPerson, ResearcherDetailStats } from '@/lib/researchers';

interface PersonHeaderProps {
  person: ResearcherDetailPerson;
  stats: ResearcherDetailStats;
  windowLabel: string;
}

export function PersonHeader({ person, stats, windowLabel }: PersonHeaderProps) {
  const fullname = `${person.firstname} ${person.lastname}`;
  const deltaHigh = stats.count_high - stats.prev_count_high;
  const deltaTotal = stats.pubs_total - stats.prev_pubs_total;

  return (
    <header className="rounded-xl border bg-gradient-to-br from-white to-[#0047bb]/[0.03] p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <PersonAvatar
          firstname={person.firstname}
          lastname={person.lastname}
          portrait={person.portrait}
          size="xl"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-light tracking-tight">{fullname}</h1>
              {person.oestat3_name_de && (
                <p className="mt-1 inline-flex items-center gap-1 text-sm text-neutral-500">
                  {person.oestat3_name_de}
                  <InfoBubble id="oestat3" />
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {person.member_type_de && (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-[#0047bb]/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[#0047bb]"
                  title={person.member_type_de}
                >
                  ÖAW-Mitglied
                  <InfoBubble id="member_oeaw" />
                </span>
              )}
              {person.external && (
                <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  Extern
                  <InfoBubble id="external_person" />
                </span>
              )}
              {person.deceased && (
                <span className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  Verstorben
                </span>
              )}
            </div>
          </div>

          {person.research_fields && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
              {person.research_fields}
            </p>
          )}

          {person.orcid && (
            <a
              href={`https://orcid.org/${person.orcid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-[#0047bb]"
            >
              ORCID: {person.orcid}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Hochbewertet"
          subline={`(≥ 70 % im ${windowLabel})`}
          value={stats.count_high}
          delta={deltaHigh}
          deltaExplId="delta_count_high"
          explId="count_high"
          color="#0047bb"
        />
        <StatCard
          label="Σ Press-Score"
          subline={windowLabel}
          value={Number(stats.sum_score.toFixed(2))}
          delta={null}
          fractionDigits={2}
          explId="sum_score"
        />
        <StatCard
          label="Ø Press-Score"
          subline="roh, alle bewerteten Pubs"
          value={stats.avg_score == null ? 0 : Math.round(stats.avg_score * 100)}
          delta={null}
          suffix="%"
          explId="avg_score"
        />
        <StatCard
          label="Pubs gesamt"
          subline={windowLabel}
          value={stats.pubs_total}
          delta={deltaTotal}
          explId="pubs_total"
        />
      </div>
    </header>
  );
}

function StatCard({
  label,
  subline,
  value,
  delta,
  color = '#171717',
  suffix = '',
  fractionDigits = 0,
  explId,
  deltaExplId,
}: {
  label: string;
  subline?: string;
  value: number;
  delta: number | null;
  color?: string;
  suffix?: string;
  fractionDigits?: number;
  explId?: keyof typeof EXPL;
  deltaExplId?: keyof typeof EXPL;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-lg border bg-white p-4"
    >
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
        {explId && <InfoBubble id={explId} />}
      </p>
      {subline && <p className="text-[10px] text-neutral-400">{subline}</p>}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-light tabular-nums" style={{ color }}>
          <AnimateNumber format={{ maximumFractionDigits: fractionDigits }} locales="de-AT">
            {value}
          </AnimateNumber>
          {suffix && <span className="text-base text-neutral-400"> {suffix}</span>}
        </span>
        {delta != null && delta !== 0 && (
          <span className="inline-flex items-center gap-0.5">
            <TrendDelta delta={delta} />
            {deltaExplId && <InfoBubble id={deltaExplId} />}
          </span>
        )}
      </div>
    </motion.div>
  );
}
