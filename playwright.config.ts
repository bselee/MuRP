import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run -s build',
      reuseExistingServer: true,
    },
    {
      command: 'vite preview --strictPort --port 4173',
      port: 4173,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        // Ensure Vite runs in production preview mode
        NODE_ENV: 'production',
      },
    },
  ],
});
