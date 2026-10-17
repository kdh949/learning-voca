import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.mjs',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', browserName: 'chromium' },
  webServer: {
    command: 'pnpm --filter @learning-voca/web exec vite ../../tests/browser --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  },
});
