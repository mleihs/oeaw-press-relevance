import { cn } from '@/lib/utils';

type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type Size = 'sm' | 'md' | 'lg';
type Color = 'brand' | 'purple' | 'emerald' | 'amber' | 'blue';

const POSITIONS: Record<Position, string> = {
  'top-left': '-top-12 -left-12',
  'top-right': '-top-12 -right-12',
  'bottom-left': '-bottom-12 -left-12',
  'bottom-right': '-bottom-12 -right-12',
};

const SIZES: Record<Size, string> = {
  sm: 'h-32 w-32',
  md: 'h-40 w-40',
  lg: 'h-56 w-56',
};

// Tailwind needs static class names for JIT — listing variants explicitly.
const COLORS: Record<Color, string> = {
  brand: 'bg-brand/10',
  purple: 'bg-purple-500/10',
  emerald: 'bg-emerald-500/10',
  amber: 'bg-amber-500/10',
  blue: 'bg-blue-500/10',
};

interface AtmosphericOrbProps {
  position: Position;
  size?: Size;
  color: Color;
  className?: string;
}

/**
 * Decorative blurred radial gradient that softens corners of hero/glass cards.
 * Always rendered with `aria-hidden` and `pointer-events-none` — purely visual.
 * Parent must be `position: relative` and `overflow: hidden`.
 */
export function AtmosphericOrb({
  position,
  size = 'md',
  color,
  className,
}: AtmosphericOrbProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute pointer-events-none rounded-full blur-3xl',
        POSITIONS[position],
        SIZES[size],
        COLORS[color],
        className,
      )}
    />
  );
}
