// @ts-check
// v1.4 · music overhaul — the 8 genre songs are multi-voice (bass + lead + drums),
// so each loop schedules many parallel oscillator/drum nodes; the short jingles don't.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

const SONGS = ['title', 1, 2, 3, 4, 5, 'boss', 'merchant'];

test('every genre song schedules many parallel voices; no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openGame(page);
  const counts = await page.evaluate((keys) => {
    const out = {};
    for (const k of keys) { window.BS.playMusic(k); out[String(k)] = window.BS.musicVoices(); }
    return out;
  }, SONGS);
  for (const k of SONGS) expect.soft(counts[String(k)], `song ${k}`).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test('short jingles stay small (negative control: not multi-voice)', async ({ page }) => {
  await openGame(page);
  const v = await page.evaluate(() => { window.BS.playMusic('gameover'); return window.BS.musicVoices(); });
  expect(v).toBeGreaterThan(0);    // it does play
  expect(v).toBeLessThan(20);      // but it's a single short line, not a layered song
});

test('a genre song outlives the old short loop (long arrangement)', async ({ page }) => {
  await openGame(page);
  // The title track alone spans many bars of bass — far more than any old ~14-note loop.
  const bassNotes = await page.evaluate(() => window.BS.trackBars('title'));
  expect(bassNotes).toBeGreaterThanOrEqual(16);
});

test('every layered song has all layers the same length (no desync / lead-drop tail)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate((keys) => keys.map((k) => ({ k: String(k), bars: window.BS.trackLayerBars(k) })), SONGS);
  for (const { k, bars } of r) {
    expect(bars.length, `song ${k} has layers`).toBeGreaterThan(1);
    for (const b of bars) expect(b, `song ${k} layer bars`).toBeCloseTo(bars[0], 6);   // all layers equal → loops cleanly
  }
});

test('the title & merchant songs are multi-section (long, with a build/drop)', async ({ page }) => {
  await openGame(page);
  const bars = await page.evaluate(() => ({ title: window.BS.trackBars('title'), merchant: window.BS.trackBars('merchant') }));
  expect(bars.title).toBeGreaterThanOrEqual(48);      // long enough to sit and listen
  expect(bars.merchant).toBeGreaterThanOrEqual(40);   // intro→build→drop→breakdown
});
