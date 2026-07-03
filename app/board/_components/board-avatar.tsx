'use client';

import { cn } from '@/lib/shared/utils';
import type { BoardMember } from '@/lib/shared/board';
import { colorForUser, initialsOf } from '../_lib/people';

/** Runder Initialen-Avatar in der stabilen Personenfarbe (Design Book). */
export function BoardAvatar({
  member,
  size = 28,
  className,
  ring,
}: {
  member: BoardMember | undefined | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const color = member ? colorForUser(member.id) : '#9aa4b2';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: Math.round(size * 0.4),
        boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : undefined,
      }}
      title={member?.display_name ?? member?.email ?? undefined}
      aria-hidden
    >
      {initialsOf(member)}
    </span>
  );
}
