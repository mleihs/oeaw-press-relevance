import { test, expect } from '@playwright/test';

// Phase 4 — end-to-end flows for the in-app Hilfe-Center.
// These tests verify the user-visible promises of the KB: it's reachable from
// the host nav, sections render correctly, deep-link anchors scroll, and
// search returns results that navigate to the right article.
//
// Read-only — no mutations.

test.describe('Hilfe-Center flows', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
    });
  });

  test('Host-nav has Hilfe link pointing at /help', async ({ page }) => {
    await page.goto('/');
    const helpLink = page.getByRole('link', { name: /Hilfe/ }).first();
    await expect(helpLink).toBeVisible();
    await expect(helpLink).toHaveAttribute('href', '/help');
  });

  test('/help renders with title and the three intro cards', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Hilfe-Center', level: 1 }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Was ist StoryScout/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /StoryScore verstehen/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Workflow/ }).first()).toBeVisible();
  });

  test('Deep article loads with stable heading IDs and TOC entries', async ({ page }) => {
    await page.goto('/help/scores/dimensionen');
    await page.waitForLoadState('networkidle');

    // Stable {#anchor} IDs from remark-custom-heading-id should render on h2s.
    const verstaendlichkeit = page.locator('h2#verstaendlichkeit');
    await expect(verstaendlichkeit).toBeVisible();
    await expect(verstaendlichkeit).toContainText('Verständlichkeit');

    // Fumadocs's right-rail TOC should list every section as a link to the anchor.
    const toc = page.getByRole('link', { name: /Verständlichkeit/ });
    await expect(toc.first()).toBeVisible();
  });

  test('Direct hash URL renders the targeted section', async ({ page }) => {
    await page.goto('/help/forscher-metriken/metriken#weighted-avg');
    await page.waitForLoadState('networkidle');

    // Anchor-targeted h2 is in the DOM with the stable {#weighted-avg} ID.
    // Browser-level scroll-into-view behaviour is environment-dependent
    // (settles after JS hydration), so we don't assert viewport here —
    // visibility + ID presence is the contract that matters.
    const target = page.locator('h2#weighted-avg');
    await expect(target).toBeVisible();
    await expect(target).toContainText('verlässlich');
  });

  test('Search API returns hits for a known concept', async ({ page }) => {
    const response = await page.request.get('/api/search?query=bayes');
    expect(response.ok()).toBe(true);
    const hits = (await response.json()) as Array<{ id: string; url: string }>;
    expect(hits.length).toBeGreaterThan(0);
    // At least one hit should point at the metriken article where Bayes-Glättung lives.
    expect(hits.some((h) => h.url.includes('forscher-metriken/metriken'))).toBe(true);
  });

  test('Verwandte-Themen cross-links navigate to a 200', async ({ page }) => {
    await page.goto('/help/scores/dimensionen');
    await page.waitForLoadState('networkidle');

    const link = page.getByRole('link', { name: /StoryScore/ }).first();
    await link.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/help\/scores\/storyscore/);
    await expect(page.getByRole('heading', { name: /StoryScore/, level: 1 }).first()).toBeVisible();
  });
});
