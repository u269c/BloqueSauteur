// @ts-check
// R3-PR2: seeded theme assignment + render smoke across all skies/worlds.
const { test, expect } = require('@playwright/test');
const { openGame, gameUrl } = require('./helpers');

test.describe('PR2 · theme assignment', () => {
  test('same seed → same per-level themes; distinct worlds across the 4 levels', async ({ page }) => {
    await openGame(page, { seed: 4242 });
    const themes = await page.evaluate(() => {
      const out = [];
      window.BS.reseed(4242);
      for (let lv = 1; lv <= 4; lv++) { window.BS.setLevel(lv); out.push({ ...window.BS.theme() }); }
      return out;
    });
    // reload same seed → identical assignment
    await page.goto(gameUrl({ seed: 4242 })); await page.waitForFunction(() => !!window.BS);
    const again = await page.evaluate(() => {
      const out = []; window.BS.reseed(4242);
      for (let lv = 1; lv <= 4; lv++) { window.BS.setLevel(lv); out.push({ ...window.BS.theme() }); }
      return out;
    });
    expect(again).toEqual(themes);
    const worlds = themes.map((t) => t.world);
    expect(new Set(worlds).size).toBe(4);   // 4 distinct worlds in a run
  });

  test('different seeds generally differ (neg. control)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      const grab = (s) => { window.BS.reseed(s); window.BS.setLevel(1); return JSON.stringify(window.BS.theme()); };
      const a = grab(1), b = grab(2), c = grab(3), d = grab(4);
      return new Set([a, b, c, d]).size;
    });
    expect(r).toBeGreaterThan(1);   // not all identical
  });

  test('?theme= override forces a specific world+sky', async ({ page }) => {
    await openGame(page, { theme: 'bathtub,space' });
    const t = await page.evaluate(() => { window.BS.setLevel(1); return window.BS.theme(); });
    expect(t.world).toBe('bathtub');
    expect(t.sky).toBe('space');
  });
});

test.describe('PR2 · render smoke (every sky × representative worlds)', () => {
  test('all skies and all worlds render without throwing', async ({ page }) => {
    await openGame(page);
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.evaluate(async () => {
      window.BS.start(); const st = window.BS.state(); st.hero.ghost = 1e9;
      for (const sky of window.BS.SKY_KEYS) {
        for (const world of window.BS.WORLD_KEYS) {
          st.theme = { world, sky };
          // advance a few frames of animation to exercise time-based branches
          for (let k = 0; k < 3; k++) { st.t += 0.1; window.BS.stepFixed(1); }
        }
      }
    });
    // let a couple of RAF renders happen
    await page.waitForTimeout(120);
    expect(errs).toEqual([]);
  });
});
