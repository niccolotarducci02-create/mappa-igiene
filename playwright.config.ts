import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// Chromium preinstallato nel container cloud; altrove Playwright usa il proprio browser.
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)

// E2E smoke tests run against the production build served by `vite preview`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'it-IT',
    ...devices['Pixel 7'],
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
