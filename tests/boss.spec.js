// @ts-check
// P5 boss acceptance tests. Physics driven via BS.stepFixed (frozen rAF).
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.BS.freeze(true); });
});

test.describe('P5 · boss emergence', () => {
  test('boss appears on reaching the level exit (arena); field clears', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(11); window.BS.setupArena(1);
      const st = window.BS.state();
      const before = !!window.BS.boss();     // still traversing → no boss yet
      window.BS.enterArena();                 // reach the exit → boss arena
      const after = !!window.BS.boss();
      return { before, after, phase: window.BS.phase(), bossActive: st.bossActive, enemyCount: window.BS.enemies().length, type: window.BS.boss() && window.BS.boss().type };
    });
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);          // boss now exists
    expect(r.phase).toBe('boss');
    expect(r.bossActive).toBe(true);
    expect(r.enemyCount).toBe(0);        // field cleared for the duel
    expect(r.type).toBe('clear');        // L1 boss is the transparent variant
  });

  test('boss variant matches the level (L2 red, L3 yellow, L4 rainbow)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const variant = (lvl) => { window.BS.start(); window.BS.reseed(1); window.BS.setupArena(lvl); window.BS.activateBoss(); return window.BS.boss().type; };
      return { l1: variant(1), l2: variant(2), l3: variant(3), l4: variant(4) };
    });
    expect(r).toEqual({ l1: 'clear', l2: 'red', l3: 'yellow', l4: 'rainbow' });
  });
});

test.describe('P5 · three stomps to die, look flips at hit 2', () => {
  test('hits 1→2→3 progress; enraged at 2; defeat at 3 advances the level', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1);
      const st = window.BS.state(); st.hitThisLevel = true;   // isolate: no no-hit bonus noise
      window.BS.activateBoss();
      const b = window.BS.boss();
      const seq = [];
      for (let k = 0; k < 3; k++) {
        b.iframe = 0;                       // clear stun so each scripted hit lands
        if (window.BS.boss()) window.BS.boss().iframe = 0;
        window.BS.bossHit();
        const bb = window.BS.boss();
        seq.push({ hits: bb ? bb.hits : 3, enraged: bb ? bb.hits >= 2 : true, aliveBoss: !!bb });
      }
      const sceneAfterKill = st.scene, levelAtClear = st.level;
      window.BS.tapAdvance();                 // CLEAR → SHOP
      window.BS.closeShop();                   // leave the merchant
      for (let k = 0; k < 200 && st.scene === 'SHOP'; k++) window.BS.stepFixed(1);
      return { seq, sceneAfterKill, levelAtClear, levelAfter: st.level, sceneAfter: st.scene, bossAliveAfter: !!window.BS.boss() };
    });
    expect(r.seq[0].hits).toBe(1);
    expect(r.seq[0].enraged).toBe(false);
    expect(r.seq[1].hits).toBe(2);
    expect(r.seq[1].enraged).toBe(true);      // look flips at 2 hits
    expect(r.seq[2].aliveBoss).toBe(false);   // dead at 3
    expect(r.bossAliveAfter).toBe(false);
    expect(r.sceneAfterKill).toBe('CLEAR');   // defeat → level-clear screen
    expect(r.levelAtClear).toBe(1);
    expect(r.levelAfter).toBe(2);             // advancing past CLEAR → level 2
    expect(r.sceneAfter).toBe('INTRO');
  });

  test('i-frames block a rapid second stomp (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.activateBoss();
      const b = window.BS.boss();
      b.iframe = 0; window.BS.bossHit();                 // lands → hits 1, sets i-frames
      const h1 = window.BS.boss().hits;
      window.BS.bossHit();                               // immediately again → blocked
      const h2 = window.BS.boss().hits;
      return { h1, h2 };
    });
    expect(r.h1).toBe(1);
    expect(r.h2).toBe(1);      // negative control: i-frames prevented the second hit
  });
});

test.describe('P5 · attack patterns', () => {
  test('L1 boss charges then returns (cycles through both states)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1);
      const st = window.BS.state(); st.hero.ghost = 1e9;   // don't let contact interfere
      window.BS.activateBoss();
      const states = new Set(); let minX = 9999, maxX = -9999;
      for (let i = 0; i < 12 * 120; i++) {                 // 12 s
        window.BS.stepFixed(1);
        const b = window.BS.boss(); if (!b) break;
        states.add(b.state); minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      }
      return { states: [...states], travelled: maxX - minX };
    });
    expect(r.states).toContain('charge');
    expect(r.states).toContain('return');
    expect(r.travelled).toBeGreaterThan(80);    // actually sweeps across the platform
  });

  test('boss never falls into a hole/lava on a hole-heavy level (regression)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(31337); window.BS.setupArena(4);
      const st = window.BS.state(); st.hero.ghost = 1e9;
      window.BS.activateBoss();
      const C = window.BS.CONFIG, base = window.BS.terrain().baseTop;
      let maxY = -1, everAlive = true;
      for (let i = 0; i < 20 * 120; i++) {                 // 20 s of charging/returning
        window.BS.stepFixed(1);
        const b = window.BS.boss(); if (!b) break;
        maxY = Math.max(maxY, b.y);
      }
      return { maxY, base, lava: C.LAVA_Y };
    });
    expect(r.maxY).toBeLessThanOrEqual(r.base + 0.5);   // never dropped below the platform line
    expect(r.maxY).toBeLessThan(r.lava);                // and certainly never into the lava
  });

  test('L4 rainbow boss uses a telegraph wind-up (feint capability)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(3); window.BS.setupArena(4);
      const st = window.BS.state(); st.hero.ghost = 1e9;
      window.BS.activateBoss();
      const states = new Set();
      for (let i = 0; i < 12 * 120; i++) { window.BS.stepFixed(1); const b = window.BS.boss(); if (!b) break; states.add(b.state); }
      return { states: [...states] };
    });
    expect(r.states).toContain('telegraph');    // wind-up state unique to the rainbow boss
  });

  test('L1 boss does NOT telegraph (neg. control for the L4 pattern)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(3); window.BS.setupArena(1);
      const st = window.BS.state(); st.hero.ghost = 1e9;
      window.BS.activateBoss();
      const states = new Set();
      for (let i = 0; i < 12 * 120; i++) { window.BS.stepFixed(1); const b = window.BS.boss(); if (!b) break; states.add(b.state); }
      return { states: [...states] };
    });
    expect(r.states).not.toContain('telegraph');
    expect(r.states).not.toContain('feint');
  });
});

test.describe('P5 · boss contact hurts the hero', () => {
  test('charging into the hero deals a hit (knock, no life lost)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.setMode('normal');
      const st = window.BS.state(); st.hp = 3;
      window.BS.activateBoss();
      const b = window.BS.boss(), C = window.BS.CONFIG, h = window.BS.hero();
      // put the boss mid-charge, hero directly in front on the ground
      Object.assign(b, { state: 'charge', iframe: 0, x: 260, y: C.PLAT_Y, onGround: true });
      Object.assign(h, { x: 250, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost: 0, hurt: 0, dead: false });
      window.BS.stepFixed(1);
      return { hurt: h.hurt, vx: h.vx, hp: st.hp };
    });
    expect(r.hurt).toBeGreaterThan(0);    // took a hit
    expect(r.hp).toBeCloseTo(2.75, 5);    // Normal: chipped 1/4 heart
  });
});
