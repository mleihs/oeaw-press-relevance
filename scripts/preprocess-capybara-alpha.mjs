#!/usr/bin/env node
// One-shot: convert pencil-sketch PNGs (dark lines on white paper) to
// true-alpha versions where the paper becomes transparent. Removes the
// need for mix-blend-multiply in CSS, which breaks inside filter/transform
// stacking contexts during the gate glitch animation.
//
// Formula: alpha = clamp((255 - luminance) * gain - subtract); rgb_out is
// either (0,0,0) (gate targets) or the original rgb (logo targets, see the
// `preserveRgb` note on TARGETS below).
// Math (rgb=0 case): alpha-blend against any backdrop bg gives
//   out = bg * (1 - alpha/255)
// At gain=1.0 + subtract=0 this is mathematically identical to mix-blend-multiply
// of the original pencil pixel; the pencil's full tonal range survives.
// (rgb-preserved case): the paper still goes transparent via the same alpha
// matte, but the surviving pixels keep the artwork's real graphite colour.
// gain>1 boosts opacity of dark/mid-tones, useful when the image sits over a
// backdrop-blur stack that visually washes out a 1:1 multiply (e.g. the gate
// overlay). Too high clamps dark pixels at 255 and the pencil starts looking
// like marker, so reserve for contexts that need it (gate yes, logo no).
// subtract>0 pulls all alphas down uniformly, killing the outer anti-aliased
// halo around strokes. The halo is what makes strokes look "thicker than they
// are" after a big downscale (1024→140 for the logo). Trimming it sharpens
// the perceived line width without changing the stroke core.
// Threshold: pixels brighter than 245 luminance go fully transparent
// (prevents a faint cream haze across the whole image rectangle).

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Per-target gain + subtract. Gate images get boosted (sit on cream/80 +
// backdrop-blur, which dampens the multiply effect). Logo images stay at
// gain=1.0 (clean hero backdrop, natural pencil shading preserved) with a
// subtract pass to trim the anti-aliased halo from the 1024→140 downscale.
//
// Gate old=1.3 stays (the boot "start" frame, looks right). The cyber gate
// "end" frame is the same scene but a denser source, so at equal gain it
// rendered noticeably darker than the start. gate-cyber gain trimmed to ~1.2
// so the end frame matches the start (measured target: meanInkAlpha 113->~104,
// meanAllPx 89->~82, i.e. onto the gate-old reference). Gate-only change.
// `preserveRgb`: gate targets force rgb=(0,0,0) so the alpha-blend is a
// mathematically exact mix-blend-multiply of the pencil onto the cream/
// blurred gate backdrop (the look that was tuned there — do not change).
// Logo targets keep the ORIGINAL rgb: the dashboard hero now sits on the
// plain page background, so a true cutout of the actual pencil artwork
// (warm graphite tone preserved, paper turned transparent) reads better
// and is theme-/glitch-safe (clip-path/invert still act on a transparent
// rectangle). Same alpha formula either way — only the colour channels
// differ. Logo gain raised to 3.0 (subtract 0) for the Science-Propaganda-Ninja
// art: the alpha = (255-lum)*gain matte makes opacity proportional to darkness,
// which suits sparse LINE art but greys out a fully-SHADED illustration — a
// mid-tone graphite pixel (lum~150) lands at ~60% alpha and blends toward the
// white page, so the hero looked washed out at gain 1.0/1.5. gain 3.0 pushes
// every non-paper pixel (down to mid-grey) to full opacity, preserving the art's
// true graphite tone; only near-white paper (lum>245 threshold) stays transparent
// so dark mode still works. preserveRgb keeps the real pencil colour.
const TARGETS = [
  { input: 'public/capybara-gate.png',       output: 'public/capybara-gate-alpha.png',       gain: 1.3,  subtract: 0,  preserveRgb: false },
  { input: 'public/capybara-gate-cyber.png', output: 'public/capybara-gate-cyber-alpha.png', gain: 1.2,  subtract: 0,  preserveRgb: false },
  { input: 'public/capybara-logo.png',       output: 'public/capybara-logo-alpha.png',       gain: 3.0,  subtract: 0,  preserveRgb: true  },
  { input: 'public/capybara-logo-cyber.png', output: 'public/capybara-logo-cyber-alpha.png', gain: 0.85, subtract: 20, preserveRgb: true  },
];

const TRANSPARENT_THRESHOLD = 245;

async function preprocess(inputRel, outputRel, gain, subtract, preserveRgb) {
  const input = path.join(ROOT, inputRel);
  const output = path.join(ROOT, outputRel);

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`Expected RGBA, got ${info.channels} channels`);
  }

  const out = Buffer.alloc(data.length);
  let transparentCount = 0;
  let opaqueCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let alpha;
    if (lum >= TRANSPARENT_THRESHOLD) {
      alpha = 0;
    } else {
      alpha = Math.max(0, Math.min(255, Math.round((255 - lum) * gain - subtract)));
    }
    // Count by ACTUAL alpha state, not by threshold: pixels that fall to
    // alpha=0 via subtract are effectively transparent, even though they
    // weren't above the luminance threshold.
    if (alpha === 0) transparentCount++;
    else opaqueCount++;
    // Gate: rgb_out=0 so alpha-blend == mix-blend-multiply exactly.
    // Logo: keep original rgb so the cutout is the real pencil artwork
    // (tone/warmth preserved), not a flat-black silhouette.
    out[i] = preserveRgb ? r : 0;
    out[i + 1] = preserveRgb ? g : 0;
    out[i + 2] = preserveRgb ? b : 0;
    out[i + 3] = alpha;
  }

  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(output);

  const totalPixels = info.width * info.height;
  console.log(`${inputRel} → ${outputRel}`);
  console.log(`  ${info.width}×${info.height}, ${totalPixels.toLocaleString()} px`);
  console.log(`  Transparent: ${transparentCount.toLocaleString()} (${(100 * transparentCount / totalPixels).toFixed(1)} %)`);
  console.log(`  Opaque/translucent: ${opaqueCount.toLocaleString()} (${(100 * opaqueCount / totalPixels).toFixed(1)} %)`);
}

for (const { input, output, gain, subtract, preserveRgb } of TARGETS) {
  await preprocess(input, output, gain, subtract, preserveRgb);
}

console.log('\nDone.');
