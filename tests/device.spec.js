// @ts-check
// P7 · E2E-10 — real device profiles (iPhone / iPad). Layout + real touch input.
// Runs against the actual game with the real-time loop (no freeze).
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

test('layout: no horizontal page scroll; canvas + controls fit the viewport', async ({ page }) => {
  await openGame(page, { seed: 1 });
  await expect(page.locator('#controls')).toBeVisible();   // touch device → movement buttons shown
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth, innerH: window.innerHeight,
    canvas: document.getElementById('game').getBoundingClientRect(),
    left: document.getElementById('btn-left').getBoundingClientRect(),
    jump: document.getElementById('btn-jump').getBoundingClientRect(),
  }));
  expect(m.scrollW).toBeLessThanOrEqual(m.innerW + 1);          // no sideways scrolling
  expect(m.canvas.width).toBeLessThanOrEqual(m.innerW + 1);      // canvas fits
  expect(m.canvas.height).toBeLessThanOrEqual(m.innerH + 1);
  // control buttons are on-screen and reachable
  for (const b of [m.left, m.jump]) {
    expect(b.left).toBeGreaterThanOrEqual(-1);
    expect(b.right).toBeLessThanOrEqual(m.innerW + 1);
    expect(b.bottom).toBeLessThanOrEqual(m.innerH + 1);
    expect(b.width).toBeGreaterThan(30);                        // large enough tap target
  }
});

test('real touch: PLAY starts, jump button lifts the hero, right button moves it', async ({ page }) => {
  await openGame(page, { seed: 1 });
  await page.locator('#slots .slot-card').first().tap();        // pick a save slot
  await page.waitForSelector('#play-btn');
  await page.locator('#play-btn').tap();                        // real touch tap
  await page.waitForFunction(() => window.BS.scene() === 'INTRO');
  // advance the intro by tapping the canvas
  await page.locator('#game').tap();
  await page.waitForFunction(() => window.BS.scene() === 'PLAY');

  // hold RIGHT for a bit → hero moves right
  const x0 = await page.evaluate(() => window.BS.hero().x);
  await page.locator('#btn-right').dispatchEvent('pointerdown');
  await page.waitForTimeout(350);
  await page.locator('#btn-right').dispatchEvent('pointerup');
  const x1 = await page.evaluate(() => window.BS.hero().x);
  expect(x1).toBeGreaterThan(x0 + 8);

  // tap JUMP → hero leaves the ground (y decreases)
  const groundY = await page.evaluate(() => window.BS.hero().y);
  await page.locator('#btn-jump').dispatchEvent('pointerdown');
  await page.waitForTimeout(120);
  const apexY = await page.evaluate(() => window.BS.hero().y);
  await page.locator('#btn-jump').dispatchEvent('pointerup');
  expect(apexY).toBeLessThan(groundY - 4);
});

test('audio unlocks on the first real touch', async ({ page }) => {
  await openGame(page);
  await page.locator('#slots .slot-card').first().tap();       // first gesture unlocks audio
  await page.waitForFunction(() => window.BS.audioState() === 'running');
  expect(await page.evaluate(() => window.BS.audioState())).toBe('running');
});
