'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { BRAND_HEX } from '@/lib/shared/constants';
import {
  SIMILARITY_RANGE_MIN,
  type ScoreSimilarityPoint,
} from '@/lib/shared/dashboard';

interface Props {
  /** [press_score 0..1, press_similarity 0..1] pairs. */
  points: ScoreSimilarityPoint[];
}

// Diagnostic quadrant: the LLM scored it un-pitchable (low Story Score) yet
// its SPECTER2 embedding sits very close to the historically-pressed cluster.
// This is exactly the LLM-false-negative cross-check (physics/acoustics blind
// spot) the two old marginal histograms could never surface.
const DIAG_SCORE_MAX = 40; // Story Score %
const DIAG_SIM_MIN = 85; // Press-Similarity %
const SIM_MIN_PCT = Math.round(SIMILARITY_RANGE_MIN * 100);

const AXIS = 'var(--muted-foreground)';
const GRID = 'var(--border)';
const DIAG = '#f59e0b';

type Datum = { x: number; y: number; c: number };

function ScatterTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="tabular-nums font-medium">
        {d.c === 1 ? '1 Publikation' : `${d.c} Publikationen`}
      </div>
      <div className="tabular-nums text-muted-foreground">
        Story Score <strong>{Math.round(d.x)} %</strong>
      </div>
      <div className="tabular-nums text-muted-foreground">
        Press-Similarity <strong>{d.y.toFixed(1)} %</strong>
      </div>
    </div>
  );
}

/**
 * Joint Story Score x Press-Similarity scatter. Replaces the two independent
 * marginal histograms: those could not show that a single pub may have a low
 * Story Score and a high Press-Similarity at the same time. The shaded
 * top-left quadrant is the "LLM says skip, embedding says look again" review
 * zone. Identity is intentionally omitted (distribution view, lean RSC
 * payload); drill-down stays in the Top-N table below.
 */
export function ScoreSimilarityScatter({ points }: Props) {
  const data = useMemo<Datum[]>(
    () => points.map(([s, p, c]) => ({ x: s * 100, y: p * 100, c })),
    [points],
  );

  // Sum of bin counts — the actual number of analyzed pubs behind the cells.
  const total = useMemo(() => data.reduce((sum, d) => sum + d.c, 0), [data]);

  // Diagnostic-quadrant pub count. Bin edges are aligned to 40 % / 85 % in the
  // SQL, so summing the counts of cells whose centres clear the thresholds is
  // exact, not an approximation.
  const diagCount = useMemo(
    () =>
      data.reduce(
        (sum, d) =>
          d.x <= DIAG_SCORE_MAX && d.y >= DIAG_SIM_MIN ? sum + d.c : sum,
        0,
      ),
    [data],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: BRAND_HEX, opacity: 0.55 }}
          />
          Punktgröße: Anzahl Publikationen je Zelle
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: DIAG, opacity: 0.35 }}
          />
          niedriger Score + hohe Similarity: LLM evtl. zu streng, manuell prüfen
        </span>
      </div>

      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 12, right: 18, bottom: 28, left: 6 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fontSize: 11, fill: AXIS }}
              stroke={GRID}
              label={{
                value: 'Story Score (%)',
                position: 'insideBottom',
                offset: -16,
                fontSize: 12,
                fill: AXIS,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[SIM_MIN_PCT, 100]}
              ticks={[70, 75, 80, 85, 90, 95, 100]}
              tick={{ fontSize: 11, fill: AXIS }}
              stroke={GRID}
              width={42}
              label={{
                value: 'Press-Similarity (%)',
                angle: -90,
                position: 'insideLeft',
                offset: 16,
                fontSize: 12,
                fill: AXIS,
              }}
            />
            <ZAxis type="number" dataKey="c" range={[16, 260]} />
            <ReferenceArea
              x1={0}
              x2={DIAG_SCORE_MAX}
              y1={DIAG_SIM_MIN}
              y2={100}
              fill={DIAG}
              fillOpacity={0.07}
              stroke={DIAG}
              strokeOpacity={0.25}
              ifOverflow="hidden"
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: AXIS }}
              content={<ScatterTip />}
            />
            <Scatter
              data={data}
              fill={BRAND_HEX}
              fillOpacity={0.45}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="sr-only">
        Streudiagramm aus {total} analysierten Publikationen, X-Achse
        Story Score 0 bis 100 Prozent, Y-Achse Press-Similarity {SIM_MIN_PCT}{' '}
        bis 100 Prozent. Story Score und Press-Similarity sind unabhängige
        Signale: {diagCount} Publikationen liegen im Bereich niedriger Story
        Score (bis {DIAG_SCORE_MAX} Prozent) bei zugleich hoher Press-Similarity
        (ab {DIAG_SIM_MIN} Prozent) und sind damit Kandidaten für eine manuelle
        Prüfung trotz niedriger LLM-Bewertung.
      </p>
    </div>
  );
}
