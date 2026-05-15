import { test, expect } from '@playwright/test';

// Cross-document View-Transitions: we ship an `@view-transition` CSS rule
// that opts the app into smooth cross-page transitions, and rely on
// document.startViewTransition being available in Chromium. Both facts
// must hold for the navigation crossfade to work.

test.describe('View Transitions', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
    });
  });

  test('@view-transition rule is served and startViewTransition is available', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.recharts-polar-angle-axis-tick');

    // The served CSS must include a @view-transition rule (either as raw
    // cssText or as a CSSViewTransitionRule instance, depending on Chromium
    // version).
    const ruleText = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (
              rule.cssText.includes('view-transition') ||
              rule.constructor.name === 'CSSViewTransitionRule'
            ) {
              return rule.cssText;
            }
          }
        } catch {
          // cross-origin sheet, skip
        }
      }
      return null;
    });
    expect(ruleText).not.toBeNull();
    expect(ruleText).toContain('view-transition');

    // The browser must expose document.startViewTransition for the
    // workaround's JS-triggered transitions to function.
    const startVTType = await page.evaluate(
      () => typeof document.startViewTransition,
    );
    expect(startVTType).toBe('function');
  });
});
