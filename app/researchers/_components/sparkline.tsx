'use client';

import { useId, useMemo } from 'react';
import type { SparklinePoint } from '@/lib/researchers';

interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  /** Animate the path drawing in on mount. */
  animate?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 22,
  stroke = 'currentColor',
  fill = 'transparent',
  animate = true,
  className,
}: SparklineProps) {
  const uid = useId();
  const { d, area, dotX, dotY } = useMemo(() => {
    if (!data || data.length === 0) {
      return { d: '', area: '', dotX: 0, dotY: height };
    }
    const max = Math.max(1, ...data.map((p) => p.c));
    const xs = data.map((_, i) => (i / Math.max(1, data.length - 1)) * (width - 2) + 1);
    const ys = data.map((p) => height - 1 - (p.c / max) * (height - 3));
    const path = xs
      .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`)
      .join(' ');
    const areaPath = `${path} L${xs[xs.length - 1].toFixed(1)} ${height} L${xs[0].toFixed(1)} ${height} Z`;
    return {
      d: path,
      area: areaPath,
      dotX: xs[xs.length - 1],
      dotY: ys[ys.length - 1],
    };
  }, [data, width, height]);

  if (!data || data.length === 0) {
    return <div style={{ width, height }} aria-hidden />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {fill !== 'transparent' && <path d={area} fill={fill} opacity={0.18} />}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          animate
            ? {
                strokeDasharray: 200,
                strokeDashoffset: 200,
                animation: `sparkdraw-${uid} 1100ms 80ms cubic-bezier(0.65,0,0.35,1) forwards`,
              }
            : undefined
        }
      />
      <circle cx={dotX} cy={dotY} r={1.8} fill={stroke} />
      {animate && (
        <style>{`
          @keyframes sparkdraw-${uid} {
            to { stroke-dashoffset: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            path { animation: none !important; stroke-dashoffset: 0 !important; }
          }
        `}</style>
      )}
    </svg>
  );
}
