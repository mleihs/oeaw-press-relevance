'use client';

// Analytik-Kacheln des Dashboards: Score-Verteilung + Dimensions-Mittelwerte.
// Aus dashboard-client.tsx extrahiert (Muster: scoring-status-tile.tsx) —
// mechanisch, Verhalten/Markup 1:1.
import { InfoBubble } from '@/components/info-bubble';
import {
  DBKEY_TO_SORT_KEY,
  DIMENSION_DB_KEYS,
  SORT_BY_LABELS,
} from '@/lib/shared/dashboard';
import { CARD } from './dashboard-card';

// Literale Klassennamen (Tailwind JIT scannt Quelltext — dynamisch
// zusammengesetzte `bg-chart-bucket-${i}` würden NICHT generiert).
const BUCKET_BG = [
  'bg-chart-bucket-1',
  'bg-chart-bucket-2',
  'bg-chart-bucket-3',
  'bg-chart-bucket-4',
  'bg-chart-bucket-5',
  'bg-chart-bucket-6',
  'bg-chart-bucket-7',
  'bg-chart-bucket-8',
  'bg-chart-bucket-9',
  'bg-chart-bucket-10',
];

export function ScoreDistribution({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <div className={`${CARD} px-[18px] py-4`}>
      <div className="mb-3.5 flex items-baseline justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          Score-Verteilung
          <InfoBubble id="score_distribution_chart" size="sm" />
        </span>
        <span className="font-mono text-2xs text-ink-muted">analysierte Pubs</span>
      </div>
      <div className="flex h-[74px] items-end gap-1">
        {buckets.map((v, i) => (
          <span
            key={i}
            title={`${i * 10}–${i * 10 + 10} %: ${v.toLocaleString('de-AT')}`}
            className={`flex-1 rounded-t-[3px] ${BUCKET_BG[i] ?? 'bg-brand'}`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-[7px] flex justify-between font-mono text-2xs text-ink-muted">
        <span>0 %</span>
        <span>Story Score</span>
        <span>100 %</span>
      </div>
    </div>
  );
}

export function DimensionMeans({ averages }: { averages: Record<string, number> }) {
  const rows = DIMENSION_DB_KEYS.map((dbKey) => ({
    label: SORT_BY_LABELS[DBKEY_TO_SORT_KEY[dbKey]],
    value: averages[dbKey],
  })).filter((r) => typeof r.value === 'number');
  if (rows.length === 0) return null;
  return (
    <div className={`${CARD} px-[18px] py-4`}>
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        Dimensions-Mittelwerte
        <InfoBubble id="dimensions_profile" size="sm" />
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-ink-soft">{r.label}</span>
              <span className="font-mono text-ink-subtle">{Math.round(r.value * 100)} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-fill">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${Math.round(r.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
