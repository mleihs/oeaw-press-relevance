'use client';

import type { ReactNode } from 'react';
import { FileText, Radio, Layers, CalendarRange } from '@/lib/icons';
import { StatCard } from '@/components/stat-card';

/** Wraps a StatCard so the whole tile acts as a button (KPI-as-navigation).
 *  The StatCard renders its explanation bubble inline next to the label (via
 *  explId). InfoBubble stops click propagation, so tapping it never triggers
 *  navigation — the same reason it is safe inside <Link> rows elsewhere — and
 *  the keydown guard ignores keys bubbling up from the bubble so Enter/Space on
 *  it doesn't navigate either. */
function ClickableTile({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // nested InfoBubble owns its keys
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </div>
  );
}

/** KPI strip — the at-a-glance overview. „Themen" and „Kanäle" are entry points
 *  into the matching lens below. */
export function StatStrip({
  posts,
  channels,
  themes,
  windowDays,
  onThemen,
  onKanaele,
}: {
  posts: number;
  channels: number;
  themes: number;
  windowDays: number;
  onThemen: () => void;
  onKanaele: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Posts im Fenster" value={posts} icon={<FileText className="h-5 w-5" />} accent="brand" explId="social_kpi_posts" />

      {/* StatCard renders its own bubble inline next to the label (explId); the
          tile itself is the navigation, named by aria-label. */}
      <ClickableTile label="Zur Kanal-Ansicht" onClick={onKanaele}>
        <StatCard label="Kanäle" value={channels} icon={<Radio className="h-5 w-5" />} explId="social_kpi_channels" />
      </ClickableTile>

      <ClickableTile label="Zur Themen-Ansicht" onClick={onThemen}>
        <StatCard label="Themen" value={themes} icon={<Layers className="h-5 w-5" />} accent="purple" explId="social_kpi_themes" />
      </ClickableTile>

      <StatCard label="Beobachtung" value={windowDays} subtitle="Tage (Standard)" icon={<CalendarRange className="h-5 w-5" />} accent="amber" explId="social_window" />
    </div>
  );
}
