'use client';

// Redaktionsboard-Kachel des Dashboards (Fälliges + „Zum Board"). Aus
// dashboard-client.tsx extrahiert (Muster: scoring-status-tile.tsx) —
// mechanisch, Verhalten/Markup 1:1.
import Link from 'next/link';
import { AlarmClock, ArrowRight, Kanban } from '@/lib/icons';
import { cardDeepLink, type BoardCardRef } from '@/lib/shared/board';
import { CARD } from './dashboard-card';

export function BoardTile({ cards, overdueCount }: { cards: BoardCardRef[]; overdueCount: number }) {
  const shown = cards.slice(0, 5);
  return (
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-[11px] border-b border-line bg-[linear-gradient(120deg,#fff7ed,#fffdf7_52%,#fef4ee)] px-4 pb-[13px] pt-[15px] dark:bg-none">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#f59e0b,#e8590c)] text-white shadow-[0_3px_10px_rgba(234,88,12,.28)]">
          <Kanban className="h-[19px] w-[19px]" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight text-ink">Redaktionsboard</div>
          <div className="mt-px font-mono text-2xs text-[#b3762b] dark:text-amber-300/80">
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
