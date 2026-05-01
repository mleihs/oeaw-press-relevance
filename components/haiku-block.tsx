'use client';

import { useMemo } from 'react';
import { InfoBubble } from '@/components/info-bubble';

interface HaikuBlockProps {
  haiku: string;
  model?: string | null;
}

export function HaikuBlock({ haiku, model }: HaikuBlockProps) {
  const lines = useMemo(() => {
    const trimmed = haiku.trim();
    const split = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (split.length >= 3) return split.slice(0, 3);
    // Fallback: model returned a single line — split on long em/en dashes or sentence-final punctuation.
    const parts = trimmed.split(/\s*[—–]\s*|\s*\/\s*|(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length >= 3) return parts.slice(0, 3);
    return [trimmed];
  }, [haiku]);

  let wordIndex = 0;

  return (
    <section
      aria-label="Haiku zur Publikation"
      className="my-2 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
    >
      <div>
        <p className="mb-4 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-500">
          Haiku
          <InfoBubble id="haiku_block" />
        </p>
        <div
          className="font-serif text-[1.6rem] font-light leading-[1.55] text-neutral-900 motion-reduce:[&_span]:opacity-100 motion-reduce:[&_span]:animate-none md:text-[2rem] md:leading-[1.5]"
          style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
        >
          {lines.map((line, lineIdx) => (
            <div key={lineIdx} className="block">
              {line.split(/\s+/).map((word, wIdx) => {
                const i = wordIndex++;
                return (
                  <span
                    key={`${lineIdx}-${wIdx}`}
                    className="inline-block opacity-0 [animation:haikuFade_700ms_ease-out_forwards]"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    {word}
                    {wIdx < line.split(/\s+/).length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="hidden border-l border-neutral-200 pl-4 text-right text-[10px] uppercase tracking-[0.14em] text-neutral-400 md:block">
        <p>5 — 7 — 5</p>
        {model && <p className="mt-1 normal-case tracking-normal text-neutral-400">{model.split('/').pop()}</p>}
      </div>
    </section>
  );
}
