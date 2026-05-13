'use client';

import { useEffect, useState } from 'react';

// Top-keywords cloud with a mount-time fade+scale-in. Lives next to the
// dashboard client because it's only consumed there; if a second page ever
// needs it, lift to `@/components/`.
export function KeywordCloud({ keywords }: { keywords: { word: string; count: number }[] }) {
  // Hooks must come BEFORE any early return — React hook count must be
  // stable across renders or the second render after the dataset toggles
  // produces a warning.
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (keywords.length === 0) return null;
  const max = Math.max(...keywords.map((k) => k.count));
  const getSize = (count: number) => 12 + (count / max) * 12;

  return (
    <>
      <div
        className="flex flex-wrap gap-2 justify-center items-baseline"
        role="presentation"
        aria-hidden="true"
      >
        {keywords.map(({ word, count }, i) => (
          <span
            key={word}
            className="inline-block px-2 py-0.5 rounded-full bg-muted text-foreground/80 hover:bg-brand hover:text-white cursor-default transition-all duration-500 ease-out motion-reduce:transition-none"
            style={{
              fontSize: `${getSize(count)}px`,
              opacity: animated ? 1 : 0,
              transform: animated ? 'scale(1)' : 'scale(0.5)',
              transitionDelay: `${i * 30}ms`,
            }}
            title={`${count}× in Publikationen`}
          >
            {word}
          </span>
        ))}
      </div>
      {/* W3: AT-friendly equivalent of the visual cloud. */}
      <ul className="sr-only" aria-label="Top Keywords aus angereicherten Publikationen">
        {keywords.map(({ word, count }) => (
          <li key={word}>{word}: {count} mal</li>
        ))}
      </ul>
    </>
  );
}
