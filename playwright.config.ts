import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Use system Chromium if PLAYWRIGHT_CHROMIUM_PATH is set (e.g., on Arch Linux)
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

/**
 * Runs against the production build served by `vite preview`, the only setup that carries the
 * content security policy. Build first: `pnpm build && pnpm test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/migration-assistant/`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Playwright starts Chromium without its sandbox unless told otherwise; CI containers cannot run it.
          chromiumSandbox: !process.env.CI,
          ...(chromiumPath && { executablePath: chromiumPath }),
        },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
