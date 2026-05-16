#!/usr/bin/env node
// One-shot: convert pencil-sketch PNGs (dark lines on white paper) to
// true-alpha versions where the paper becomes transparent. Removes the
// need for mix-blend-multiply in CSS, which breaks inside filter/transform
// stacking contexts during the gate glitch animation.
//
// Formula: rgb_out = (0, 0, 0), alpha = clamp((255 - luminance) * gain - subtract).
// Math: alpha-blend with rgb=0 against any backdrop bg gives
//   out = bg * (1 - alpha/255)
// At gain=1.0 + subtract=0 this is mathematically identical to mix-blend-multiply
// of the original pencil pixel; the pencil's full tonal range survives.
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
const TARGETS = [
  { input: 'public/capybara-gate.png',       output: 'public/capybara-gate-alpha.png',       gain: 1.3, subtract: 0 },
  { input: 'public/capybara-gate-cyber.png', output: 'public/capybara-gate-cyber-alpha.png', gain: 1.2, subtract: 0 },
  // Logo subtract is higher than gate's because the 1024→140 downscale
  // creates a chunky anti-aliasing halo.
  // Cyber gain history: 0.40 (over-corrected, washed out, lines invisible)
  // → 0.67 (the 1/1.49 ink-per-pixel match to the old reference: same
  // aggregate mass, but per-stroke opacity ~71 vs old's ~92, so individual
  // lines still read pale) → 0.85 (matches/exceeds the old's per-stroke
  // darkness; with cyber's 1.49x denser linework this gives the punchy,
  // un-washed dashboard hero the eye expects). Peak ink at gain 0.85 is
  // ~197/255, well below the 255 clamp, so it stays pencil, not marker.
  // subtract stays 20 for the 1254→140 downscale halo trim.
  { input: 'public/capybara-logo.png',       output: 'public/capybara-logo-alpha.png',       gain: 1.0, subtract: 40 },
  { input: 'public/capybara-logo-cyber.png', output: 'public/capybara-logo-cyber-alpha.png', gain: 0.85, subtract: 20 },
];

const TRANSPARENT_THRESHOLD = 245;

async function preprocess(inputRel, outputRel, gain, subtract) {
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
    // rgb_out = 0 so alpha-blend math matches mix-blend-multiply exactly.
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
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

for (const { input, output, gain, subtract } of TARGETS) {
  await preprocess(input, output, gain, subtract);
}

console.log('\nDone.');
