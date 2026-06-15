'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * Instagram CDN thumbnail. The fbcdn URLs occasionally hotlink-block or expire,
 * so this falls back to a neutral placeholder on error instead of a broken
 * image. Client component purely for the onError handler.
 */
export function PostImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground/40">
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="aspect-square w-full rounded-md object-cover"
    />
  );
}
