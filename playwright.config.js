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
    // Desktop runs the full logic + flow suite; device profiles run only the
    // layout/touch e2e (device.spec) to keep runs fast.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /device\.spec\.js/ },
    // Chromium engine with each device's mobile viewport + touch (WebKit isn't
    // installed in this env; Chromium mobile emulation covers layout/touch).
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /device\.spec\.js/ },
    { name: 'ipad', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' }, testMatch: /device\.spec\.js/ },
  ],
});
