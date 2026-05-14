#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.recharts-polar-angle-axis-tick');
const t = page.locator('.recharts-polar-angle-axis text', { hasText: 'Erzählpotenzial' }).first();
await t.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

// Idle screenshot of the radar
const radar = page.locator('svg.recharts-surface').first();
await radar.screenshot({ path: '/tmp/radar-idle.png' });

await t.hover();
await page.waitForTimeout(400);
await radar.screenshot({ path: '/tmp/radar-hover.png' });

await t.click();
await page.waitForLoadState('networkidle');
await page.waitForSelector('.recharts-polar-angle-axis-tick');
const tActive = page.locator('.recharts-polar-angle-axis text', { hasText: 'Erzählpotenzial' }).first();
await tActive.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const radar2 = page.locator('svg.recharts-surface').first();
await radar2.screenshot({ path: '/tmp/radar-active.png' });

console.log('Screenshots written: /tmp/radar-idle.png /tmp/radar-hover.png /tmp/radar-active.png');
await browser.close();
