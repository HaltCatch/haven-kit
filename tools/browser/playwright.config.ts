import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const port = Number(process.env['HAVEN_BROWSER_PORT'] ?? 4311);
const url = `http://127.0.0.1:${port}`;
const viewport = { width: 1600, height: 1000 };
export default defineConfig({
  globalSetup: './firefox-environment.ts',
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(import.meta.dirname, '../../.cache/browser/report.json') }],
  ],
  timeout: 30_000,
  use: {
    headless: true,
    baseURL: url,
    viewport,
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
  ],
  webServer: {
    command: 'pnpm test:browser:serve',
    cwd: resolve(import.meta.dirname, '../..'),
    url,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
