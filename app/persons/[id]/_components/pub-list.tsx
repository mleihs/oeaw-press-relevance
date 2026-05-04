'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { InfoBubble } from '@/components/info-bubble';
import { EmptyState } from '@/components/empty-state';
import { displayTitle } from '@/lib/html-utils';
import type { PersonPublicationRow } from '@/lib/researchers';

interface PubListProps {
  publications: PersonPublicationRow[];
}

const BAND_BG = {
  high: 'bg-brand text-white',
  mid:  'bg-amber-100 text-amber-800',
  low:  'bg-neutral-100 text-neutral-500',
};

export function PubList({ publications }: PubListProps) {
  if (!publications || publications.length === 0) {
    return <EmptyState title="Keine bewerteten Publikationen im Zeitraum." />;
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center gap-1 border-b bg-neutral-50/60 px-4 py-2 text-xs font-medium text-neutral-700">
        Publikationen ({publications.length})
        <InfoBubble id="press_score" />
        <InfoBubble id="score_band" />
      </div>
      <ul className="divide-y divide-neutral-100">
        {publications.map((p, i) => (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.025, 0.4) }}
          >
            <Link
              href={`/publications/${p.id}`}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-neutral-50/80"
            >
              <span className={`inline-flex h-9 w-12 items-center justify-center rounded-md text-sm font-medium tabular-nums ${BAND_BG[p.band]}`}>
                {Math.round(p.press_score * 100)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={displayTitle(p.title, p.citation)}>
                  {displayTitle(p.title, p.citation)}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                  <span>{p.published_at}</span>
                  {p.authorship && (
                    <span className="text-neutral-400">{p.authorship}</span>
                  )}
                  {p.mahighlight && (
                    <span className="inline-flex items-center gap-0.5 text-brand">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      Eigen-Highlight
                      <InfoBubble id="mahighlight_self" />
                    </span>
                  )}
                </p>
              </div>
              <span className="text-neutral-300">›</span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
