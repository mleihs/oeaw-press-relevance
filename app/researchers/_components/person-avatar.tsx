'use client';

import { useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface PersonAvatarProps {
  firstname: string;
  lastname: string;
  portrait?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-sm',
  xl: 'h-24 w-24 text-xl',
} as const;

// Deterministic HSL hash from name → consistent color per person across the app.
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function PersonAvatar({
  firstname,
  lastname,
  portrait,
  size = 'md',
  className,
}: PersonAvatarProps) {
  const initials = useMemo(() => {
    const f = firstname?.trim()?.[0] ?? '';
    const l = lastname?.trim()?.[0] ?? '';
    return (f + l).toUpperCase() || '?';
  }, [firstname, lastname]);

  const { bg, fg } = useMemo(() => {
    const hue = hashHue(`${lastname}${firstname}`);
    return {
      bg: `hsl(${hue} 55% 88%)`,
      fg: `hsl(${hue} 60% 28%)`,
    };
  }, [firstname, lastname]);

  return (
    <Avatar className={cn(SIZES[size], 'shrink-0 font-medium ring-1 ring-black/5', className)}>
      {portrait && <AvatarImage src={portrait} alt={`${firstname} ${lastname}`} />}
      <AvatarFallback style={{ backgroundColor: bg, color: fg }}>{initials}</AvatarFallback>
    </Avatar>
  );
}
