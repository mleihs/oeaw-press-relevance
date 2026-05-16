'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/shared/utils';

type Phase = 'old' | 'glitch' | 'cyber';

interface CapybaraGlitchProps {
  oldSrc: string;
  cyberSrc: string;
  oldAlt: string;
  cyberAlt: string;
  /**
   * Set to true to play the boot-sequence animation (old → glitch → cyber).
   * False renders cyber immediately. The component reacts to changes: false→true
   * starts the animation; true→false snaps back to cyber.
   */
  play: boolean;
  /** Fires when the animation reaches the cyber phase. */
  onComplete?: () => void;
  /** Calm-intro duration before the glitch arc begins. Default 2500 ms. */
  oldHoldMs?: number;
  /** Duration of the glitch arc itself. Default 7500 ms. */
  glitchDurationMs?: number;
  /** Sizing/layout classes for the outer container (it sets position+overflow). */
  className?: string;
  /** Forwarded to both Image components. */
  priority?: boolean;
}

/**
 * Capybara boot-sequence glitch: cross-fades two pencil-sketch PNGs through a
 * 10-second analog-CRT meltdown (chromatic split, slice tears, two VHS
 * collapses, invert/contrast flashes, scanline + scan-sweep overlay).
 *
 * The PNGs are expected to be alpha-channel preprocessed (paper transparent,
 * pencil-darkness as alpha) so the glitch animation's filter/transform/clip-path
 * chain cannot break a mix-blend-mode (which would isolate inside the new
 * stacking context and flash white). See scripts/preprocess-capybara-alpha.mjs.
 */
