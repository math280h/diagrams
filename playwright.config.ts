import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const browser = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  projects: [
    { name: 'web', testIgnore: /desktop[\\/]/, use: browser },
    { name: 'desktop', testMatch: /desktop[\\/].*\.spec\.ts/, use: browser },
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
  },
})
