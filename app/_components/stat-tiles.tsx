'use client';

// Stat-Kacheln des Dashboards (Desktop + Mobile-Variante). Aus
// dashboard-client.tsx extrahiert (Muster: scoring-status-tile.tsx) —
// mechanisch, Verhalten/Markup 1:1.
import type { ComponentProps, ReactNode } from 'react';
import { InfoBubble } from '@/components/info-bubble';
import { CARD } from './dashboard-card';

export function StatTile({
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
export function MobileStatTile({
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
