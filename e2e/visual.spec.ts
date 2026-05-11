import { test, expect } from '@playwright/test';
import path from 'path';

// Dump screenshots under `test-results/visual-snapshots/` so they can be
// reviewed manually after a refactor sweep. Asserts no `pageerror` events
// (real app crashes) but does NOT compare against baselines — produces
// fresh artefacts each run.

const SHOT_DIR = path.join('test-results', 'visual-snapshots');
const HYDRATE_MS = 2000;

// `fullPage: false` for routes with very long content (long tables) — fullPage
// screenshots there exceed memory budgets. `waitFor` is a selector for the
// post-loading content marker; without it, screenshots may capture the
// route's loading state when API responses arrive after networkidle.
const STATIC_ROUTES: Array<{ name: string; path: string; fullPage?: boolean; waitFor?: string }> = [
  { name: 'home',           path: '/',                                        waitFor: 'text=Publikationen gesamt' },
  { name: 'review',         path: '/review',         fullPage: false },
  { name: 'publications',   path: '/publications',                            waitFor: 'text=Publikationen' },
  { name: 'press-releases', path: '/press-releases', fullPage: false,         waitFor: 'text=Pressemitteilungen' },
  { name: 'researchers',    path: '/researchers',                             waitFor: 'text=Forscher:innen' },
  { name: 'upload',         path: '/upload' },
  { name: 'settings',       path: '/settings' },
  { name: 'not-found',      path: '/this-page-truly-does-not-exist-xyz' },
];

const THEMES = ['light', 'dark'] as const;
type Theme = typeof THEMES[number];

async function withTheme(page: import('@playwright/test').Page, ctx: import('@playwright/test').BrowserContext, theme: Theme) {
  await ctx.addInitScript((t) => {
    window.sessionStorage.setItem('storyscout-auth-marker', '1');
    window.localStorage.setItem('theme', t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

test.describe('Visual: static routes × theme', () => {
  for (const { name, path: route, fullPage = true, waitFor } of STATIC_ROUTES) {
    for (const theme of THEMES) {
      test(`${name} — ${theme}`, async ({ page, context }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

        await withTheme(page, context, theme);
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        if (waitFor) {
          await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 30_000 });
        }
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
        await page.waitForTimeout(HYDRATE_MS);

        await page.screenshot({
          path: path.join(SHOT_DIR, `${name}-${theme}.png`),
          fullPage,
        });

        expect(errors, `pageerror events on ${name}-${theme}: ${errors.join(' | ')}`).toHaveLength(0);
      });
    }
  }
});

test.describe('Visual: dynamic detail pages', () => {
  for (const theme of THEMES) {
    test(`publication detail — ${theme}`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await withTheme(page, context, theme);

      const r = await page.request.get('/api/review/queue');
      const body = await r.json();
      const id = (body?.publications ?? [])[0]?.id;
      test.skip(!id, 'no publications in /api/review/queue');

      await page.goto(`/publications/${id}`, { waitUntil: 'domcontentloaded' });
      // Wait for the actual content (h1 with the title) — the loading state
      // shows just "Lade Publikation..." in a <p>, not an h1.
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      await page.waitForTimeout(HYDRATE_MS);

      await page.screenshot({
        path: path.join(SHOT_DIR, `publication-detail-${theme}.png`),
        fullPage: true,
      });

      expect(errors).toHaveLength(0);
    });
  }

  for (const theme of THEMES) {
    test(`person detail (activity chart) — ${theme}`, async ({ page, context }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await withTheme(page, context, theme);

      // Pull a person id off /api/researchers/top — endpoint requires
      // since=YYYY-MM-DD (one year back covers most active researchers).
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const since = oneYearAgo.toISOString().slice(0, 10);
      const r = await page.request.get(`/api/researchers/top?since=${since}&metric=count_high`);
      const body = await r.json();
      const personId = (body?.rows ?? [])[0]?.person_id;
      test.skip(!personId, 'no researchers from /api/researchers/top');

      await page.goto(`/persons/${personId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
      await page.waitForTimeout(HYDRATE_MS);

      await page.screenshot({
        path: path.join(SHOT_DIR, `person-detail-${theme}.png`),
        fullPage: true,
      });

      expect(errors).toHaveLength(0);
    });
  }
});

test.describe('Visual: interactive states', () => {
  for (const theme of THEMES) {
    test(`mobile sheet on /review — ${theme}`, async ({ page, context }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await withTheme(page, context, theme);
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/review', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      await page.waitForTimeout(HYDRATE_MS);

      // Wait for cards to actually render (queue API can be slow first call).
      const firstCard = page.locator('div.md\\:hidden a[href^="/publications/"]').first();
      try {
        await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
      } catch {
        test.skip(true, 'no mobile cards visible — empty queue or slow API');
        return;
      }

      // Use the DOM's native click() method via page.evaluate — this fires
      // a synthetic MouseEvent that React's event system recognises, while
      // bypassing Playwright's mouse-simulation auto-wait that can hang on
      // WSL2 + chromium-headless when the onClick calls preventDefault().
      await firstCard.evaluate((el) => (el as HTMLElement).click());

      // Sheet opens via Radix Portal — wait for visible dialog content.
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8_000 });

      // Drop fullPage to avoid OOM crashes on WSL2; the sheet IS the overlay.
      await page.screenshot({
        path: path.join(SHOT_DIR, `review-mobile-sheet-${theme}.png`),
      });

      expect(errors).toHaveLength(0);
    });
  }

  for (const theme of THEMES) {
    test(`enrichment modal on /publications — ${theme}`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await withTheme(page, context, theme);
      await page.goto('/publications');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(HYDRATE_MS);

      // Enrichment / Analyse cards have a "Starten"-button — first one is Enrichment.
      const startBtn = page.getByRole('button', { name: 'Starten' }).first();
      await startBtn.click();
      await page.waitForTimeout(600);

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

      await page.screenshot({
        path: path.join(SHOT_DIR, `enrichment-modal-${theme}.png`),
      });

      expect(errors).toHaveLength(0);
    });
  }

  for (const theme of THEMES) {
    test(`researchers distribution (beeswarm) — ${theme}`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await withTheme(page, context, theme);
      await page.goto('/researchers');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(HYDRATE_MS);

      const distroTab = page.getByRole('tab', { name: 'Verteilung' });
      await distroTab.click();
      await page.waitForTimeout(1500); // d3-force layout sim

      await page.screenshot({
        path: path.join(SHOT_DIR, `researchers-beeswarm-${theme}.png`),
        fullPage: true,
      });

      expect(errors).toHaveLength(0);
    });
  }
});
