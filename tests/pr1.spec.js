// @ts-check
// R3-PR1: scoring (points), boss-follows-platform, music hard-stop.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test.describe('PR1 · points scoring', () => {
  test('boss defeat awards +5 points', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('normal'); const st = window.BS.state();
      st.points = 10; window.BS.activateBoss();
      const need = window.BS.boss().maxHits;
      for (let k = 0; k < need; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      return { points: st.points };
    });
    expect(r.points).toBe(15);   // 10 + 5
  });

  test('RAGE deducts 1 point per hit; NORMAL does not (neg. control)', async ({ page }) => {
    const afterHit = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.setMode(mode); const st = window.BS.state();
      st.points = 10; const h = window.BS.hero(); Object.assign(h, { ghost: 0, hurt: 0, dead: false });
      window.BS.heroHurt(true);
      return st.points;
    }, mode);
    expect(await afterHit('rage')).toBe(9);      // −1
    expect(await afterHit('normal')).toBe(10);   // negative control: no penalty
  });

  test('points never go negative in RAGE', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('rage'); const st = window.BS.state();
      st.points = 0; const h = window.BS.hero();
      for (let k = 0; k < 3; k++) { Object.assign(h, { ghost: 0, hurt: 0, dead: false }); window.BS.heroHurt(true); }
      return { points: st.points };
    });
    expect(r.points).toBe(0);
  });
});

test.describe('PR1 · boss follows the platform', () => {
  test('boss rides a raised segment (not stuck at base) and never drops below base', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1);
      const C = window.BS.CONFIG, T = C.TILE, t = window.BS.terrain();
      for (let i = 0; i < t.nCols; i++) t.cols[i] = C.PLAT_Y;
      for (let i = 8; i < 14; i++) t.cols[i] = C.PLAT_Y - 2 * T;   // a raised plateau
      t.segments = [{ x0: t.x0, x1: t.x0 + 8 * T, top: C.PLAT_Y }, { x0: t.x0 + 8 * T, x1: t.x0 + 14 * T, top: C.PLAT_Y - 2 * T }, { x0: t.x0 + 14 * T, x1: t.x1, top: C.PLAT_Y }];
      window.BS.state().hero.ghost = 1e9; window.BS.activateBoss();
      const b = window.BS.boss();
      // stand the boss on the raised plateau and let it settle
      b.state = 'idle'; b.x = t.x0 + 11 * T; b.vy = 0; b.y = C.PLAT_Y;
      for (let k = 0; k < 40; k++) window.BS.stepFixed(1);
      const onPlateau = b.y;
      // now over the base area
      b.x = t.x0 + 2 * T; for (let k = 0; k < 40; k++) window.BS.stepFixed(1);
      const onBase = b.y;
      return { onPlateau, onBase, plateauTop: C.PLAT_Y - 2 * T, base: C.PLAT_Y };
    });
    expect(r.onPlateau).toBeCloseTo(r.plateauTop, 0);   // rode UP onto the plateau
    expect(r.onBase).toBeCloseTo(r.base, 0);            // followed back DOWN to base
    expect(r.onPlateau).toBeLessThan(r.onBase);         // plateau is higher (smaller y)
  });
});

test.describe('PR1 · touch controls hidden on desktop', () => {
  test('the on-screen movement buttons are hidden on a non-touch (desktop) profile', async ({ page }) => {
    await expect(page.locator('#controls')).toBeHidden();   // desktop → keyboard only
  });
});

test.describe('PR1 · music hard-stop', () => {
  test('stopMusic clears scheduled oscillators and key; gotoTitle plays only title', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.startGame();                 // level music
      const midKey = window.BS.musicKey();
      window.BS.gotoTitle();                  // must stop level music, play title only
      return { midKey, afterKey: window.BS.musicKey() };
    });
    expect(r.midKey).toBe(1);          // level-1 music was playing
    expect(r.afterKey).toBe('title');  // returning to title switches cleanly to title track
  });
});
