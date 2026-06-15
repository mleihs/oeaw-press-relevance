'use client';

import type { ReactNode } from 'react';
import { FileText, Radio, Layers, CalendarRange } from 'lucide-react';
import { StatCard } from '@/components/stat-card';

/** Wraps a StatCard so the whole tile acts as a button (KPI-as-navigation).
 *  The InfoBubble inside stops click propagation, so opening the explanation
 *  doesn't trigger navigation (same pattern as the app's clickable Link rows). */
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

      {/* No explId/InfoBubble inside the clickable tiles: a role=button must not
          contain another interactive control. The aria-label names the action. */}
      <ClickableTile label="Zur Kanal-Ansicht" onClick={onKanaele}>
        <StatCard label="Kanäle" value={channels} icon={<Radio className="h-5 w-5" />} />
      </ClickableTile>

      <ClickableTile label="Zur Themen-Ansicht" onClick={onThemen}>
        <StatCard label="Themen" value={themes} icon={<Layers className="h-5 w-5" />} accent="purple" />
      </ClickableTile>

      <StatCard label="Beobachtung" value={windowDays} subtitle="Tage (Standard)" icon={<CalendarRange className="h-5 w-5" />} accent="amber" explId="social_window" />
    </div>
  );
}
