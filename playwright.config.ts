import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5191', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run start -- --port 5191', url: 'http://127.0.0.1:5191', reuseExistingServer: true, timeout: 120_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