export function CapybaraGlitch({
  oldSrc,
  cyberSrc,
  oldAlt,
  cyberAlt,
  play,
  onComplete,
  oldHoldMs = 2500,
  glitchDurationMs = 7500,
  className,
  priority = false,
}: CapybaraGlitchProps) {
  // Seed initial phase from initial `play` value so the first paint already
  // shows the right image (no cyber→old or old→cyber snap during hydration).
  const [phase, setPhase] = useState<Phase>(() => (play ? 'old' : 'cyber'));

  // Stash the callback in a ref so the scheduling effect below doesn't have
  // to depend on it. Otherwise an inline-arrow `onComplete` from the parent
  // would change identity on every parent re-render, retriggering the effect
  // and restarting the animation mid-glitch on any unrelated state change.
  // The ref update lives in its own effect to honour React's "no ref writes
  // during render" rule; the scheduling effect below declares this one's
  // dependency-after, so by timer-fire the ref already holds the latest.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Legitimate effect: this is a wall-clock-driven animation state machine
  // (synchronising React state with an external system — the timer schedule),
  // exactly the case React's docs carve out for effects. The synchronous
  // setPhase calls reset the sequence when `play` toggles; the rest fire from
  // setTimeout. There is no derived-state cascade to refactor away, so the
  // rule is disabled for the whole controller with this rationale.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!play) {
      setPhase('cyber');
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setPhase('old');
      const t = setTimeout(() => {
        setPhase('cyber');
        onCompleteRef.current?.();
      }, oldHoldMs);
      return () => clearTimeout(t);
    }
    setPhase('old');
    const t1 = setTimeout(() => setPhase('glitch'), oldHoldMs);
    const t2 = setTimeout(() => {
      setPhase('cyber');
      onCompleteRef.current?.();
    }, oldHoldMs + glitchDurationMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [play, oldHoldMs, glitchDurationMs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* OLD image. Visible in 'old' phase, animates out during 'glitch',
          fades to opacity 0 in 'cyber'. The transition-opacity smooths the
          'cyber' ↔ 'old' direct switch (used when daily-trigger flips). */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          phase === 'glitch' && 'animate-cb-glitch-old',
          phase === 'cyber' && 'opacity-0',
          phase === 'old' && 'opacity-100',
        )}
      >
        <Image
          src={oldSrc}
          alt={oldAlt}
          fill
          className="object-contain"
          style={{ objectFit: 'contain' }}
          priority={priority}
        />
      </div>

      {/* CYBER image. Hidden in 'old', animates in during 'glitch', visible
          in 'cyber'. */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          phase === 'old' && 'opacity-0',
          phase === 'glitch' && 'animate-cb-glitch-new',
          phase === 'cyber' && 'opacity-100',
        )}
      >
        <Image
          src={cyberSrc}
          alt={cyberAlt}
          fill
          className="object-contain"
          style={{ objectFit: 'contain' }}
          priority={priority}
        />
      </div>

      {/* Glitch overlay: scanlines + flicker noise + CRT scan-sweep. Only
          mounted during the glitch phase so the rest of the time we don't
          paint extra layers. */}
      {phase === 'glitch' && (
        <>
          <div className="pointer-events-none absolute inset-0 animate-cb-glitch-overlay mix-blend-overlay">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
                backgroundSize: '4px 4px',
              }}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen">
            <div
              className="animate-cb-scan-sweep absolute left-0 right-0 h-[35%]"
              style={{
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(180,220,255,0.10) 40%, rgba(255,255,255,0.30) 50%, rgba(180,220,255,0.10) 60%, transparent 100%)',
              }}
            />
          </div>
        </>
      )}

      <style jsx global>{`
        /* Boot-sequence glitch, 7-phase dramaturgy over 7.5s with TWO
         * climaxes and multiple resurgences. See PasswordGate or scripts
         * for the full phase breakdown. All filter base-states are
         * hue-rotate(0deg) instead of none so Safari interpolates cleanly.
         */
        @keyframes cb-glitch-old {
          0%   { opacity: 1; transform: none; filter: hue-rotate(0deg); clip-path: none; }
          /* ① warning jitter */
          2%   { transform: translate(-1px, 0); }
          4%   { filter: drop-shadow(2px 0 rgba(255,0,40,0.35)) drop-shadow(-2px 0 rgba(0,200,255,0.35)); }
          5%   { filter: hue-rotate(0deg); transform: translate(1px, 0); }
          6%   { transform: translate(-1px, 0); filter: drop-shadow(1px 0 rgba(255,0,40,0.4)); }
          7%   { filter: hue-rotate(0deg); transform: none; }
          /* ② first major burst */
          9%   { clip-path: inset(20% 0 65% 0); transform: translate(-15px, 0); filter: drop-shadow(5px 0 rgba(255,0,40,0.7)) drop-shadow(-5px 0 rgba(0,200,255,0.7)); }
          11%  { clip-path: inset(55% 0 25% 0); transform: translate(14px, -3px); }
          13%  { clip-path: inset(30% 0 55% 0); transform: translate(-10px, 2px); filter: hue-rotate(180deg) saturate(2); }
          14%  { opacity: 0.2; clip-path: none; transform: translate(8px, 0); }
          15%  { opacity: 0.85; filter: contrast(2.2); }
          17%  { opacity: 1; filter: hue-rotate(0deg); transform: translate(-3px, 0); }
          19%  { transform: none; filter: drop-shadow(3px 0 rgba(255,0,40,0.5)); }
          21%  { filter: hue-rotate(0deg); transform: none; opacity: 1; }
          /* ③ false-calm with micro-flickers */
          24%  { transform: translate(1px, 0); }
          26%  { transform: translate(-2px, 1px); filter: drop-shadow(1px 0 rgba(255,0,40,0.3)) drop-shadow(-1px 0 rgba(0,200,255,0.3)); }
          27%  { filter: hue-rotate(0deg); transform: none; }
          29%  { opacity: 0.6; }
          30%  { opacity: 1; filter: invert(0.3); }
          31%  { filter: hue-rotate(0deg); }
          32%  { transform: none; opacity: 1; }
          /* ④ build-up flickers */
          33%  { opacity: 0.2; }
          34%  { opacity: 1; clip-path: inset(0 0 90% 0); }
          35%  { opacity: 0.1; clip-path: none; filter: contrast(3) brightness(1.5); }
          36%  { opacity: 0.95; filter: hue-rotate(0deg); }
          37%  { opacity: 0.15; transform: translate(-8px, 0); }
          38%  { opacity: 1; transform: none; }
          /* ⑤ CLIMAX (two collapses + multiple resurgences) */
          40%  { opacity: 0.55; clip-path: inset(8% 0 75% 0); transform: translate(-18px, 0); filter: drop-shadow(7px 0 rgba(255,0,40,0.85)) drop-shadow(-7px 0 rgba(0,200,255,0.85)); }
          42%  { opacity: 0.9; clip-path: inset(70% 0 5% 0); transform: translate(17px, 4px); }
          43%  { opacity: 0.05; transform: translate(0, -3px); filter: invert(1); }
          44%  { opacity: 0.7; clip-path: inset(45% 0 35% 0); transform: translate(12px, 0); filter: contrast(2.8) brightness(1.8); }
          46%  { opacity: 0.2; transform: translate(-5px, 0); clip-path: none; filter: hue-rotate(120deg) saturate(2.5); }
          47%  { opacity: 0.85; clip-path: inset(15% 0 70% 0); transform: translate(10px, 1px); }
          /* ⑤a first VHS collapse */
          48%  { opacity: 0.3; transform: scaleY(0.3); }
          49%  { opacity: 0; transform: scaleY(0.04); }
          50%  { opacity: 0.6; transform: scaleY(1.15); filter: invert(1); }
          51%  { opacity: 0.3; transform: scaleY(1); filter: hue-rotate(0deg); }
          52%  { opacity: 0.7; clip-path: inset(25% 0 55% 0); transform: translate(-12px, 0); }
          54%  { opacity: 0.1; transform: translate(3px, 2px); filter: brightness(2) contrast(1.5); }
          55%  { opacity: 0.6; filter: hue-rotate(0deg); }
          57%  { opacity: 0.95; clip-path: inset(60% 0 18% 0); transform: translate(8px, -2px); filter: drop-shadow(4px 0 rgba(255,0,40,0.7)) drop-shadow(-4px 0 rgba(0,200,255,0.7)); }
          59%  { opacity: 0.05; transform: translate(-6px, 0); }
          61%  { opacity: 0.4; clip-path: inset(40% 0 40% 0); transform: translate(2px, 0); }
          63%  { opacity: 0.15; filter: hue-rotate(90deg) saturate(2); }
          /* ⑤b second VHS collapse */
          64%  { opacity: 0.85; transform: scaleY(0.4) translate(0, 0); filter: hue-rotate(0deg); }
          65%  { opacity: 0; transform: scaleY(0.03); }
          /* ⑥ last gasps */
          66%  { opacity: 0.7; transform: scaleY(1.18); filter: invert(1); }
          67%  { opacity: 0.95; transform: scaleY(1); filter: hue-rotate(0deg); clip-path: none; }
          68%  { opacity: 0.2; transform: translate(-4px, 0); }
          69%  { opacity: 0.88; clip-path: inset(0 0 50% 0); }
          70%  { opacity: 0.4; clip-path: none; transform: translate(6px, 0); }
          71%  { opacity: 0.8; transform: none; filter: drop-shadow(2px 0 rgba(255,0,40,0.4)) drop-shadow(-2px 0 rgba(0,200,255,0.4)); }
          72%  { opacity: 0.3; filter: hue-rotate(0deg); }
          /* ⑦ descent with mini-bursts */
          74%  { opacity: 0.55; clip-path: inset(30% 0 50% 0); transform: translate(-7px, 0); }
          75%  { opacity: 0.1; }
          77%  { opacity: 0.4; clip-path: none; transform: translate(4px, 0); filter: drop-shadow(1px 0 rgba(255,0,40,0.3)); }
          79%  { opacity: 0.08; filter: hue-rotate(0deg); }
          81%  { opacity: 0.3; transform: none; clip-path: inset(15% 0 70% 0); }
          82%  { opacity: 0.6; clip-path: none; }
          83%  { opacity: 0.05; transform: translate(-3px, 0); }
          85%  { opacity: 0.18; transform: none; }
          87%  { opacity: 0.4; clip-path: inset(50% 0 30% 0); }
          88%  { opacity: 0.02; clip-path: none; }
          90%  { opacity: 0.1; }
          92%  { opacity: 0.01; }
          95%  { opacity: 0; }
          100% { opacity: 0; transform: none; filter: hue-rotate(0deg); clip-path: none; }
        }

        @keyframes cb-glitch-new {
          0%, 8% { opacity: 0; transform: none; filter: hue-rotate(0deg); clip-path: none; }
          /* ② brief peeks during first burst */
          9%   { opacity: 0.2; clip-path: inset(55% 0 25% 0); transform: translate(10px, 0); }
          11%  { opacity: 0.45; clip-path: inset(15% 0 70% 0); transform: translate(-12px, 0); filter: drop-shadow(4px 0 rgba(255,0,40,0.6)) drop-shadow(-4px 0 rgba(0,200,255,0.6)); }
          13%  { opacity: 0.15; clip-path: inset(30% 0 60% 0); }
          15%  { opacity: 0.05; clip-path: none; filter: hue-rotate(0deg); }
          17%  { opacity: 0; }
          /* ③ hidden during false calm */
          22%  { opacity: 0; }
          32%  { opacity: 0; }
          /* ④ build-up peeks */
          33%  { opacity: 0.35; clip-path: inset(0 0 85% 0); }
          34%  { opacity: 0; }
          35%  { opacity: 0.7; clip-path: none; filter: contrast(2) brightness(1.3); }
          36%  { opacity: 0; filter: hue-rotate(0deg); }
          37%  { opacity: 0.5; transform: translate(5px, 0); }
          38%  { opacity: 0; transform: none; }
          /* ⑤ CLIMAX, cyber fights through */
          40%  { opacity: 0.4; clip-path: inset(15% 0 65% 0); transform: translate(8px, 0); filter: drop-shadow(3px 0 rgba(255,0,40,0.6)) drop-shadow(-3px 0 rgba(0,200,255,0.6)); }
          42%  { opacity: 0.1; clip-path: inset(50% 0 25% 0); transform: translate(-15px, 2px); }
          43%  { opacity: 0.85; transform: translate(0, 3px); filter: invert(1); }
          44%  { opacity: 0.3; clip-path: inset(30% 0 50% 0); transform: translate(-8px, 0); filter: hue-rotate(0deg); }
          46%  { opacity: 0.7; clip-path: none; transform: translate(5px, 0); }
          47%  { opacity: 0.4; clip-path: inset(20% 0 60% 0); }
          /* ⑤a first VHS collapse (mirrors old) */
          48%  { opacity: 0.8; transform: scaleY(0.3); }
          49%  { opacity: 1; transform: scaleY(0.04); filter: invert(1); }
          50%  { opacity: 0.4; transform: scaleY(1.15); filter: hue-rotate(0deg); }
          51%  { opacity: 0.75; transform: scaleY(1); }
          52%  { opacity: 0.4; clip-path: inset(50% 0 30% 0); transform: translate(11px, 0); }
          54%  { opacity: 0.95; clip-path: none; filter: contrast(1.6); }
          55%  { opacity: 0.55; clip-path: inset(25% 0 55% 0); transform: translate(-6px, 0); filter: hue-rotate(0deg); }
          57%  { opacity: 0.15; clip-path: none; }
          59%  { opacity: 0.9; transform: translate(4px, 0); filter: hue-rotate(40deg); }
          61%  { opacity: 0.4; clip-path: inset(35% 0 45% 0); filter: hue-rotate(0deg); }
          63%  { opacity: 0.95; clip-path: none; transform: translate(-3px, 0); }
          /* ⑤b second VHS collapse */
          64%  { opacity: 0.2; transform: scaleY(0.4); }
          65%  { opacity: 1; transform: scaleY(0.03); filter: invert(1); }
          /* ⑥ briefly yield to old's last gasp */
          66%  { opacity: 0.3; transform: scaleY(1.18); filter: hue-rotate(0deg); }
          67%  { opacity: 0.05; transform: scaleY(1); }
          68%  { opacity: 0.9; transform: translate(3px, 0); }
          69%  { opacity: 0.1; }
          70%  { opacity: 0.7; transform: translate(-2px, 0); }
          71%  { opacity: 0.2; }
          72%  { opacity: 0.85; clip-path: none; transform: none; }
          /* ⑦ stabilise (with own micro-glitches) */
          74%  { opacity: 0.5; transform: translate(4px, 0); filter: drop-shadow(2px 0 rgba(255,0,40,0.3)) drop-shadow(-2px 0 rgba(0,200,255,0.3)); }
          75%  { opacity: 1; transform: none; }
          77%  { opacity: 0.9; }
          79%  { opacity: 1; filter: hue-rotate(0deg); }
          81%  { opacity: 0.85; clip-path: inset(15% 0 70% 0); transform: translate(-2px, 0); }
          83%  { opacity: 1; clip-path: none; transform: none; }
          85%  { opacity: 0.92; filter: drop-shadow(1px 0 rgba(255,0,40,0.2)) drop-shadow(-1px 0 rgba(0,200,255,0.2)); }
          87%  { opacity: 1; }
          89%  { opacity: 0.95; filter: hue-rotate(0deg); transform: translate(1px, 0); }
          91%  { transform: none; }
          100% { opacity: 1; transform: none; filter: hue-rotate(0deg); clip-path: none; }
        }

        @keyframes cb-glitch-overlay {
          0%    { opacity: 0; }
          2%    { opacity: 0.3; }
          4%    { opacity: 0.1; }
          6%    { opacity: 0.45; }
          9%    { opacity: 0.85; }
          11%   { opacity: 0.4; }
          13%   { opacity: 0.75; }
          15%   { opacity: 0.5; }
          17%   { opacity: 0.25; }
          19%   { opacity: 0.4; }
          22%   { opacity: 0.1; }
          24%   { opacity: 0.18; }
          27%   { opacity: 0.05; }
          30%   { opacity: 0.25; }
          33%   { opacity: 0.5; }
          35%   { opacity: 0.9; }
          37%   { opacity: 0.65; }
          40%   { opacity: 0.8; }
          43%   { opacity: 1; }
          46%   { opacity: 0.45; }
          49%   { opacity: 1; }
          50%   { opacity: 0.2; }
          52%   { opacity: 0.9; }
          55%   { opacity: 0.55; }
          58%   { opacity: 0.95; }
          61%   { opacity: 0.45; }
          64%   { opacity: 0.85; }
          65%   { opacity: 1; }
          68%   { opacity: 0.55; }
          71%   { opacity: 0.7; }
          74%   { opacity: 0.4; }
          77%   { opacity: 0.5; }
          80%   { opacity: 0.3; }
          83%   { opacity: 0.45; }
          86%   { opacity: 0.2; }
          89%   { opacity: 0.25; }
          92%   { opacity: 0.1; }
          96%   { opacity: 0.05; }
          100%  { opacity: 0; }
        }

        @keyframes cb-scan-sweep {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(280%); }
        }

        .animate-cb-glitch-old {
          animation: cb-glitch-old 7.5s steps(200, end) forwards;
          will-change: transform, filter, clip-path, opacity;
          transform-origin: center;
        }
        .animate-cb-glitch-new {
          animation: cb-glitch-new 7.5s steps(200, end) forwards;
          will-change: transform, filter, clip-path, opacity;
          transform-origin: center;
        }
        .animate-cb-glitch-overlay {
          animation: cb-glitch-overlay 7.5s steps(150, end) forwards;
        }
        .animate-cb-scan-sweep {
          animation: cb-scan-sweep 0.9s linear infinite;
        }

        /* Defensive second line: the JS effect already routes around the
         * glitch phase under prefers-reduced-motion, so these animation
         * classes never apply there. This block only catches the edge case
         * where the user toggles the OS setting mid-animation. Same source
         * order + same specificity as the .animate-cb-* rules above, so
         * cascade wins without !important. */
        @media (prefers-reduced-motion: reduce) {
          .animate-cb-glitch-old,
          .animate-cb-glitch-new,
          .animate-cb-glitch-overlay,
          .animate-cb-scan-sweep {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
