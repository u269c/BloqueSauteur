// @ts-check
// v1.2-PR2: airborne combo scoring (N² total, cap 10x), resets on landing.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

// Kill `n` enemies while `airborne`, then read the total points gained.
async function chainKills(page, n, airborne) {
  return page.evaluate(({ n, airborne }) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
    const st = window.BS.state(); st.points = 0; st.combo = 0;
    st.hero.onGround = !airborne;                 // airborne=true → combo chain
    const p0 = st.points;
    for (let k = 0; k < n; k++) window.BS.addKill(240, 170, '#fff');
    return st.points - p0;
  }, { n, airborne });
}

test.describe('v1.2 · combos', () => {
  test('airborne chains score N²: 1→1, 2→4, 3→9, 4→16', async ({ page }) => {
    expect(await chainKills(page, 1, true)).toBe(1);
    expect(await chainKills(page, 2, true)).toBe(4);
    expect(await chainKills(page, 3, true)).toBe(9);
    expect(await chainKills(page, 4, true)).toBe(16);
  });

  test('combo multiplier caps at 10x', async ({ page }) => {
    // chain of 12: sum of 2k-1 for k=1..10 = 100, then two more at 19 each = 138
    expect(await chainKills(page, 12, true)).toBe(100 + 19 + 19);
  });

  test('grounded kills do NOT combo (neg. control): 3 kills = 3, not 9', async ({ page }) => {
    expect(await chainKills(page, 3, false)).toBe(3);
  });

  test('landing resets the chain', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const st = window.BS.state(); st.points = 0; st.combo = 0;
      st.hero.onGround = false;
      window.BS.addKill(240, 170, '#fff');   // combo 1  (+1)
      window.BS.addKill(240, 170, '#fff');   // combo 2  (+3) → total 4
      const afterTwo = st.points, comboMid = st.combo;
      st.hero.onGround = true;                // land → reset
      window.BS.state().combo = 0;            // (landing detection happens in the loop; emulate the reset)
      st.hero.onGround = false;
      window.BS.addKill(240, 170, '#fff');   // fresh chain: combo 1 again (+1)
      return { afterTwo, comboMid, afterReset: st.points - afterTwo, combo: st.combo };
    });
    expect(r.afterTwo).toBe(4);
    expect(r.comboMid).toBe(2);
    expect(r.afterReset).toBe(1);   // chain restarted at 1x
    expect(r.combo).toBe(1);
  });

  test('landing during play zeroes the combo (integration)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const st = window.BS.state(); const h = window.BS.hero();
      h.onGround = false; st.combo = 3;
      // put the hero on the ground and step: the loop should reset the combo on landing
      const C = window.BS.CONFIG; const sx = window.BS.findSafeX(window.BS.terrain());
      Object.assign(h, { x: sx, y: window.BS.surfaceAt(window.BS.terrain(), sx) - 20, vy: 50 });
      for (let k = 0; k < 40 && !h.onGround; k++) window.BS.stepFixed(1);
      return { onGround: h.onGround, combo: st.combo };
    });
    expect(r.onGround).toBe(true);
    expect(r.combo).toBe(0);
  });
});
