'use client';

import Link from 'next/link';
import { PersonAvatar } from '@/app/researchers/_components/person-avatar';
import { InfoBubble } from '@/components/info-bubble';
import type { CoauthorRow } from '@/lib/shared/researchers';

interface CoauthorBlockProps {
  coauthors: CoauthorRow[];
}

export function CoauthorBlock({ coauthors }: CoauthorBlockProps) {
  if (!coauthors || coauthors.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <p className="text-sm font-medium">Co-Autor:innen</p>
        <p className="mt-2 text-xs text-muted-foreground/70">Keine Co-Autor:innen im gewählten Zeitraum.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="flex items-center gap-1 text-sm font-medium">
          Co-Autor:innen
          <InfoBubble id="coauthor_shared" />
        </p>
        <p className="text-xs text-muted-foreground/70">Top {coauthors.length} im Zeitraum</p>
      </div>
      <ul className="space-y-2">
        {coauthors.map((c) => (
          <li key={c.id}>
            <Link
              href={`/persons/${c.id}`}
              className="flex items-center gap-3 rounded-md p-1.5 hover:bg-muted"
            >
              <PersonAvatar firstname={c.firstname} lastname={c.lastname} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {c.firstname} {c.lastname}
                </p>
                {c.oestat3_name_de && (
                  <p className="truncate text-2xs text-muted-foreground/70">{c.oestat3_name_de}</p>
                )}
              </div>
              <span className="text-xs tabular-nums text-muted-foreground/70">{c.shared_pubs}×</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
