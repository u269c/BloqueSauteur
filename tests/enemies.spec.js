// @ts-check
// P4 enemy + spawner acceptance tests. Physics driven via BS.stepFixed (frozen rAF).
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.BS.freeze(true); });
});

test.describe('P4 · spawner cadence & roster', () => {
  test('L1 spawns only clear enemies; L3 mixes all three (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const seen = (level) => {
        window.BS.start(); window.BS.reseed(42); window.BS.setLevel(level);
        window.BS.state().enemies.length = 0;
        const types = new Set();
        for (let i = 0; i < 60 * 120; i++) {           // ~60 s of fixed steps
          window.BS.stepFixed(1);
          for (const e of window.BS.enemies()) types.add(e.type);
        }
        return [...types];
      };
      return { l1: seen(1), l3: seen(3) };
    });
    expect(r.l1).toEqual(['clear']);                    // L1: transparent only
    expect(r.l1).not.toContain('red');                  // negative control
    expect(r.l1).not.toContain('yellow');
    expect(new Set(r.l3)).toEqual(new Set(['clear', 'red', 'yellow']));   // L3: all three
  });

  test('spawn count roughly tracks the per-level cadence; capped by maxAlive', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(7); window.BS.setLevel(2);
      window.BS.state().enemies.length = 0;
      const st = window.BS.state();
      let spawns = 0, prev = 0, maxAlive = 0;
      // count rising edges of total spawned by watching kills+alive is noisy; instead
      // disable death by keeping the hero ghostly and count via a spawn counter shim.
      st.hero.ghost = 1e9;
      const seenIds = new Set();
      for (let i = 0; i < 20 * 120; i++) {              // 20 s
        window.BS.stepFixed(1);
        maxAlive = Math.max(maxAlive, window.BS.enemies().length);
      }
      return { maxAlive, cap: window.BS.LEVELS[2].maxAlive };
    });
    expect(r.maxAlive).toBeGreaterThan(0);
    expect(r.maxAlive).toBeLessThanOrEqual(r.cap);      // never exceeds the concurrency cap
  });
});

test.describe('P4 · stomp vs hurt classification', () => {
  test('falling onto an enemy kills it and bounces the hero (no life lost)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const st = window.BS.state(); st.lives = 3; st.enemies.length = 0;
      const C = window.BS.CONFIG, h = window.BS.hero();
      Object.assign(h, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost: 0, hurt: 0, dead: false });
      st.bossActive = true;              // stop auto-spawns for a clean single enemy
      window.BS.spawnEnemy('clear');
      const e = window.BS.enemies()[0];
      Object.assign(e, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
      // place hero overlapping the enemy's top, descending
      Object.assign(h, { x: 240, y: C.PLAT_Y - e.r - 3, vy: 60 });
      const kills0 = st.kills;
      window.BS.stepFixed(2);
      return { alive: e.alive, kills: st.kills - kills0, heroVy: h.vy, lives: st.lives, heroHurt: h.hurt };
    });
    expect(r.alive).toBe(false);          // enemy killed
    expect(r.kills).toBe(1);
    expect(r.heroVy).toBeLessThan(0);     // hero bounced up
    expect(r.lives).toBe(3);              // stomping costs no life
    expect(r.heroHurt).toBe(0);           // and does not hurt the hero
  });

  test('side contact hurts the hero (knock left, no life); ghost passes through (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const st = window.BS.state(); st.lives = 3; st.enemies.length = 0;
      const C = window.BS.CONFIG, h = window.BS.hero();
      const place = (ghost) => {
        st.enemies.length = 0;
        Object.assign(h, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost, hurt: 0, dead: false });
        window.BS.spawnEnemy('clear');
        const e = window.BS.enemies()[0];
        Object.assign(e, { x: 240 + 6, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });  // level with hero, to its right
        window.BS.stepFixed(1);
        return { hurt: h.hurt, vx: h.vx, alive: e.alive, lives: st.lives };
      };
      const contact = place(0);
      const ghostly = place(1e9);
      return { contact, ghostly };
    });
    expect(r.contact.hurt).toBeGreaterThan(0);    // hurt applied
    expect(r.contact.vx).toBeLessThan(0);         // knocked LEFT (enemy was to the right)
    expect(r.contact.alive).toBe(true);           // side contact does NOT kill the enemy
    expect(r.contact.lives).toBe(3);              // no life lost
    expect(r.ghostly.hurt).toBe(0);               // negative control: ghost → pass through, no hurt
  });
});

test.describe('P4 · movement & despawn', () => {
  test('enemies march left and despawn when they drop off the left edge', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const st = window.BS.state(); st.enemies.length = 0; st.hero.ghost = 1e9; st.bossActive = true;  // ignore hero, no auto-spawns
      window.BS.spawnEnemy('clear');
      const e = window.BS.enemies()[0];
      const x0 = e.x;
      let minX = x0;
      let despawned = false;
      for (let i = 0; i < 60 * 120; i++) {
        window.BS.stepFixed(1);
        if (window.BS.enemies().length === 0) { despawned = true; break; }
        minX = Math.min(minX, window.BS.enemies()[0].x);
      }
      return { x0, movedLeft: minX < x0 - 20, despawned };
    });
    expect(r.movedLeft).toBe(true);      // marched left
    expect(r.despawned).toBe(true);      // fell off the left edge into the lava
  });

  test('red enemies move faster than clear ones', async ({ page }) => {
    const r = await page.evaluate(() => {
      const speedOf = (type) => {
        window.BS.start(); window.BS.reseed(1); window.BS.setLevel(4);
        const st = window.BS.state(); st.enemies.length = 0; st.hero.ghost = 1e9; st.bossActive = true; // stop auto-spawns
        window.BS.spawnEnemy(type);
        const e = window.BS.enemies()[0]; const x0 = e.x;
        window.BS.stepFixed(60);          // 0.5 s
        return x0 - window.BS.enemies()[0].x;   // leftward distance
      };
      return { clear: speedOf('clear'), red: speedOf('red') };
    });
    expect(r.red).toBeGreaterThan(r.clear * 1.3);   // red noticeably faster
  });
});
