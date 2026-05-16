'use client';

import { forwardRef } from 'react';
import {
  AnimateNumber as MotionAnimateNumber,
  type AnimateNumberProps,
} from 'motion-number';

/**
 * App-wide `AnimateNumber` that is SSR-deterministic by default.
 *
 * motion-number formats via `Intl` using the *runtime* locale. The server
 * (Node's default locale) and the browser (de-AT here) disagree on the
 * thousands separator (`36,614` vs `36.614`), which trips a React hydration
 * mismatch on any number >= 1000. Pinning the app's Austrian locale makes
 * server and client format identically. Callers can still override `locales`
 * or `format` (props spread after the default).
 *
 * Always import AnimateNumber from here, never from 'motion-number' directly,
 * so no call site can reintroduce the mismatch by forgetting `locales`.
 */
export const AnimateNumber = forwardRef<HTMLDivElement, AnimateNumberProps>(
  function AnimateNumber(props, ref) {
    return <MotionAnimateNumber ref={ref} locales="de-AT" {...props} />;
  },
);
