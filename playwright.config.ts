import { defineConfig, type Project } from '@playwright/test';

/**
 * Drei Projekte, zwei Server-Modi:
 *
 *  - `chromium` (Default): die normalen E2E-Suiten gegen `npm run dev`.
 *    Läuft bei einem nackten `npx playwright test`. Ausgenommen sind
 *    capture-screenshots (README-Bilder, kein Testwert) und gate.spec
 *    (braucht den Production-Build — der Dev-Server winkt am Gate alles
 *    durch, proxy.ts NODE_ENV-Bypass).
 *
 *  - `gate` (nur mit PW_PROD_SERVER=1): e2e/gate.spec.ts gegen einen
 *    Production-Server (`npm run start`; vorher `npm run build` laufen
 *    lassen — der webServer baut bewusst NICHT selbst, damit ein
 *    Build-Fehler als Build-Fehler auffällt und nicht als Timeout).
 *    Bewusst OHNE storageState: die Specs prüfen gerade den
 *    unauthentifizierten Zustand. Aufruf (CI-Job `integration`):
 *    `PW_PROD_SERVER=1 npx playwright test --project=gate` — GATE_PASSWORD
 *    und GATE_TOKEN (= sha256-Hex des Passworts) müssen gesetzt sein,
 *    sonst verweigert proxy.ts fail-closed mit 503.
 *
 *  - `screenshots` (nur mit PW_SCREENSHOTS=1): capture-screenshots.spec.ts
 *    explizit: `PW_SCREENSHOTS=1 npx playwright test --project=screenshots`.
 *
 * Die Opt-in-Projekte sind env-bedingt statt nur per --project, damit ein
 * nacktes `npx playwright test` (das ALLE definierten Projekte ausführen
 * würde) sie nie versehentlich mitnimmt.
 */
const prodServer = !!process.env.PW_PROD_SERVER;

const projects: Project[] = [
  {
    name: 'chromium',
    use: { browserName: 'chromium', storageState: 'e2e/.auth/state.json' },
    testIgnore: ['**/capture-screenshots.spec.ts', '**/gate.spec.ts'],
  },
];

if (prodServer) {
  projects.push({
    name: 'gate',
    // Kein storageState: die Gate-Specs starten unauthentifiziert.
    use: { browserName: 'chromium' },
    testMatch: '**/gate.spec.ts',
  });
}

if (process.env.PW_SCREENSHOTS) {
  projects.push({
    name: 'screenshots',
    use: { browserName: 'chromium', storageState: 'e2e/.auth/state.json' },
    testMatch: '**/capture-screenshots.spec.ts',
  });
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects,
  webServer: {
    command: prodServer
      ? 'npm run start'
      : 'NODE_OPTIONS=--max-old-space-size=1536 npm run dev',
    url: 'http://localhost:3000',
    timeout: 180_000,
    // Production-Modus: nie einen schon laufenden Server übernehmen — auf
    // Port 3000 könnte der Dev-Server hängen, und gegen den wären die
    // Gate-Specs wertlos (Dev-Bypass). Lieber laut am belegten Port scheitern.
    reuseExistingServer: !prodServer,
  },
});
