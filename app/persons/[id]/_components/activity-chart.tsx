'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { InfoBubble } from '@/components/info-bubble';
import { BRAND_HEX } from '@/lib/constants';
import type { ActivityMonth } from '@/lib/researchers';

interface ActivityChartProps {
  data: ActivityMonth[];
}

const BAND_COLORS = {
  high: BRAND_HEX,
  mid:  '#fbbf24',
  low:  '#cbd5e1',
};

export function ActivityChart({ data }: ActivityChartProps) {
  const total = data.reduce((s, d) => s + d.high + d.mid + d.low, 0);
  if (total === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center text-sm text-neutral-400">
        Keine Aktivität im gewählten Zeitraum.
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="flex items-center gap-1 text-sm font-medium">
            Aktivität pro Monat
            <InfoBubble id="activity_chart" />
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Bewertete Publikationen, gestapelt nach Press-Score-Band.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-neutral-500">
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
              tick={{ fontSize: 10, fill: '#a1a1a1' }}
              tickFormatter={(m: string) => m.slice(5)}
              axisLine={{ stroke: '#e5e5e5' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#a1a1a1' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,71,187,0.04)' }}
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: '1px solid #e5e5e5',
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
