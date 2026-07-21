// @ts-check
// v1.1-PR1: safer respawn, music gain reset on quit→restart.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

test.describe('v1.1 · respawn away from holes', () => {
  test('respawn lands in the widest solid segment (solid ground on both sides)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      window.BS.freeze(true); window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1);
      const C = window.BS.CONFIG, T = C.TILE, t = window.BS.terrain();
      for (let i = 0; i < t.nCols; i++) t.cols[i] = C.PLAT_Y;
      // narrow ledge on the left (cols 0-2), big platform on the right (cols 6-21)
      for (let i = 3; i < 6; i++) t.cols[i] = null;
      t.segments = []; let i = 0; while (i < t.nCols) { if (t.cols[i] == null) { i++; continue; } let j = i; while (j < t.nCols && t.cols[j] === t.cols[i]) j++; t.segments.push({ x0: t.x0 + i * T, x1: t.x0 + j * T, top: t.cols[i] }); i = j; }
      window.BS.respawnHero();
      const h = window.BS.hero();
      return { x: h.x, leftGround: window.BS.surfaceAt(t, h.x - 1.5 * T) != null, rightGround: window.BS.surfaceAt(t, h.x + 1.5 * T) != null, wideStart: t.x0 + 6 * T };
    });
    expect(r.leftGround).toBe(true);         // solid ≥1.5 tiles either side
    expect(r.rightGround).toBe(true);
    expect(r.x).toBeGreaterThan(r.wideStart); // chose the wide right platform
  });
});

test.describe('v1.1 · music resets after quitting from pause', () => {
  test('pausing drops master gain, but returning to title (then any music) restores it', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      window.BS.startGame(); window.BS.gotoPlay();   // unlock + into PLAY
      window.BS.pause(true);                 // pause → master gain 0
      const paused = window.BS.masterGain();
      window.BS.gotoTitle();                 // quit to title → title music must restore gain
      const afterTitle = window.BS.masterGain();
      return { paused, afterTitle };
    });
    expect(r.paused).toBe(0);                 // silenced while paused
    expect(r.afterTitle).toBeGreaterThan(0);  // restored on return (no stuck-silent bug)
  });
});
