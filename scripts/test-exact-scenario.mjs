#!/usr/bin/env node
// EXACT scenario: load dashboard, capture top-3 pub titles, click axis,
// verify the top-3 actually changed.

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

console.log('STEP 1: Load dashboard at default sort (Story Score).');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.recharts-polar-angle-axis-tick');
await page.waitForTimeout(500);

async function topPubTitles() {
  // The Top-Pubs links are `<a href="/publications/{id}">…<p class="font-medium text-sm truncate ...">{title}</p>…</a>`
  const items = page.locator('a[href^="/publications/"] p.font-medium').first();
  await items.waitFor({ timeout: 5000 });
  const all = await page.locator('a[href^="/publications/"] p.font-medium.truncate').allTextContents();
  return all.slice(0, 5);
}

const before = await topPubTitles();
console.log('  Top 5 by Story Score:');
before.forEach((t, i) => console.log(`    ${i+1}. ${t}`));

console.log('\nSTEP 2: Click "Gesellschaftl. Relevanz".');
const target = page.locator('.recharts-polar-angle-axis text', { hasText: 'Gesellschaftl. Relevanz' }).first();
await target.scrollIntoViewIfNeeded();
await target.click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);

console.log('\nSTEP 3: Check URL + capture top-5 again.');
console.log('  URL:', page.url());
console.log('  Has sortBy=relevance:', page.url().includes('sortBy=relevance'));

const after = await topPubTitles();
console.log('  Top 5 by Gesellschaftliche Relevanz:');
after.forEach((t, i) => console.log(`    ${i+1}. ${t}`));

console.log('\nSTEP 4: Diff.');
const changed = JSON.stringify(before) !== JSON.stringify(after);
console.log('  Lists differ?', changed ? '✅ YES (sort applied)' : '❌ NO (server-sort NOT applied!)');

if (!changed) {
  // Inspect the server response directly
  console.log('\nSTEP 5: Direct server probe to see if /?sortBy=relevance returns different HTML.');
  const r1 = await fetch('http://localhost:3000/');
  const h1 = await r1.text();
  const r2 = await fetch('http://localhost:3000/?sortBy=relevance');
  const h2 = await r2.text();
  console.log('  Same HTML?', h1 === h2);
  console.log('  / length:', h1.length, '  ?sortBy=relevance length:', h2.length);
}

await browser.close();
