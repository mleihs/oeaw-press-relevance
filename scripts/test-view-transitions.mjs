#!/usr/bin/env node
// Verify that the cross-document View-Transition rule is present in the
// served CSS and that Chromium picks it up as a real transition. Also
// captures before/during/after screenshots for visual confirmation.

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.recharts-polar-angle-axis-tick');

console.log('1. Verify @view-transition rule is in the served CSS.');
const hasRule = await page.evaluate(() => {
  const sheets = Array.from(document.styleSheets);
  for (const sheet of sheets) {
    try {
      const rules = Array.from(sheet.cssRules);
      for (const rule of rules) {
        if (rule.cssText.includes('view-transition') || rule.constructor.name === 'CSSViewTransitionRule') {
          return rule.cssText;
        }
      }
    } catch {
      // cross-origin sheet, skip
    }
  }
  return null;
});
console.log('   rule:', hasRule ?? 'NOT FOUND');

console.log('\n2. Check whether the browser exposes startViewTransition.');
const startViewTransitionSupported = await page.evaluate(() => typeof document.startViewTransition);
console.log('   typeof document.startViewTransition:', startViewTransitionSupported);

console.log('\n3. Probe ::view-transition pseudo-element resolution.');
const oldStyle = await page.evaluate(() => {
  // Force-trigger a transition via JS so we can inspect computed styles on
  // the pseudo-elements while the transition is mid-flight.
  if (!document.startViewTransition) return { supported: false };
  return new Promise((resolve) => {
    const transition = document.startViewTransition(() => {
      // No DOM change — just to peek at the pseudo-element defaults.
    });
    transition.ready.then(() => {
      // Get computed style of the ::view-transition-old(root) pseudo.
      const old = window.getComputedStyle(document.documentElement, '::view-transition-old(root)');
      const nw = window.getComputedStyle(document.documentElement, '::view-transition-new(root)');
      resolve({
        supported: true,
        oldAnimationName: old.animationName,
        oldAnimationDuration: old.animationDuration,
        newAnimationName: nw.animationName,
        newAnimationDuration: nw.animationDuration,
      });
    });
  });
});
console.log('   ', oldStyle);

console.log('\n4. Click radar axis and screenshot during the navigation.');
const target = page.locator('.recharts-polar-angle-axis text', { hasText: 'Erzählpotenzial' }).first();
await target.scrollIntoViewIfNeeded();

await page.screenshot({ path: '/tmp/vt-before.png', fullPage: false });
const navPromise = page.waitForLoadState('networkidle');
await target.click();
// Capture mid-transition (within the first 100ms)
await page.waitForTimeout(80);
await page.screenshot({ path: '/tmp/vt-during.png', fullPage: false });
await navPromise;
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/vt-after.png', fullPage: false });
console.log('   URL after click:', page.url());
console.log('   Screenshots: /tmp/vt-before.png /tmp/vt-during.png /tmp/vt-after.png');

await browser.close();
