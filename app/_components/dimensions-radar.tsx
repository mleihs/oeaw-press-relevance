'use client';

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { SCORE_LABELS } from '@/lib/constants';

// Extracted from app/page.tsx so the heavy recharts bundle (~100kB gz) loads
// only when the dashboard's averages section is actually present.
export default function DimensionsRadar({ averages }: { averages: Record<string, number> }) {
  const dims = ['public_accessibility', 'societal_relevance', 'novelty_factor', 'storytelling_potential', 'media_timeliness'];
  const data = dims.map(dim => ({
    dimension: SCORE_LABELS[dim],
    value: Math.round((averages[dim] || 0) * 100),
    fullMark: 100,
  }));

  if (data.every(d => d.value === 0)) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data}>
        <PolarGrid stroke="#e5e5e5" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: '#737373' }} />
        <Radar
          dataKey="value"
          stroke="#0047bb"
          fill="#0047bb"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 4, fill: '#0047bb' }}
          animationDuration={800}
        />
        <Tooltip
          formatter={(value) => [`${value}%`, 'Durchschnitt']}
          contentStyle={{ fontSize: 12 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
