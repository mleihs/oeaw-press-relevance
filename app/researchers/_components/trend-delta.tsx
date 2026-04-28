'use client';

import { ArrowUpRight, ArrowDownRight, Minus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendDeltaProps {
  delta: number;
  isNewcomer?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function TrendDelta({ delta, isNewcomer, className, size = 'sm' }: TrendDeltaProps) {
  const text = size === 'sm' ? 'text-xs' : 'text-sm';
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  if (isNewcomer) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 font-medium text-[#0047bb]', text, className)}
        aria-label="Neu im Ranking"
        title="Neu im Ranking"
      >
        <Sparkles className={icon} />
        NEU
      </span>
    );
  }

  if (delta > 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-0.5 font-medium text-emerald-600', text, className)}
        aria-label={`um ${delta} gestiegen`}
      >
        <ArrowUpRight className={icon} />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-0.5 font-medium text-rose-600', text, className)}
        aria-label={`um ${Math.abs(delta)} gefallen`}
      >
        <ArrowDownRight className={icon} />
        {Math.abs(delta)}
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex items-center text-neutral-400', text, className)}
      aria-label="unverändert"
    >
      <Minus className={icon} />
    </span>
  );
}
