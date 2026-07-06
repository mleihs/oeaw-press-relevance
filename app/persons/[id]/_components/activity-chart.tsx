'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { InfoBubble } from '@/components/info-bubble';
import { EmptyState } from '@/components/empty-state';
import { BRAND_HEX } from '@/lib/shared/constants';
import type { ActivityMonth } from '@/lib/shared/researchers';

interface ActivityChartProps {
  data: ActivityMonth[];
}

const BAND_COLORS = {
  high: BRAND_HEX,
  mid:  '#fbbf24',
  low:  '#cbd5e1',
};

export function ActivityChart({ data }: ActivityChartProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // next-themes is client-only: `resolvedTheme` is undefined on the server and
  // during hydration. A one-shot post-hydration `mounted` flag is the canonical
  // next-themes SSR guard — it flips exactly once, so there is no cascading
  // render the lint rule guards against.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';
  const tickColor = isDark ? '#737373' : '#a1a1a1';
  const axisLineColor = isDark ? '#404040' : '#e5e5e5';
  const cursorFill = isDark ? 'rgba(120,150,220,0.08)' : 'rgba(0,71,187,0.04)';

  const total = data.reduce((s, d) => s + d.high + d.mid + d.low, 0);
  if (total === 0) {
    return <EmptyState title="Keine Aktivität im gewählten Zeitraum." />;
  }
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="flex items-center gap-1 text-sm font-medium">
            Aktivität pro Monat
            <InfoBubble id="activity_chart" />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Bewertete Publikationen, gestapelt nach Press-Score-Band.
          </p>
        </div>
        <div className="flex items-center gap-3 text-2xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: BAND_COLORS.high }} />
            ≥ 70 %
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: BAND_COLORS.mid }} />
            40–69 %
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: BAND_COLORS.low }} />
            &lt; 40 %
          </span>
          <InfoBubble id="score_band" />
        </div>
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <XAxis
              dataKey="m"
              tick={{ fontSize: 10, fill: tickColor }}
              tickFormatter={(m: string) => m.slice(5)}
              axisLine={{ stroke: axisLineColor }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: tickColor }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: cursorFill }}
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: `1px solid ${axisLineColor}`,
                background: isDark ? '#1a1a1a' : '#fff',
                color: isDark ? '#e5e5e5' : '#171717',
                padding: '6px 10px',
              }}
              labelFormatter={(m) => String(m ?? '')}
            />
            <Bar dataKey="low" stackId="a" fill={BAND_COLORS.low} />
            <Bar dataKey="mid" stackId="a" fill={BAND_COLORS.mid} />
            <Bar dataKey="high" stackId="a" fill={BAND_COLORS.high} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
