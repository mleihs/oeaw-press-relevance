'use client';

import { useMemo, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { SCORE_LABELS, BRAND_HEX } from '@/lib/shared/constants';
import {
  DBKEY_TO_SORT_KEY,
  DIMENSION_DB_KEYS,
  type DimensionDbKey,
  type SortBy,
} from '@/lib/shared/dashboard';

// Extracted from app/page.tsx so the heavy recharts bundle (~100kB gz) loads
// only when the dashboard's averages section is actually present.
// The radar carries the corpus's per-dimension average AND a click target on
// each axis label — the parent translates the click to a URL sortBy change
// and re-renders the Top-Pubs panel with that dimension as the order key.

// Module-level lookup: SVG axis-label string → DB-column name. Built once
// from compile-time constants, so it never has to be re-derived per render.
const LABEL_TO_DBKEY: Record<string, DimensionDbKey> = DIMENSION_DB_KEYS.reduce(
  (acc, k) => {
    acc[SCORE_LABELS[k]] = k;
    return acc;
  },
  {} as Record<string, DimensionDbKey>,
);

// CSS drop-shadow string used to glow the active/hovered axis label. Built
// from BRAND_HEX so the colour stays consistent if the brand token changes.
// drop-shadow gives a real halo around the text path (unlike a feFlood-based
// SVG filter which fills the dense text bbox like a rectangle).
const GLOW_FILTER = `drop-shadow(0 0 3px ${BRAND_HEX}) drop-shadow(0 0 6px ${BRAND_HEX}66)`;

interface DimensionsRadarProps {
  averages: Record<string, number>;
  /** Current sort key from the URL — used to highlight the active axis. */
  activeSortBy?: SortBy;
  /** Fired with the DB column name of the clicked axis (e.g. `novelty_factor`). */
  onAxisClick?: (dbKey: DimensionDbKey) => void;
}

export default function DimensionsRadar({
  averages,
  activeSortBy = 'score',
  onAxisClick,
}: DimensionsRadarProps) {
  const data = useMemo(
    () =>
      DIMENSION_DB_KEYS.map((dim) => ({
        dimension: SCORE_LABELS[dim],
        dimKey: dim,
        value: Math.round((averages[dim] || 0) * 100),
        fullMark: 100,
      })),
    [averages],
  );

  if (data.every((d) => d.value === 0)) return null;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} margin={{ top: 24, right: 32, bottom: 24, left: 32 }}>
        <PolarGrid stroke="#e5e5e5" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={(tickProps: PolarAxisTickProps) => (
            <InteractiveAxisTick
              {...tickProps}
              activeSortBy={activeSortBy}
              onAxisClick={onAxisClick}
            />
          )}
        />
        <Radar
          dataKey="value"
          stroke={BRAND_HEX}
          fill={BRAND_HEX}
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 4, fill: BRAND_HEX }}
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

// Recharts passes any custom `tick` renderer a `payload.value` containing the
// rendered category label, plus computed x/y coordinates for placement. The
// x/y types are widened to `string | number` in recharts' types for table-axis
// reuse; the radar always passes numbers, so we coerce at the boundary.
interface PolarAxisTickProps {
  payload: { value: string };
  x: number | string;
  y: number | string;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
}

function InteractiveAxisTick({
  payload,
  x,
  y,
  textAnchor,
  activeSortBy,
  onAxisClick,
}: PolarAxisTickProps & {
  activeSortBy: SortBy;
  onAxisClick?: (dbKey: DimensionDbKey) => void;
}) {
  const [hover, setHover] = useState(false);
  const label = payload.value;
  const dbKey = LABEL_TO_DBKEY[label];
  const sortKey = dbKey ? DBKEY_TO_SORT_KEY[dbKey] : undefined;
  const isActive = sortKey !== undefined && activeSortBy === sortKey;
  const isInteractive = !!onAxisClick && !!dbKey;
  const xNum = typeof x === 'number' ? x : parseFloat(x);
  const yNum = typeof y === 'number' ? y : parseFloat(y);

  const fill = isActive
    ? BRAND_HEX
    : hover && isInteractive
      ? BRAND_HEX
      : '#737373';
  const fontWeight = isActive ? 700 : hover && isInteractive ? 600 : 400;
  // Glow only on hover/active so the chart doesn't permanently halo every
  // label (which would muddy the polygon).
  const filter = (isActive || (hover && isInteractive)) ? GLOW_FILTER : 'none';

  return (
    <g
      style={{ cursor: isInteractive ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (isInteractive && dbKey) onAxisClick(dbKey);
      }}
    >
      {/* SVG <title> is mounted unconditionally on interactive ticks so the
          browser's native tooltip fires on first hover (a state-conditional
          mount would only render after the hover transition, missing the
          initial tooltip event). */}
      {isInteractive && (
        <title>
          {isActive
            ? 'Klicken zum Aufheben dieser Sortierung'
            : `Klicken zum Sortieren nach ${label}`}
        </title>
      )}
      {/* Invisible hit area enlarged beyond the label for forgiving click
          targets, especially on touch where the actual text is small. */}
      <rect
        x={xNum - 60}
        y={yNum - 12}
        width={120}
        height={24}
        fill="transparent"
        pointerEvents="all"
      />
      <text
        x={xNum}
        y={yNum}
        dy={4}
        textAnchor={textAnchor}
        fontSize={11}
        fontWeight={fontWeight}
        fill={fill}
        style={{
          filter,
          transition: 'fill 200ms ease',
          userSelect: 'none',
        }}
      >
        {label}
        {isActive && (
          // Marker dot — orthogonal to the polygon's data dots so the active
          // axis reads as "selected", not as another data point.
          <tspan dx={6} fill={BRAND_HEX} style={{ fontSize: 14 }}>•</tspan>
        )}
      </text>
    </g>
  );
}
