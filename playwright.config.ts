import { defineConfig, devices } from '@playwright/test';
import { createHash } from 'node:crypto';

export const TEST_CODE = 'test kitchen';
export const TEST_HASH = createHash('sha256').update(`love-bites-kitchen-v1:${TEST_CODE}`).digest('hex');

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/love-bites/', trace: 'retain-on-failure', ...devices['Pixel 7'] },
  projects: [
    { name: 'phone' },
    { name: 'small-phone', use: { viewport: { width: 360, height: 640 } }, testMatch: /layout/ },
    { name: 'iphone', use: { viewport: { width: 430, height: 932 } }, testMatch: /layout/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /layout/ },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/love-bites/',
    reuseExistingServer: true,
    timeout: 180_000,
    env: { VITE_KITCHEN_CODE_HASH: TEST_HASH },
  },
});
