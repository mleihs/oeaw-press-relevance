'use client';

import { useRef, useState } from 'react';
import { Camera, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { ImageQuickview, type QuickviewRect } from './image-quickview';

/**
 * Square post thumbnail, served through our same-origin proxy
 * (/api/social/image/[id]) so Instagram CDN hotlink/Referer rules and expiring
 * signed URLs never surface as a broken <img>. The square is object-cover
 * (cropped); a corner quickview button expands the full, uncropped image via a
 * FLIP morph (ImageQuickview). While loading: a soft shimmer. On error: a
 * branded gradient placeholder with the topic.
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
  const [quickOpen, setQuickOpen] = useState(false);
  const [origin, setOrigin] = useState<QuickviewRect | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const showFallback = !hasImage || failed;
  const src = `/api/social/image/${postId}`;

  // Measure the thumbnail rect at click time so the quickview can morph out of it.
  const openQuick = () => {
    const r = imgRef.current?.getBoundingClientRect();
    if (r) setOrigin({ top: r.top, left: r.left, width: r.width, height: r.height });
    setQuickOpen(true);
  };

  return (
    <div ref={imgRef} className="group/img relative aspect-square w-full overflow-hidden rounded-md bg-muted">
      {!showFallback && (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
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
          {loaded && (
            <button
              type="button"
              onClick={openQuick}
              aria-label="Bild vollständig ansehen"
              title="Vollständig ansehen"
              className="absolute bottom-1.5 right-1.5 rounded-md bg-black/45 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/65 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white group-hover/img:opacity-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <ImageQuickview
            src={src}
            alt={label ?? 'Instagram-Post'}
            origin={origin}
            open={quickOpen}
            onClose={() => setQuickOpen(false)}
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
            <span className="line-clamp-3 text-xs font-medium text-muted-foreground">{label}</span>
          )}
        </div>
      )}
    </div>
  );
}
