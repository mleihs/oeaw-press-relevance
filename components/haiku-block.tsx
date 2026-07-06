'use client';

import { useMemo } from 'react';
import { FlowerLotus, Sparkles } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { InfoBubble } from '@/components/info-bubble';

interface HaikuBlockProps {
  haiku: string;
  model?: string | null;
  /** 'gradient' = Comp-Stil der Pub-Detailseite (Toolkit-Redesign.dc.html
   *  Z. 274–283): blauer Verlauf, Lotus-Wasserzeichen, Mono-Label, weiße
   *  Zeilen. Default bleibt der Serif-Stil (Publikations-Tabelle). */
  variant?: 'default' | 'gradient';
}

export function HaikuBlock({ haiku, model, variant = 'default' }: HaikuBlockProps) {
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

  const gradient = variant === 'gradient';

  const renderLines = (lineClass: string) =>
    lines.map((line, lineIdx) => (
      // whitespace-nowrap keeps each haiku line on exactly one visual
      // line; without it the 7-syllable middle line wraps in narrower
      // containers and the haiku looks like 4 lines (5-2-7-5) instead
      // of the intended 5-7-5 structure.
      <div key={lineIdx} className={cn('block whitespace-nowrap', lineClass)}>
        {line.split(/\s+/).map((word, wIdx, words) => {
          const i = wordIndex++;
          return (
            // Space als eigenes Textnode ZWISCHEN den Spans — ein trailing
            // Space innerhalb eines inline-block wird am Box-Rand kollabiert
            // („ZweiDoerferimTal"), zwischen zwei inline-blocks bleibt er stehen.
            <span key={`${lineIdx}-${wIdx}`}>
              <span
                className="inline-block opacity-0 [animation:haikuFade_700ms_ease-out_forwards]"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                {word}
              </span>
              {wIdx < words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    ));

  if (gradient) {
    return (
      <section
        aria-label="Haiku zur Publikation"
        className="relative overflow-hidden rounded-xl px-6 py-5 text-white motion-reduce:[&_span]:opacity-100 motion-reduce:[&_span]:animate-none"
        style={{ backgroundImage: 'linear-gradient(160deg, var(--brand-500), var(--brand-700))' }}
      >
        <FlowerLotus
          weight="fill"
          aria-hidden
          className="absolute right-4 top-3.5 h-10 w-10 text-white/[0.12]"
        />
        <p className="mb-3 inline-flex items-center gap-1 font-mono text-2xs font-semibold uppercase tracking-[0.09em] text-brand-300">
          Haiku
          <InfoBubble id="haiku_block" />
        </p>
        <div className="flex flex-col gap-1.5">
          {renderLines('text-lg font-medium leading-snug tracking-tight')}
        </div>
        {model && (
          <p className="mt-4 inline-flex items-center gap-1.5 font-mono text-2xs text-white/60">
            <Sparkles className="h-3 w-3" />
            {model.split('/').pop()}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Haiku zur Publikation"
      className="my-2 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
    >
      <div>
        <p className="mb-4 inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Haiku
          <InfoBubble id="haiku_block" />
        </p>
        <div
          className="font-serif text-[1.6rem] font-light leading-[1.55] text-foreground motion-reduce:[&_span]:opacity-100 motion-reduce:[&_span]:animate-none md:text-[2rem] md:leading-[1.5]"
          style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
        >
          {renderLines('')}
        </div>
      </div>
      <div className="hidden border-l border-border pl-4 text-right text-2xs uppercase tracking-[0.14em] text-muted-foreground/70 md:block">
        <p>5 · 7 · 5</p>
        {model && <p className="mt-1 normal-case tracking-normal text-muted-foreground/70">{model.split('/').pop()}</p>}
      </div>
    </section>
  );
}
