// @ts-check
// v1.1-PR3: holdable dodge, per-mode spawn speed, end-of-level heart.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test.describe('v1.1 · holdable dodge', () => {
  test('dodge persists while L+R held (up to 5s), ends on release, then cools down', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal');
      const st = window.BS.state(); st.owned.dodge = true; st.bossActive = true;
      const h = window.BS.hero(); window.BS.Input.reset();
      window.BS.Input.press('left', true); window.BS.Input.press('right', true);
      window.BS.stepFixed(1); const started = h.dodgeT;
      window.BS.stepFixed(120); const after1s = h.dodgeT;      // still holding → still dodging
      window.BS.Input.reset();                                  // release
      window.BS.stepFixed(1); const afterRelease = h.dodgeT, cd = h.dodgeCd;
      return { started, after1s, afterRelease, cd, max: window.BS.CONFIG.DODGE_TIME };
    });
    expect(r.started).toBeCloseTo(r.max, 1);      // starts at ~5s
    expect(r.after1s).toBeGreaterThan(3.5);       // ~4s left after holding 1s (still active)
    expect(r.after1s).toBeLessThan(r.max);
    expect(r.afterRelease).toBe(0);               // releasing ends it
    expect(r.cd).toBeGreaterThan(0);              // cooldown started
  });

  test('dodge caps at 5s even when held longer', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal');
      const st = window.BS.state(); st.owned.dodge = true; st.bossActive = true;
      const h = window.BS.hero(); window.BS.Input.reset();
      window.BS.Input.press('left', true); window.BS.Input.press('right', true);
      window.BS.stepFixed(6 * 120);                             // hold 6s
      window.BS.Input.reset();
      return { dodgeT: h.dodgeT, cd: h.dodgeCd };
    });
    expect(r.dodgeT).toBe(0);          // capped/ended by 5s
    expect(r.cd).toBeGreaterThan(0);
  });
});

test.describe('v1.1 · per-mode spawn speed', () => {
  test('RAGE spawns fastest, then NORMAL, then EASY', async ({ page }) => {
    const interval = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode(mode);
      const st = window.BS.state(); st.enemies.length = 0; st.hero.ghost = 1e9; st.spawnT = 0;
      window.BS.stepFixed(1);          // triggers a spawn → resets spawnT to the mode's interval
      return st.spawnT;
    }, mode);
    const easy = await interval('easy'), normal = await interval('normal'), rage = await interval('rage');
    expect(normal).toBeLessThan(easy);      // 1.2x faster than easy
    expect(rage).toBeLessThan(normal);      // 1.5x faster than easy (fastest)
    expect(easy / normal).toBeCloseTo(1.2, 1);
    expect(easy / rage).toBeCloseTo(1.5, 1);
  });
});

test.describe('v1.1 · end-of-level heart (Easy/Normal)', () => {
  test('clearing a boss grants a heart + animation in Easy/Normal, not in RAGE', async ({ page }) => {
    const clear = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.setMode(mode);
      const st = window.BS.state(); st.hero.ghost = 1e9; st.levelHearts = 0; st.heartAnim = null;
      const hp0 = st.hp;
      st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);
      const need = window.BS.boss().maxHits;
      for (let k = 0; k < need; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      return { levelHearts: st.levelHearts, hpDelta: st.hp - hp0, anim: !!st.heartAnim, gained: st.gainedLife };
    }, mode);
    const normal = await clear('normal'), rage = await clear('rage');
    expect(normal.levelHearts).toBe(1);      // gauge grew by one
    expect(normal.hpDelta).toBe(1);          // and refilled the new heart
    expect(normal.anim).toBe(true);          // heart-insert animation triggered
    expect(normal.gained).toBe(true);
    expect(rage.levelHearts).toBe(0);        // negative control: no heart in RAGE
    expect(rage.hpDelta).toBe(0);
    expect(rage.anim).toBe(false);
  });
});
