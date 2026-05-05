import { test, expect } from '@playwright/test';

// Read-only smoke tests for the Triage-Loop changes (Phase B).
// We do NOT click decision buttons here because that would mutate the DB
// and (for Pitch) push to MeisterTask. UI-element presence is the contract
// being checked.

test.describe('Triage-Loop smoke', () => {
  // PasswordGate is a client-side wrapper that gates rendering on a
  // sessionStorage marker (storyscout-auth-marker=1). Storage state covers
  // the HTTP-only `gate` cookie but not sessionStorage — set the marker on
  // every page before any script runs.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('storyscout-auth-marker', '1');
    });
  });

  test('Nav has Triage entry pointing at /review', async ({ page }) => {
    await page.goto('/');
    const triageLink = page.getByRole('link', { name: /Triage/ }).first();
    await expect(triageLink).toBeVisible();
    await expect(triageLink).toHaveAttribute('href', '/review');
  });

  test('/review renders with header, counters and either queue or empty state', async ({ page }) => {
    await page.goto('/review');
    await page.waitForLoadState('networkidle');

    // Header — TanStack Query may still be hydrating after networkidle, so
    // give the heading a generous window before asserting.
    await expect(page.getByText('Triage-Sitzung').first()).toBeVisible({ timeout: 15_000 });

    // Three counter cards (label-text-based — exact counts aren't asserted
    // because they depend on the live DB state).
    await expect(page.getByText(/Geflaggt/).first()).toBeVisible();
    await expect(page.getByText(/Frisch \(Score/).first()).toBeVisible();
    await expect(page.getByText(/ÖAW-Highlights/).first()).toBeVisible();

    // Either the queue table OR the empty-state card must render. Asserting
    // EITHER avoids a flaky test when the DB happens to be empty.
    const tableVisible = await page.locator('table').first().isVisible().catch(() => false);
    const emptyState = await page.getByText(/Queue leer/).isVisible().catch(() => false);
    expect(tableVisible || emptyState).toBe(true);
  });

  test('Decision-Toolbar is rendered in expanded row when queue has items', async ({ page }) => {
    await page.goto('/review');
    await page.waitForLoadState('networkidle');

    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();
    test.skip(rowCount === 0, 'Queue empty — toolbar visibility cannot be verified');

    // Click the first row's expand-chevron cell (top-left ChevronDown).
    await tableRows.first().click();

    await expect(page.getByRole('button', { name: 'Pitch', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();

    await expect(page.getByText(/Snooze:/)).toBeVisible();
    await expect(page.getByRole('button', { name: '1W', exact: true })).toBeVisible();
  });

  test('Detail-Page shows Decision-Toolbar above Pitch card', async ({ page }) => {
    // Use /api/review/queue server-side to grab a real pub id without
    // depending on the publications list rendering its links in time.
    const r = await page.request.get('/api/review/queue');
    const body = await r.json();
    const pubs = (body?.publications ?? []) as Array<{ id: string }>;
    test.skip(pubs.length === 0, 'No publications available — cannot test detail page');

    await page.goto(`/publications/${pubs[0].id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Pitch', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Hold', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
  });
});
