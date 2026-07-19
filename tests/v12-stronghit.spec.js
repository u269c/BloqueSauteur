// @ts-check
// v1.2-PR1: Strong Hit skill + merchant half-heart / new prices.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test.describe('v1.2 · Strong Hit', () => {
  test('DOWN in the air starts a hard dive (owned); on the ground it arms the shield instead', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const st = window.BS.state(), h = window.BS.hero(); st.owned.strongHit = true; st.owned.shield = true;
      // airborne → strong dive
      Object.assign(h, { y: window.BS.CONFIG.PLAT_Y - 30, onGround: false, vy: 0, strong: false, shieldT: 0, shieldCd: 0 });
      window.BS.Input.reset(); window.BS.Input.press('down', true); window.BS.stepFixed(1); window.BS.Input.press('down', false);
      const air = { strong: h.strong, vy: h.vy, shieldT: h.shieldT };
      // grounded → shield
      Object.assign(h, { onGround: true, strong: false, shieldT: 0, shieldCd: 0 });
      window.BS.Input.press('down', true); window.BS.stepFixed(1); window.BS.Input.press('down', false);
      return { air, groundShield: h.shieldT };
    });
    expect(r.air.strong).toBe(true);
    expect(r.air.vy).toBeGreaterThan(300);      // diving hard downward
    expect(r.air.shieldT).toBe(0);              // did NOT arm the shield in the air
    expect(r.groundShield).toBeGreaterThan(0);  // grounded DOWN armed the shield
  });

  test('landing a dive blasts nearby monsters (area kill) — none survive; without strong they do (neg. control)', async ({ page }) => {
    const run = async (strong) => page.evaluate((strong) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal');
      const st = window.BS.state(); st.owned.strongHit = true; st.bossActive = true; st.enemies.length = 0;
      const C = window.BS.CONFIG, h = window.BS.hero();
      Object.assign(h, { x: 240, y: C.PLAT_Y - 8, vx: 0, vy: 0, onGround: false, ghost: 1e9, strong });
      window.BS.spawnEnemy('clear');
      Object.assign(window.BS.enemies()[0], { x: 258, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });   // beside the hero, within blast range
      for (let k = 0; k < 30; k++) window.BS.stepFixed(1);
      return window.BS.enemies().length;
    }, strong);
    expect(await run(true)).toBe(0);    // blast cleared the neighbour
    expect(await run(false)).toBe(1);   // negative control: no strong dive, no blast
  });

  test('a strong dive onto the boss deals 2 hits', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal');   // flat L1, fixed seed → deterministic
      const st = window.BS.state(); st.owned.strongHit = true; window.BS.activateBoss();
      const C = window.BS.CONFIG, b = window.BS.boss(), h = window.BS.hero();
      Object.assign(b, { state: 'charge', iframe: 0, x: 240, y: C.PLAT_Y, onGround: true });
      Object.assign(h, { x: 240, y: C.PLAT_Y - b.r - 3, vy: 60, ghost: 0, strong: true });
      const hits0 = b.hits;
      window.BS.stepFixed(2);
      return { delta: window.BS.boss() ? window.BS.boss().hits - hits0 : 99 };
    });
    expect(r.delta).toBeGreaterThanOrEqual(2);   // double damage
  });
});

test.describe('v1.2 · merchant hearts', () => {
  test('half-heart adds ½ to max; prices are 40/75/110', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.Save.select(0); window.BS.startGame();
      const st = window.BS.state(), base = window.BS.CONFIG.LIVES_START;
      st.points = 200; window.BS.buyItem('halfHeart');
      const price = (k) => window.BS.SHOP_ITEMS.find((i) => i.key === k).price;
      return { heartsBought: st.heartsBought, maxDelta: (base + st.heartsBought) - base, prices: [price('halfHeart'), price('heart'), price('twoHearts')] };
    });
    expect(r.heartsBought).toBe(0.5);
    expect(r.maxDelta).toBe(0.5);
    expect(r.prices).toEqual([40, 75, 110]);
  });
});
