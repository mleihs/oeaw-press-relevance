import { test, expect } from '@playwright/test';

// Next.js 16 client-nav regression: router.push/replace and <Link> clicks
// no-op on query-only URL updates. The shipped workaround is plain anchor
// navigation (window.location.assign / <a>). This test guards against the
// workaround being silently reverted by verifying that clicking a
// period-tab Link actually changes window.location.

test.describe('Next.js 16 client-nav workaround', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
    });
  });

  test('clicking a period-tab anchor actually navigates the URL', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const before = page.url();

    // Period tabs render as anchors with `?period=year` (or similar). The
    // workaround relies on real navigation, so clicking the link MUST update
    // window.location.
    const yearLink = page.locator('a[href*="period=year"]').first();
    await expect(yearLink).toBeVisible();
    await yearLink.click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toBe(before);
    expect(page.url()).toContain('period=year');
  });
});
