'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force';
import { motion } from 'motion/react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { PersonAvatar } from './person-avatar';
import { InfoBubble } from '@/components/info-bubble';
import { LoadingState } from '@/components/loading-state';
import {
  METRIC_SHORT_LABELS,
  type DistributionPoint,
  type LeaderboardMetric,
} from '@/lib/researchers';

interface BeeswarmViewProps {
  points: DistributionPoint[];
  loading: boolean;
  metric: LeaderboardMetric;
}

interface Node extends DistributionPoint {
  x: number;
  y: number;
  r: number;
  baseX: number;
}

// Deterministic palette for sektion colors. Up to 12 oestat3 categories cycle through.
const SECTION_COLORS = [
  '#0047bb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4',
  '#84cc16', '#ec4899', '#f97316', '#14b8a6', '#a855f7', '#64748b',
];
function colorFor(sektion: string | null): string {
  if (!sektion) return '#cbd5e1';
  let h = 0;
  for (let i = 0; i < sektion.length; i++) h = (h * 31 + sektion.charCodeAt(i)) | 0;
  return SECTION_COLORS[Math.abs(h) % SECTION_COLORS.length];
}

const HEIGHT = 320;
const PAD_X = 40;
const PAD_Y = 24;

export function BeeswarmView({ points, loading, metric }: BeeswarmViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Track container width for responsive layout.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(320, Math.floor(e.contentRect.width)));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute layout when points or width change.
  const sektionLegend = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      const s = p.oestat3_name_de;
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [points]);

  useEffect(() => {
    if (points.length === 0) {
      setNodes([]);
      return;
    }
    const max = Math.max(1, ...points.map((p) => p.metric_value));
    const min = 0;
    const innerW = width - 2 * PAD_X;
    const xScale = (v: number) =>
      PAD_X + ((v - min) / (max - min)) * innerW;

    const initial: Node[] = points.map((p) => {
      const r = Math.max(3, Math.sqrt(Math.max(1, p.pubs_total)) * 2.4);
      const baseX = xScale(p.metric_value);
      return { ...p, x: baseX, y: HEIGHT / 2, r, baseX };
    });

    const sim = forceSimulation(initial)
      .force('x', forceX<Node>((d) => d.baseX).strength(0.85))
      .force('y', forceY<Node>(HEIGHT / 2).strength(0.07))
      .force('collide', forceCollide<Node>((d) => d.r + 1).strength(0.95))
      .stop();
    for (let i = 0; i < 140; i++) sim.tick();
    // Clamp into bounds
    for (const n of initial) {
      n.y = Math.max(PAD_Y + n.r, Math.min(HEIGHT - PAD_Y - n.r, n.y));
    }
    setNodes(initial.slice());
  }, [points, width]);

  if (loading && points.length === 0) {
    return <LoadingState variant="text" label="Lade Verteilung …" />;
  }

  if (!loading && points.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center text-sm text-neutral-500">
        Keine Daten für die aktuellen Filter.
      </div>
    );
  }

  // X-axis ticks
  const max = Math.max(1, ...points.map((p) => p.metric_value));
  const tickValues = [0, max / 4, max / 2, (3 * max) / 4, max];

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="flex items-center gap-1 text-xs font-medium text-neutral-700">
            Verteilung der Forschenden nach {METRIC_SHORT_LABELS[metric]}
            <InfoBubble id="beeswarm" />
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Punktgröße entspricht der Anzahl bewerteter Publikationen. Hover für Details.
          </p>
        </div>
        <p className="text-xs tabular-nums text-neutral-400">{points.length} Personen</p>
      </div>

      <div ref={containerRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          className="block"
          role="img"
          aria-labelledby="beeswarm-title beeswarm-desc"
        >
          <title id="beeswarm-title">Verteilung der Forschenden nach {METRIC_SHORT_LABELS[metric]}</title>
          <desc id="beeswarm-desc">
            {points.length} Forschende, X-Achse zeigt {METRIC_SHORT_LABELS[metric]}, Punktgröße entspricht Anzahl Pubs.
            Die vollständige Liste finden Sie als Tabelle unter dem Diagramm.
          </desc>
          {/* X axis */}
          <line
            x1={PAD_X} x2={width - PAD_X}
            y1={HEIGHT - 12} y2={HEIGHT - 12}
            stroke="#e5e5e5"
          />
          {tickValues.map((t) => {
            const x = PAD_X + (t / max) * (width - 2 * PAD_X);
            return (
              <g key={t}>
                <line x1={x} x2={x} y1={HEIGHT - 16} y2={HEIGHT - 8} stroke="#d4d4d4" />
                <text x={x} y={HEIGHT - 0} textAnchor="middle" className="fill-neutral-400 text-[10px]">
                  {metric === 'avg_score' ? `${Math.round(t * 100)}%` : t.toFixed(metric === 'sum_score' ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {nodes.map((n, idx) => (
            <HoverCard key={n.person_id} openDelay={80} closeDelay={120}>
              <HoverCardTrigger asChild>
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: hoveredId && hoveredId !== n.person_id ? 0.25 : 1 }}
                  transition={{
                    opacity: { duration: 0.18 },
                    delay: hoveredId == null ? Math.min(idx * 0.004, 0.3) : 0,
                  }}
                  onMouseEnter={() => setHoveredId(n.person_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(n.person_id)}
                  onBlur={() => setHoveredId(null)}
                  tabIndex={0}
                  role="link"
                  aria-label={`${n.firstname} ${n.lastname}, ${METRIC_SHORT_LABELS[metric]}: ${
                    metric === 'avg_score' || metric === 'weighted_avg'
                      ? Math.round(n.metric_value * 100) + '%'
                      : n.metric_value
                  }, ${n.pubs_total} Publikationen${n.is_member ? ', ÖAW-Mitglied' : ''}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      window.location.href = `/persons/${n.person_id}`;
                    }
                  }}
                  className="focus:outline-none focus-visible:[&_circle]:stroke-[#0047bb] focus-visible:[&_circle]:stroke-[2px]"
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={colorFor(n.oestat3_name_de)}
                    fillOpacity={n.is_member ? 0.92 : 0.55}
                    stroke={n.is_member ? '#0047bb' : 'white'}
                    strokeWidth={n.is_member ? 1.2 : 0.5}
                  />
                </motion.g>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-72 p-3">
                <div className="flex items-start gap-3">
                  <PersonAvatar firstname={n.firstname} lastname={n.lastname} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/persons/${n.person_id}`}
                      className="block truncate text-sm font-medium hover:text-[#0047bb]"
                    >
                      {n.firstname} {n.lastname}
                    </Link>
                    {n.oestat3_name_de && (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{n.oestat3_name_de}</p>
                    )}
                    <div className="mt-2 flex items-baseline gap-3 text-xs">
                      <span><span className="font-medium tabular-nums">
                        {metric === 'avg_score' ? `${Math.round(n.metric_value * 100)} %` : n.metric_value.toFixed(metric === 'sum_score' ? 2 : 0)}
                      </span> {METRIC_SHORT_LABELS[metric]}</span>
                      <span className="text-neutral-400">·</span>
                      <span>{n.pubs_total} Pubs</span>
                    </div>
                    {n.is_member && (
                      <p className="mt-1 inline-flex rounded-sm bg-[#0047bb]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#0047bb]">
                        ÖAW-Mitglied
                      </p>
                    )}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
        </svg>

        {/* Legend */}
        {sektionLegend.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-neutral-500">
            {sektionLegend.map(([s, n]) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorFor(s) }}
                />
                {s} <span className="text-neutral-300">({n})</span>
              </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full border border-[#0047bb] bg-[#0047bb]/90" />
              Akademie-Mitglied
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
