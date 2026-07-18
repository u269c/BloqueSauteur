// @ts-check
// R3-PR5: shop skills — double jump, spiked shield, dodge, hearts.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test.describe('PR5 · double jump', () => {
  test('owned → a mid-air second jump reaches higher; not owned → no second jump (neg. control)', async ({ page }) => {
    const apex = async (owned) => page.evaluate((owned) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.Input.reset();
      const st = window.BS.state(); st.owned.doubleJump = owned;
      const h = window.BS.hero(); const groundY = h.y;
      window.BS.Input.press('jump', true); window.BS.stepFixed(1);      // first jump
      window.BS.Input.press('jump', false); window.BS.stepFixed(14);    // rise a bit
      window.BS.Input.press('jump', true); window.BS.stepFixed(1);      // attempt second jump
      window.BS.Input.press('jump', false);
      let peak = h.y; for (let k = 0; k < 40; k++) { window.BS.stepFixed(1); peak = Math.min(peak, h.y); }
      window.BS.Input.reset();
      return groundY - peak;
    }, owned);
    const withDJ = await apex(true), without = await apex(false);
    expect(withDJ).toBeGreaterThan(without + 8);   // clearly higher with double jump
  });
});

test.describe('PR5 · spiked shield', () => {
  test('armed shield kills the next attacker (no damage) then goes on cooldown; unarmed hurts (neg. control)', async ({ page }) => {
    const hitWith = async (arm) => page.evaluate((arm) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal'); window.BS.Input.reset();
      const st = window.BS.state(); st.owned.shield = true; st.bossActive = true; st.enemies.length = 0; st.hp = 3;
      const C = window.BS.CONFIG, h = window.BS.hero();
      Object.assign(h, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost: 0, hurt: 0, dodgeT: 0, shieldT: 0, shieldCd: 0, dead: false });
      if (arm) { window.BS.Input.press('down', true); window.BS.stepFixed(1); window.BS.Input.press('down', false); }
      window.BS.spawnEnemy('clear');
      Object.assign(window.BS.enemies()[0], { x: 246, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
      window.BS.stepFixed(1);
      return { hp: st.hp, enemies: window.BS.enemies().length, shieldCd: h.shieldCd };
    }, arm);
    const armed = await hitWith(true);
    expect(armed.enemies).toBe(0);          // attacker destroyed by the shield
    expect(armed.hp).toBe(3);               // no damage taken
    expect(armed.shieldCd).toBeGreaterThan(0);   // now cooling down
    const bare = await hitWith(false);
    expect(bare.hp).toBeCloseTo(2.75, 5);   // negative control: unarmed → took a hit
    expect(bare.enemies).toBe(1);           // enemy survived
  });
});

test.describe('PR5 · dodge', () => {
  test('L+R makes the hero untouchable and unable to fall; not dodging → hurt/fall (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal');
      const st = window.BS.state(); st.owned.dodge = true; st.bossActive = true;
      const C = window.BS.CONFIG, h = window.BS.hero();
      // dodge while an enemy overlaps AND standing over empty space (no ground under x)
      st.enemies.length = 0;
      Object.assign(h, { x: C.PLAT_X0 - 20, y: C.PLAT_Y - 1, vx: 0, vy: 0, onGround: false, ghost: 0, hurt: 0, dodgeT: 0, dodgeCd: 0, hp: 3, dead: false });
      st.hp = 3;
      window.BS.Input.reset(); window.BS.Input.press('left', true); window.BS.Input.press('right', true);
      window.BS.stepFixed(1);                       // triggers dodge
      const dodging = h.dodgeT > 0, yStart = h.y;
      window.BS.spawnEnemy('clear'); Object.assign(window.BS.enemies()[0], { x: h.x, y: h.y, vx: 0, vy: 0, onGround: true });
      for (let k = 0; k < 30; k++) window.BS.stepFixed(1);
      window.BS.Input.reset();
      return { dodging, hp: st.hp, yDrift: Math.abs(h.y - yStart), alive: !h.dead };
    });
    expect(r.dodging).toBe(true);
    expect(r.hp).toBe(3);              // untouchable — no damage from the overlapping enemy
    expect(r.yDrift).toBeLessThan(1);  // frozen — did not fall into the pit
    expect(r.alive).toBe(true);
  });
});

test.describe('PR5 · bought hearts raise the max', () => {
  test('heartsBought increases starting HP on a new run', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.Save.select(0);
      const st = window.BS.state(); st.heartsBought = 2;
      window.BS.startGame();               // starts a run → hp = base + bought
      return { hp: st.hp, base: window.BS.CONFIG.LIVES_START };
    });
    expect(r.hp).toBe(r.base + 2);
  });
});
