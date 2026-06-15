'use client';

import type { ReactNode } from 'react';
import { FileText, Radio, Layers, CalendarRange } from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { InfoBubble } from '@/components/info-bubble';
import type { EXPL } from '@/lib/client/explanations';

/** Wraps a StatCard so the whole tile acts as a button (KPI-as-navigation).
 *  The explanation bubble is rendered as a SIBLING in the corner — outside the
 *  role=button — so the tile stays a single valid control (no interactive
 *  nesting) while still carrying its info + Hilfe-Center deep-link. The bubble
 *  stops click propagation itself, so opening it never triggers navigation. */
function ClickableTile({
  label,
  onClick,
  explId,
  children,
}: {
  label: string;
  onClick: () => void;
  explId?: keyof typeof EXPL;
  children: ReactNode;
}) {
  return (
    <div className="relative rounded-xl">
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
      {explId && (
        <span className="absolute bottom-1.5 right-2 z-10">
          <InfoBubble id={explId} side="top" />
        </span>
      )}
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

      {/* explId on ClickableTile renders the bubble as a corner SIBLING (outside
          the role=button), so the tile stays one valid control while keeping its
          explanation + Hilfe-Center link. aria-label names the navigation. */}
      <ClickableTile label="Zur Kanal-Ansicht" onClick={onKanaele} explId="social_kpi_channels">
        <StatCard label="Kanäle" value={channels} icon={<Radio className="h-5 w-5" />} />
      </ClickableTile>

      <ClickableTile label="Zur Themen-Ansicht" onClick={onThemen} explId="social_kpi_themes">
        <StatCard label="Themen" value={themes} icon={<Layers className="h-5 w-5" />} accent="purple" />
      </ClickableTile>

      <StatCard label="Beobachtung" value={windowDays} subtitle="Tage (Standard)" icon={<CalendarRange className="h-5 w-5" />} accent="amber" explId="social_window" />
    </div>
  );
}
