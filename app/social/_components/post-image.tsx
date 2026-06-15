'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/shared/utils';

/**
 * Square post thumbnail, served through our same-origin proxy
 * (/api/social/image/[id]) so Instagram CDN hotlink/Referer rules and expiring
 * signed URLs never surface as a broken <img>. While loading: a soft shimmer.
 * On error (expired/removed): a branded gradient placeholder with the topic, so
 * a missing image still looks designed (accessible: decorative, labelled by the
 * surrounding card text).
 */
export function PostImage({
  postId,
  hasImage,
  label,
}: {
  postId: string;
  hasImage: boolean;
  label: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showFallback = !hasImage || failed;

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
      {!showFallback && (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/social/image/${postId}`}
            alt={label ?? 'Instagram-Post'}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-500',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      )}

      {showFallback && (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/15 via-brand/5 to-transparent p-3 text-center"
          aria-hidden
        >
          <Camera className="h-5 w-5 text-brand/50" />
          {label && (
            <span className="line-clamp-3 text-xs font-medium text-muted-foreground">
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
