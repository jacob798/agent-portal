import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/design', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:6006', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'python3 -m http.server 6006 --bind 127.0.0.1 --directory storybook-static', url: 'http://127.0.0.1:6006', reuseExistingServer: !process.env.CI },
});
