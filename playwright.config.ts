import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    storageState: 'e2e/.auth/state.json',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'NODE_OPTIONS=--max-old-space-size=1536 npm run dev',
    url: 'http://localhost:3000',
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
