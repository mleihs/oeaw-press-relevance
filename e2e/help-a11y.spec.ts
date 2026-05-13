import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Phase 4 — A11y audit on representative KB pages. Runs axe-core against the
// pages users land on first (index) plus three deep pages spanning the layout
// variants (anchored heading, table, code block, callout, Steps component).
//
// `disableRules: ['region']` because Fumadocs's DocsBody isn't wrapped in a
// <section> — it sits inside <main> which is the actual landmark. The "region"
// rule flags text outside named regions, which is a stylistic over-call here.

const ROUTES = [
  '/help',
  '/help/scores/dimensionen',
  '/help/forscher-metriken/metriken',
  '/help/grundlagen/workflow',
] as const;

test.describe('Hilfe-Center A11y', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
    });
  });

  for (const route of ROUTES) {
    test(`axe-core: ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .disableRules(['region'])
        .analyze();

      // Surface violation details in failure output so we can fix them.
      if (results.violations.length > 0) {
        console.log(JSON.stringify(results.violations, null, 2));
      }
      expect(results.violations).toEqual([]);
    });
  }
});
