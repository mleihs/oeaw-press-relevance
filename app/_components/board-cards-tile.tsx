'use client';

import Link from 'next/link';
import { ArrowRight, Kanban } from '@/lib/icons';
import type { BoardCardRef, BoardDashboardCards } from '@/lib/shared/board';
import { cardDeepLink, cardLocationLabel } from '@/lib/shared/board';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DueBadge } from '@/app/board/_components/due-badge';
import { relativeDay } from '@/app/board/_lib/due';

/** Dashboard-Kachel: fällige/überfällige (offene) + zuletzt angelegte
 *  Board-Karten. Jede Zeile ist ein Deep-Link, der die Karte im Board öffnet. */
export function BoardCardsTile({ cards }: { cards: BoardDashboardCards }) {
  const due = [...cards.overdue, ...cards.due_soon];
  if (due.length === 0 && cards.recent.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Kanban className="h-4 w-4 text-muted-foreground" />
          Redaktionsboard
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/board">
            Zum Board
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Section title="Fällig" rows={due} kind="due" empty="Nichts Fälliges." />
        <Section title="Zuletzt angelegt" rows={cards.recent} kind="recent" empty="Noch keine Karten." />
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  rows,
  kind,
  empty,
}: {
  title: string;
  rows: BoardCardRef[];
  kind: 'due' | 'recent';
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={cardDeepLink(c)}
                className="group flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground group-hover:text-brand">
                    {c.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {cardLocationLabel(c)}
                  </span>
                </span>
                {kind === 'due' ? (
                  <DueBadge dueAt={c.due_at} completedAt={c.completed_at} />
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeDay(c.created_at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
