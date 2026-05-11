import { test } from '@playwright/test';
import path from 'path';

// Captures README screenshots into public/screenshots/.
// Light theme only — GitHub README renders in user theme; one variant
// is enough for the landing page. Five money-shots covering the
// triage workflow + browse surfaces + a detail view.
//
// Run with:
//   npx playwright test e2e/capture-screenshots.spec.ts
//
// `reuseExistingServer: true` in playwright.config.ts means this
// reuses an already-running `npm run dev` if available, otherwise
// starts one.

const SHOT_DIR = path.join('public', 'screenshots');
const HYDRATE_MS = 2500;

const STATIC_SHOTS: Array<{
  name: string;
  path: string;
  fullPage?: boolean;
  waitFor?: string;
}> = [
  {
    name: 'dashboard',
    path: '/',
    waitFor: 'text=Publikationen gesamt',
    fullPage: true,
  },
  {
    name: 'review',
    path: '/review',
    fullPage: false,
    // /api/review/queue can take 15-22s to return the ranked 38k pubs;
    // wait for a real queue row (publication anchor) before screenshot.
    waitFor: 'a[href^="/publications/"]',
  },
  {
    name: 'publications',
    path: '/publications',
    waitFor: 'text=Publikationen',
    fullPage: false,
  },
  {
    name: 'press-releases',
    path: '/press-releases',
    waitFor: 'text=Pressemitteilungen',
    fullPage: false,
  },
];

test.describe('README screenshots', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
      window.localStorage.setItem('theme', 'light');
    });
  });

  for (const { name, path: route, fullPage = false, waitFor } of STATIC_SHOTS) {
    test(`capture ${name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      if (waitFor) {
        await page
          .locator(waitFor)
          .first()
          .waitFor({ state: 'visible', timeout: 30_000 });
      }
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      await page.waitForTimeout(HYDRATE_MS);

      await page.screenshot({
        path: path.join(SHOT_DIR, `${name}.png`),
        fullPage,
      });
    });
  }

  test('capture publication-detail', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });

    const r = await page.request.get('/api/review/queue');
    const body = await r.json();
    const id = (body?.publications ?? [])[0]?.id;
    test.skip(!id, 'no publications in /api/review/queue');

    await page.goto(`/publications/${id}`, { waitUntil: 'domcontentloaded' });
    await page
      .locator('h1')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(HYDRATE_MS);

    await page.screenshot({
      path: path.join(SHOT_DIR, 'publication-detail.png'),
      fullPage: true,
    });
  });
});
