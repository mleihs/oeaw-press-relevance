#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.text().includes('[nav') || m.text().includes('navigate')) console.log('  [page]', m.text()); });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.recharts-polar-angle-axis-tick');

// List the actual rendered axis labels
const labels = await page.locator('.recharts-polar-angle-axis text').allTextContents();
console.log('Rendered axis labels:', labels);

// Click each label and verify URL change
const expected = {
  'Verständlichkeit': 'accessibility',
  'Gesellschaftl. Relevanz': 'relevance',
  'Neuheit': 'novelty',
  'Erzählpotenzial': 'storytelling',
  'Aktualität': 'timeliness',
};

for (const [label, expectedKey] of Object.entries(expected)) {
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.recharts-polar-angle-axis-tick');
  const tgt = page.locator('.recharts-polar-angle-axis text', { hasText: label }).first();
  const count = await tgt.count();
  if (count === 0) {
    console.log(`  ❌ "${label}" not found on radar`);
    continue;
  }
  await tgt.scrollIntoViewIfNeeded();
  await tgt.click();
  await page.waitForLoadState('networkidle');
  const url = page.url();
  const ok = url.includes(`sortBy=${expectedKey}`);
  console.log(`  ${ok ? '✅' : '❌'} ${label} → ${url}`);
}

await browser.close();
