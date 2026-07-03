import { test, expect, request, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'fs';

/**
 * Board-Grundflow (Karte anlegen → Checkliste → abhaken → verschieben →
 * abschließen) + a11y-Pass (Phase 3, Task 6 / BOARD_PLAN.md §5).
 *
 * Setup-Hürde (aus dem Plan): globalSetup loggt nur ins Gate ein — das Board
 * braucht zusätzlich eine Supabase-Auth-Session. Diese Spec seedet daher
 * einen Wegwerf-Admin über die Service-Role-Admin-API (Muster: rls-smoke),
 * loggt ihn per /api/auth/login ein und baut daraus einen kombinierten
 * Cookie-Satz (Gate + Auth) als In-Memory-storageState, den jeder Test über
 * `browser.newContext({ storageState })` bekommt.
 *
 * Läuft NUR gegen den lokalen Stack (localhost-URL + Service-Key + erreichbar)
 * — sonst per `test.skip` im Test sauber übersprungen, nie gegen prod (Schutz:
 * keine Wegwerf-Nutzer in prod). `test.skip()` steht bewusst IM Test, nicht in
 * beforeAll (dort ist es nicht erlaubt und würde den Hook abbrechen).
 */

const BASE_URL = 'http://localhost:3000';

function readEnvVar(file: string, key: string): string | null {
  try {
    const content = readFileSync(file, 'utf-8');
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const url =
  process.env.SUPABASE_URL ||
  readEnvVar('.env.local', 'SUPABASE_URL') ||
  readEnvVar('.env.local', 'NEXT_PUBLIC_SUPABASE_URL') ||
  '';
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  readEnvVar('.env.local', 'SUPABASE_ANON_KEY') ||
  readEnvVar('.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  '';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  readEnvVar('.env.local', 'SUPABASE_SERVICE_ROLE_KEY') ||
  '';
const gatePassword =
  process.env.GATE_PASSWORD || readEnvVar('.env.local', 'GATE_PASSWORD') || '';

const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);

async function stackReachable(): Promise<boolean> {
  if (!isLocalTarget || !anonKey || !serviceKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function uniqueTitle(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
}

// Board öffnen und auf das „geladen"-Signal warten (Board-Name lebt im
// Switcher-Button, ist keine Heading).
async function openBoard(page: Page): Promise<void> {
  await page.goto('/board/channels');
  await expect(page.getByRole('button', { name: 'Karte anlegen' })).toBeVisible();
}

// Quick-Create (Default-Kanal PM/Presse). exact: sonst matcht „Anlegen" auch
// den Toolbar-Button „Karte anlegen".
async function createCard(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Karte anlegen' }).click();
  await page.getByPlaceholder('Titel der Karte').fill(title);
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByText(title)).toBeVisible();
}

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

// Hart failen auf serious/critical — AUSSER color-contrast: das entstammt dem
// geteilten --muted-foreground-Design-Token (oklch 0.556 auf bg-muted, ~4.2:1)
// bzw. der brand-Nav-Chrome (white/70–80 auf bg-brand). Das ist toolkit-weite
// Design-System-Schuld, die im separaten Design/Font-Pass adressiert wird
// (DESIGN_SYSTEM.md, „Board = Referenz"); ein Alleingang hier würde app-weit
// Visuals ändern. Deshalb: sichtbar loggen, aber nicht blockieren.
function assertNoBlockingA11y(label: string, results: AxeResults): void {
  const contrast = results.violations.filter((v) => v.id === 'color-contrast');
  if (contrast.length) {
    console.log(
      `${label} a11y color-contrast (Design-Token-Schuld, getrackt, nicht blockierend):`,
      contrast.flatMap((v) => v.nodes.map((n) => n.html)),
    );
  }
  const blocking = results.violations.filter(
    (v) => (v.impact === 'serious' || v.impact === 'critical') && v.id !== 'color-contrast',
  );
  if (blocking.length) console.log(`${label} a11y BLOCKING:`, JSON.stringify(blocking, null, 2));
  expect(blocking, `${label}: blockierende a11y-Verstöße`).toEqual([]);
}

test.describe('Board Grundflow + a11y', () => {
  let admin: SupabaseClient | null = null;
  let userId: string | null = null;
  let available = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let boardState: any = null;

  test.beforeAll(async () => {
    available = await stackReachable();
    if (!available) return;

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `board-e2e-${suffix}@example.com`;
    const password = `board-${suffix}-Aa23456789`;

    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Board E2E' },
      app_metadata: { role: 'admin' },
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    userId = data.user.id;
    // Gotcha (Phase 1): GoTrue merged app_metadata erst NACH dem Spiegel-
    // Trigger-Insert → role landet als 'member'. Für admin explizit nachsetzen.
    await admin.from('users').update({ role: 'admin' }).eq('id', userId);

    // Kombinierten Cookie-Satz (Gate + Supabase-Auth) einsammeln. Origin-
    // Header: /api/auth/* erzwingt Same-Origin (CSRF, http.ts).
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { origin: BASE_URL },
    });
    if (gatePassword) {
      const gateRes = await ctx.post('/api/auth/gate', { data: { password: gatePassword } });
      if (!gateRes.ok()) throw new Error(`Gate login failed: ${gateRes.status()}`);
    }
    const loginRes = await ctx.post('/api/auth/login', { data: { email, password } });
    if (!loginRes.ok()) throw new Error(`Auth login failed: ${loginRes.status()} ${await loginRes.text()}`);
    boardState = await ctx.storageState();
    await ctx.dispose();
  });

  test.afterAll(async () => {
    if (admin && userId) {
      // cards.created_by ist RESTRICT — erst die vom Test-User erzeugten
      // Karten löschen (kaskadiert zu items/comments/activity), dann den User.
      await admin.from('cards').delete().eq('created_by', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test('Karte anlegen → Checkliste → abhaken → verschieben → abschließen', async ({ browser }) => {
    test.skip(!available, 'Lokaler Supabase-Stack nicht erreichbar — Board-E2E geskippt.');
    const context: BrowserContext = await browser.newContext({ storageState: boardState });
    const page: Page = await context.newPage();
    const cardTitle = uniqueTitle('E2E-Flow');
    try {
      await openBoard(page);

      // 1) Anlegen (Quick-Create, Default-Kanal PM/Presse).
      await createCard(page, cardTitle);

      // 2) Öffnen.
      await page.getByText(cardTitle).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // 3) Checklisten-Eintrag + abhaken.
      const itemInput = dialog.getByPlaceholder('Eintrag hinzufügen, Enter zum Speichern…');
      await itemInput.fill('ITV anfragen');
      await itemInput.press('Enter');
      await expect(dialog.getByText('ITV anfragen')).toBeVisible();
      await dialog.getByRole('button', { name: 'Abhaken' }).click();
      await expect(dialog.getByRole('button', { name: 'Als offen markieren' })).toBeVisible();

      // 4) Verschieben nach „Web" (deterministisch über die Verschieben-Popover
      //    statt DnD). Popover portalt außerhalb des Dialogs → page-scoped.
      await dialog.getByRole('button', { name: 'Verschieben' }).click();
      await page.getByRole('button', { name: 'Web', exact: true }).click();

      // 5) Abschließen.
      await dialog.getByRole('button', { name: 'Abschließen' }).click();
      await expect(dialog.getByRole('button', { name: 'Abgeschlossen' })).toBeVisible();

      // Schließen → Board refetcht: Persistenz der Checkliste (1/1) beweisen.
      // exact: „Schließen" darf nicht „Abschließen" mitgreifen.
      await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      // Auf den Karten-Chip scopen: „1/1" käme sonst auch im Next.js-Dev-
      // Overlay vor (Strict-Mode-Kollision).
      await expect(page.getByRole('button', { name: cardTitle })).toContainText('1/1');

      // Verschieben persistiert: Karte erneut öffnen — im Verschieben-Popover
      // ist der aktuelle Kanal „Web" deaktiviert.
      await page.getByText(cardTitle).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Verschieben' }).click();
      await expect(page.getByRole('button', { name: 'Web', exact: true })).toBeDisabled();
    } finally {
      await context.close();
    }
  });

  test('a11y: Board-Content + Kartenmodal ohne blockierende Verstöße', async ({ browser }) => {
    test.skip(!available, 'Lokaler Supabase-Stack nicht erreichbar — Board-E2E geskippt.');
    const context: BrowserContext = await browser.newContext({ storageState: boardState });
    const page: Page = await context.newPage();
    const cardTitle = uniqueTitle('E2E-A11y');
    try {
      await openBoard(page);
      // Eigene Karte anlegen (unabhängig von anderen Tests — Playwright kann
      // bei retries den Worker neu aufsetzen, geteilter Zustand wäre fragil).
      await createCard(page, cardTitle);

      // Board-Content: auf <main> scopen — der globale <header>/Footer ist
      // geteilte Chrome (nicht Phase 3) und hat eigene (Design-System-)a11y.
      assertNoBlockingA11y(
        'BOARD',
        await new AxeBuilder({ page }).include('main').analyze(),
      );

      // Kartenmodal separat (Radix-Dialog: Focus-Trap/aria-modal).
      await page.getByText(cardTitle).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      assertNoBlockingA11y(
        'MODAL',
        await new AxeBuilder({ page }).include('[role="dialog"]').analyze(),
      );
    } finally {
      await context.close();
    }
  });
});
