#!/usr/bin/env node
// One-shot Playwright probe of the dashboard radar's click-to-sort.

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', (msg) => console.log(`  [page:${msg.type()}]`, msg.text()));
page.on('pageerror', (err) => console.log('  [page error]', err.message));

console.log('1. Navigate to dashboard.');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.recharts-polar-angle-axis-tick', { timeout: 10000 });

console.log('\n2. Check pre-click state.');
const headingBefore = await page.locator('.text-base', { hasText: 'Top' }).first().textContent();
console.log('   Heading:', headingBefore?.trim());
const pillBefore = await page.locator('text=/Sortiert:/').count();
console.log('   Sort pill count:', pillBefore);

console.log('\n3. Click "Erzählpotenzial" axis.');
const target = page.locator('.recharts-polar-angle-axis text', { hasText: 'Erzählpotenzial' }).first();
await target.scrollIntoViewIfNeeded();
await target.click();
await page.waitForLoadState('networkidle');
console.log('   URL:', page.url());

console.log('\n4. Check post-click state.');
const headingAfter = await page.locator('.text-base', { hasText: 'Top' }).first().textContent();
console.log('   Heading:', headingAfter?.trim());
const pillAfter = await page.locator('text=/Sortiert:/').count();
console.log('   Sort pill count:', pillAfter);
const dimBadges = await page.locator('text=/Erzählpotenzial \\d+/').count();
console.log('   Dimension badges on pubs:', dimBadges);

console.log('\n5. Click axis again to toggle off.');
const target2 = page.locator('.recharts-polar-angle-axis text', { hasText: 'Erzählpotenzial' }).first();
await target2.scrollIntoViewIfNeeded();
await target2.click();
await page.waitForLoadState('networkidle');
console.log('   URL after toggle:', page.url());

console.log('\n6. Click pill X to verify clear-sort still wired.');
await page.goto('http://localhost:3000/?sortBy=novelty', { waitUntil: 'networkidle' });
await page.waitForSelector('text=/Sortiert:/', { timeout: 5000 });
const pillBtn = page.locator('button', { hasText: 'Sortiert:' }).first();
const pillBtnCount = await pillBtn.count();
console.log('   Pill button count:', pillBtnCount);
if (pillBtnCount > 0) {
  await pillBtn.click();
  await page.waitForLoadState('networkidle');
  console.log('   URL after pill X click:', page.url());
}

await browser.close();
console.log('\nDone.');
