import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/shared/utils';

const TINT_CLASSES = {
  green:   'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  amber:   'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  blue:    'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  red:     'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  purple:  'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  indigo:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  orange:  'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
} as const;

export type TintColor = keyof typeof TINT_CLASSES;

interface TintBadgeProps {
  color: TintColor;
  className?: string;
  children: ReactNode;
}

export function TintBadge({ color, className, children }: TintBadgeProps) {
  return (
    <Badge variant="secondary" className={cn(TINT_CLASSES[color], className)}>
      {children}
    </Badge>
  );
}
