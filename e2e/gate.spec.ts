import { test, expect } from '@playwright/test';
import { readEnvVar } from './global-setup';

/**
 * Gate-Durchsetzung gegen den PRODUCTION-Build (`next build` + `next start`).
 *
 * Warum ein eigenes Projekt (playwright.config.ts, nur mit PW_PROD_SERVER=1):
 * proxy.ts winkt unter NODE_ENV=development ALLES durch — gegen `npm run dev`
 * würde das Gate hier nie ausgeübt, die Specs wären Theater. Seit dem
 * Fail-closed-Umbau (fehlender GATE_TOKEN → 503) MUSS der Server außerdem
 * GATE_TOKEN (= sha256-Hex von GATE_PASSWORD) gesetzt haben.
 *
 * Selektoren: bewusst nur öffentliche Vertragspunkte der Seite (aria-label,
 * Rollen, sichtbare Texte aus components/auth/auth-screen.tsx) — die interne
 * Struktur des AuthScreen wird parallel refactored und ist hier tabu.
 */

// Lokal (ohne exportiertes GATE_PASSWORD) aus .env.local lesen — dieselbe
// Quelle, mit der `next start` das Gate konfiguriert. In CI kommt es aus env.
const gatePassword =
  process.env.GATE_PASSWORD ?? readEnvVar('.env.local', 'GATE_PASSWORD') ?? '';

// Das Gate-Projekt hat keinen storageState; zur Sicherheit (falls die Specs
// doch einmal in einem anderen Projekt landen) explizit leer starten.
test.use({ storageState: { cookies: [], origins: [] } });

// Der AuthScreen blendet erst ein Marken-Intro ein (~1,3 s) — großzügige
// Timeouts statt Sleeps; Playwright pollt.
const UI_TIMEOUT = 15_000;

const passwordInput = (page: import('@playwright/test').Page) =>
  page.getByLabel('Gemeinsames Passwort', { exact: true });

async function submitGatePassword(page: import('@playwright/test').Page, pw: string) {
  const input = passwordInput(page);
  await expect(input).toBeVisible({ timeout: UI_TIMEOUT });
  await input.fill(pw);
  // Der Screen trägt zwei Formulare (Team-Zugang + persönlicher Login) —
  // den Anmelden-Button über das Formular des Gate-Felds ansteuern.
  const gateForm = page.locator('form').filter({ has: input });
  await gateForm.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

test.describe('Gate (Production-Build)', () => {
  test('Seiten-Request ohne Cookie → Redirect auf / mit ?next=', async ({ page }) => {
    await page.goto('/publications');
    // proxy.ts leitet auf die Wurzel um und konserviert das Ziel als ?next=.
    await expect(page).toHaveURL(/\/\?next=%2Fpublications$/);
    // Dort steht der Anmeldescreen, nicht die Publikationsliste.
    await expect(
      page.getByRole('heading', { name: 'Willkommen bei ÖAW Presse' }),
    ).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('API-Request ohne Cookie → 401 JSON, kein Redirect', async ({ request }) => {
    const res = await request.get('/api/publications');
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Authentication required' });
  });

  test('falsches Passwort → Fehlermeldung, weiterhin kein Zugang', async ({ page }) => {
    await page.goto('/');
    await submitGatePassword(page, 'definitiv-nicht-das-passwort');
    await expect(page.getByRole('alert')).toContainText(
      'Das gemeinsame Passwort ist nicht korrekt.',
      { timeout: UI_TIMEOUT },
    );
    // Cookie wurde keines gesetzt: API bleibt zu.
    const res = await page.request.get('/api/publications');
    expect(res.status()).toBe(401);
  });

  test('richtiges Passwort → Dashboard sichtbar, API offen', async ({ page }) => {
    test.skip(!gatePassword, 'GATE_PASSWORD weder in env noch .env.local — Erfolgsfall nicht prüfbar');
    await page.goto('/');
    await submitGatePassword(page, gatePassword);
    // Erfolg deckt die App in place auf (password-gate.tsx): die Haupt-
    // navigation mit dem Dashboard-Eintrag wird sichtbar.
    await expect(
      page.getByRole('link', { name: 'Dashboard' }).first(),
    ).toBeVisible({ timeout: UI_TIMEOUT });
    // Und das HttpOnly-Cookie im Browser-Kontext öffnet auch die API.
    const res = await page.request.get('/api/health');
    expect(res.status()).toBe(200);
  });
});
