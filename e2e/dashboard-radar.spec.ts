import { test, expect } from '@playwright/test';

// Dashboard radar click-to-sort. The radar's polar-angle-axis labels are
// interactive: clicking a label sets ?sortBy=<key> and re-sorts the Top-Pubs
// list server-side. These tests cover the happy path, the full axis-to-key
// mapping for all 5 dimensions, and the visible effect on the pub list.

test.describe('dashboard radar click-to-sort', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
    });
  });

  test('clicking an axis updates URL, heading and Sortiert-pill', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.recharts-polar-angle-axis-tick', { timeout: 10_000 });

    // Pre-click: no Sortiert-pill should be present at default sort.
    expect(await page.locator('text=/Sortiert:/').count()).toBe(0);

    const target = page
      .locator('.recharts-polar-angle-axis text', { hasText: 'Erzählpotenzial' })
      .first();
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForLoadState('networkidle');

    // URL carries the storytelling sort key.
    expect(page.url()).toContain('sortBy=storytelling');

    // Sortiert-pill is now visible.
    await expect(page.locator('text=/Sortiert:/').first()).toBeVisible();

    // Pill clear-button: navigating directly to a sorted URL exposes the pill,
    // clicking it removes the sortBy param.
    await page.goto('/?sortBy=novelty');
    await page.waitForSelector('text=/Sortiert:/', { timeout: 5_000 });
    const pillBtn = page.locator('button', { hasText: 'Sortiert:' }).first();
    await expect(pillBtn).toBeVisible();
    await pillBtn.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('sortBy=');
  });

  test('each of the 5 axes maps to the correct sortBy key', async ({ page }) => {
    const axisToKey: Record<string, string> = {
      'Verständlichkeit': 'accessibility',
      'Gesellschaftl. Relevanz': 'relevance',
      'Neuheit': 'novelty',
      'Erzählpotenzial': 'storytelling',
      'Aktualität': 'timeliness',
    };

    for (const [label, expectedKey] of Object.entries(axisToKey)) {
      await page.goto('/');
      await page.waitForSelector('.recharts-polar-angle-axis-tick');
      const tgt = page
        .locator('.recharts-polar-angle-axis text', { hasText: label })
        .first();
      await expect(tgt).toHaveCount(1);
      await tgt.scrollIntoViewIfNeeded();
      await tgt.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain(`sortBy=${expectedKey}`);
    }
  });

  test('top-5 pub titles actually change after a radar click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.recharts-polar-angle-axis-tick');

    const titlesSel = 'a[href^="/publications/"] p.font-medium.truncate';
    await page.locator(titlesSel).first().waitFor({ timeout: 5_000 });
    const before = (await page.locator(titlesSel).allTextContents()).slice(0, 5);
    expect(before.length).toBeGreaterThan(0);

    const target = page
      .locator('.recharts-polar-angle-axis text', { hasText: 'Gesellschaftl. Relevanz' })
      .first();
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('sortBy=relevance');

    await page.locator(titlesSel).first().waitFor({ timeout: 5_000 });
    const after = (await page.locator(titlesSel).allTextContents()).slice(0, 5);
    expect(after.length).toBeGreaterThan(0);

    // Server-side sort must produce a different ordering than the default.
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });
});
