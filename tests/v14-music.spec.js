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
  // The title track alone spans 16 bars of bass — far more notes than any old ~14-note loop.
  const bassNotes = await page.evaluate(() => window.BS.trackBars('title'));
  expect(bassNotes).toBeGreaterThanOrEqual(16);
});
