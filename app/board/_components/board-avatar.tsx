'use client';

import { useState } from 'react';
import { cn } from '@/lib/shared/utils';
import type { BoardMember } from '@/lib/shared/board';
import { colorForUser, initialsOf } from '../_lib/people';

/** Runder Avatar: Profilbild (users.avatar_key via Proxy) wenn vorhanden,
 *  sonst Initialen in der stabilen Personenfarbe (Design Book). Bild-Fehler
 *  (fehlendes Objekt, ausgeloggt) fallen still auf Initialen zurück. */
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
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(member?.avatar_url) && !imgFailed;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none',
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
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member!.avatar_url!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initialsOf(member)
      )}
    </span>
  );
}
