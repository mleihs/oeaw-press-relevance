#!/usr/bin/env node
// Deep-dive: what nav-primitives actually work on this Next.js 16 setup?

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
page.on('console', (msg) => {
  if (msg.text().includes('[router-test]')) console.log('  [page]', msg.text());
});
page.on('pageerror', (err) => console.log('  [page error]', err.message));

console.log('1. Navigate to /');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

console.log('\n2. Inject router-test instrumentation + try a battery of nav primitives.');
const probe = await page.evaluate(async () => {
  const results = [];

  function recordUrl(label) {
    results.push(`${label} → ${window.location.href}`);
  }
  recordUrl('initial');

  // (a) window.history.pushState
  window.history.pushState({}, '', '/?sortBy=novelty');
  await new Promise((r) => setTimeout(r, 100));
  recordUrl('after pushState');

  // Reset
  window.history.pushState({}, '', '/');
  await new Promise((r) => setTimeout(r, 100));
  recordUrl('reset to /');

  // (b) Try to grab Next.js router from globals
  // The router is accessible via React internals or a global hook injection.
  // Easier: dispatch a click on the existing period-tab Link with full URL.
  const yearLink = document.querySelector('a[href*="period=year"]');
  results.push(`yearLink found: ${!!yearLink}, href=${yearLink?.getAttribute('href')}`);

  // (c) Try clicking the link via dispatchEvent of a real MouseEvent
  if (yearLink) {
    yearLink.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
    }));
    await new Promise((r) => setTimeout(r, 200));
    recordUrl('after dispatchEvent click on yearLink');
  }

  // (d) Direct anchor.click()
  if (yearLink) {
    yearLink.click();
    await new Promise((r) => setTimeout(r, 200));
    recordUrl('after yearLink.click()');
  }

  // (e) Try window.history.pushState + popstate event (manual SPA simulation)
  window.history.pushState({}, '', '/?sortBy=novelty');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await new Promise((r) => setTimeout(r, 500));
  recordUrl('after pushState + popstate event');

  return results;
});

probe.forEach((line) => console.log('   ', line));

console.log('\n3. Inspect: does the page CONTENT update after pushState?');
const beforeContent = await page.locator('text=/Top \\d+ Publikationen/').first().textContent();
console.log('   Heading before:', beforeContent?.trim());

// Soft re-navigation: pushState then dispatch popstate (manual SPA trigger)
await page.evaluate(() => {
  window.history.pushState({}, '', '/?sortBy=storytelling');
  window.dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForTimeout(1000);
const afterContent = await page.locator('text=/Top \\d+ Publikationen/').first().textContent();
console.log('   Heading after pushState+popstate:', afterContent?.trim());
console.log('   URL:', page.url());

// Search params from server-rendered DOM?
const sortPillCount = await page.locator('text=/Sortiert:/').count();
console.log('   Sort pill in DOM after popstate:', sortPillCount);

await browser.close();
