// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    // Trusted gestures still fire, but this lets AudioContext reach 'running'
    // reliably in headless Chromium for the audio-unlock test.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Mobile device profiles are exercised in P7 (E2E-10).
  ],
});
