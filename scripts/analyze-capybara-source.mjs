#!/usr/bin/env node
// Analyze the two source PNGs (capybara-logo.png + capybara-logo-cyber.png)
// to derive principled preprocessing parameters instead of guessing.
//
// We need to know: how does the cyber image differ from the old/reference
// image in terms of darkness, ink coverage, stroke density? Once we know
// that, we can pick a gain/subtract pair that makes cyber's RENDERED
// output match old's RENDERED output rather than tweaking blindly.

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  { label: 'OLD (reference)', file: 'public/capybara-logo.png' },
  { label: 'CYBER (current)', file: 'public/capybara-logo-cyber.png' },
];

async function analyze(label, fileRel) {
  const filePath = path.join(ROOT, fileRel);
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPx = info.width * info.height;
  const histogram = new Array(256).fill(0); // luminance histogram

  let inkSum = 0; // sum of (255-luminance) over all pixels — "total ink"
  let nonPaperCount = 0; // pixels with lum < 240 (anything not pure paper)
  let nonPaperInkSum = 0; // ink contribution from those

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogram[lum]++;
    inkSum += 255 - lum;
    if (lum < 240) {
      nonPaperCount++;
      nonPaperInkSum += 255 - lum;
    }
  }

  // Walk the histogram to compute percentiles exactly without sorting all pixels.
  function percentileLum(pct) {
    const target = totalPx * pct;
    let cum = 0;
    for (let lum = 0; lum < 256; lum++) {
      cum += histogram[lum];
      if (cum >= target) return lum;
    }
    return 255;
  }

  const p1 = percentileLum(0.01);
  const p5 = percentileLum(0.05);
  const p10 = percentileLum(0.10);
  const p25 = percentileLum(0.25);
  const p50 = percentileLum(0.50);
  const p75 = percentileLum(0.75);

  // Average luminance of "ink" pixels (non-paper)
  const inkAvgLum = nonPaperCount > 0 ? (255 - nonPaperInkSum / nonPaperCount) : 255;

  console.log(`\n## ${label} — ${fileRel}`);
  console.log(`Dimensions: ${info.width}×${info.height}, ${totalPx.toLocaleString()} px`);
  console.log(`Mean luminance (whole image): ${(255 - inkSum / totalPx).toFixed(1)}`);
  console.log(`Mean luminance of non-paper pixels (<240): ${inkAvgLum.toFixed(1)}`);
  console.log(`Non-paper pixel count: ${nonPaperCount.toLocaleString()} (${(100 * nonPaperCount / totalPx).toFixed(1)} %)`);
  console.log(`Total ink (sum of 255-lum): ${inkSum.toLocaleString()}`);
  console.log(`Average ink per pixel: ${(inkSum / totalPx).toFixed(1)}`);
  console.log(``);
  console.log(`Luminance percentiles (low = dark):`);
  console.log(`  P1  (darkest 1 %):  ${p1}`);
  console.log(`  P5  (darkest 5 %):  ${p5}`);
  console.log(`  P10:                ${p10}`);
  console.log(`  P25:                ${p25}`);
  console.log(`  P50 (median):       ${p50}`);
  console.log(`  P75:                ${p75}`);

  return {
    label,
    file: fileRel,
    width: info.width,
    height: info.height,
    totalPx,
    inkSum,
    inkAvgPerPx: inkSum / totalPx,
    nonPaperCount,
    nonPaperInkSum,
    inkAvgLum,
    percentiles: { p1, p5, p10, p25, p50, p75 },
  };
}

const results = [];
for (const { label, file } of TARGETS) {
  results.push(await analyze(label, file));
}

// Compare the two
const [old, cyber] = results;
console.log(`\n## COMPARISON\n`);
console.log(`Ink-per-pixel ratio (cyber / old): ${(cyber.inkAvgPerPx / old.inkAvgPerPx).toFixed(2)}x`);
console.log(`  → Cyber has ${((cyber.inkAvgPerPx / old.inkAvgPerPx - 1) * 100).toFixed(0)} % more ink per pixel than old.`);
console.log(`Non-paper density (cyber / old): ${((cyber.nonPaperCount / cyber.totalPx) / (old.nonPaperCount / old.totalPx)).toFixed(2)}x`);
console.log(`  → Cyber covers ${(100 * cyber.nonPaperCount / cyber.totalPx).toFixed(1)} % of image, old covers ${(100 * old.nonPaperCount / old.totalPx).toFixed(1)} %.`);
console.log(`Avg darkness of ink pixels: cyber ${cyber.inkAvgLum.toFixed(1)} vs old ${old.inkAvgLum.toFixed(1)}`);
console.log(`  → Cyber strokes are on average ${(old.inkAvgLum - cyber.inkAvgLum).toFixed(1)} luminance darker than old's.`);

console.log(`\n## DERIVED PARAMETERS\n`);
// To make cyber's RENDERED ink match old's: scale alpha of cyber so that
// total rendered ink (sum of alpha) equals old's. Approximation:
//   target_inkSum_cyber = old.inkAvgPerPx * cyber.totalPx
//   current_inkSum_cyber = cyber.inkSum
//   scale = target / current
const targetInkSum = old.inkAvgPerPx * cyber.totalPx;
const scale = targetInkSum / cyber.inkSum;
console.log(`To match old's ink density on a per-pixel basis:`);
console.log(`  Scale factor needed: ${scale.toFixed(2)}`);
console.log(`  → Effective gain ≈ ${scale.toFixed(2)} (with subtract held constant)`);

// Alternative: subtract enough to bring cyber's avg darkness up to old's
// alpha = (255-lum)*gain - subtract  → want avg alpha = old's avg ink
// At gain=1, want: avg_alpha = old.inkAvgPerPx
// avg_alpha = avg(255-lum) - subtract = cyber.inkAvgPerPx - subtract
// subtract = cyber.inkAvgPerPx - old.inkAvgPerPx
const subtractNeeded = cyber.inkAvgPerPx - old.inkAvgPerPx;
console.log(``);
console.log(`Alternative (subtract-only at gain=1.0):`);
console.log(`  Subtract value needed: ${subtractNeeded.toFixed(1)}`);
console.log(`  → BUT this would zero many mid-strokes; gain-based scaling preserves shape better.`);
