'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoBubble } from '@/components/info-bubble';
import type { EXPL } from '@/lib/explanations';
import { cn } from '@/lib/utils';

type Accent = 'default' | 'brand' | 'emerald' | 'amber' | 'purple';

const CARD_GRADIENTS: Record<Accent, string> = {
  default: '',
  brand: 'bg-gradient-to-br from-brand/[0.08] to-transparent border-brand/20',
  emerald: 'bg-gradient-to-br from-emerald-500/[0.08] to-transparent border-emerald-500/20',
  amber: 'bg-gradient-to-br from-amber-500/[0.08] to-transparent border-amber-500/20',
  purple: 'bg-gradient-to-br from-purple-500/[0.08] to-transparent border-purple-500/20',
};

const ICON_BG: Record<Accent, string> = {
  default: 'text-brand/30',
  brand: 'rounded-lg p-2 bg-brand/10 text-brand',
  emerald: 'rounded-lg p-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'rounded-lg p-2 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  purple: 'rounded-lg p-2 bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: ReactNode;
  subtitle?: string;
  loading?: boolean;
  accent?: Accent;
  /** Optional InfoBubble explanation id (matches lib/explanations.tsx). */
  explId?: keyof typeof EXPL;
  /** Mount fade-in. Set false for static contexts where animation is overkill. */
  animate?: boolean;
}

/**
 * Single source of truth for the dashboard / press-releases / future-pages
 * stat-card pattern. Replaces the two local copies that used to live in
 * `app/page.tsx` and `app/press-releases/page.tsx`.
 */
export function StatCard({
  label,
  value,
  icon,
  subtitle,
  loading,
  accent = 'default',
  explId,
  animate = true,
}: StatCardProps) {
  const inner = (
    <Card
      className={cn(
        'overflow-hidden transition-all hover:shadow-md hover:border-brand/30',
        CARD_GRADIENTS[accent],
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
              {label}
              {explId && <InfoBubble id={explId} />}
            </p>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">
              {loading || value === undefined ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                value.toLocaleString('de-AT')
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={cn('shrink-0', ICON_BG[accent])}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );

  if (!animate) return inner;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {inner}
    </motion.div>
  );
}
