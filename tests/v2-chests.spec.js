// @ts-check
// v2.0 · treasure chests + mushrooms — placement (2/2/3/3/4, ~25% bad), stomp-to-open,
// and each of the six mushroom effects.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test('chest counts per level are 2/2/3/3/4 and ~25% are bad', async ({ page }) => {
  const r = await page.evaluate(() => {
    const counts = [1, 2, 3, 4, 5].map((lv) => window.BS.genLevel(lv, 1).chests.length);
    let total = 0, bad = 0;
    for (let s = 0; s < 300; s++) for (const ch of window.BS.genLevel(4, s).chests) { total++; if (ch.bad) bad++; }
    return { counts, badPct: bad / total };
  });
  expect(r.counts).toEqual([2, 2, 3, 3, 4]);
  expect(r.badPct).toBeGreaterThan(0.15);
  expect(r.badPct).toBeLessThan(0.35);   // ~25%
});

test('stomping a chest opens it and pops a mushroom; a side bump does not (neg. control)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const drop = (fromAbove) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const ch = window.BS.chests()[0], h = window.BS.hero(); h.ghost = 1e9;
      if (fromAbove) Object.assign(h, { x: ch.x, y: ch.top - 26, vx: 0, vy: 40, onGround: false, dead: false });
      else Object.assign(h, { x: ch.x, y: ch.top, vx: 0, vy: 0, onGround: true, dead: false });   // sitting beside/on, not falling
      let sawPickup = false;
      for (let k = 0; k < 30; k++) { window.BS.stepFixed(1); if (window.BS.pickups().length) sawPickup = true; }
      return { opened: ch.opened, sawPickup };
    };
    return { stomp: drop(true), side: drop(false) };
  });
  expect(r.stomp.opened).toBe(true);
  expect(r.stomp.sawPickup).toBe(true);   // a mushroom popped out (then got collected)
  expect(r.side.opened).toBe(false);      // neg. control: not a stomp → stays closed
  expect(r.side.sawPickup).toBe(false);
});

test('good mushrooms: heal +2, money +25, teleport → boss arena', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(2);
    const st = window.BS.state(); st.hp = 3; st.points = 0;
    window.BS.applyMushroom('heal');  const healHp = st.hp;
    window.BS.applyMushroom('money'); const money = st.points;
    window.BS.applyMushroom('teleport'); const phase = window.BS.phase(), boss = !!window.BS.boss();
    return { healHp, money, phase, boss };
  });
  expect(r.healHp).toBe(5);     // +2 hearts
  expect(r.money).toBe(25);     // +25 points
  expect(r.phase).toBe('boss'); // teleported to the boss arena
  expect(r.boss).toBe(true);
});

test('high-jump mushroom makes the next jump far higher (neg. control: normal jump)', async ({ page }) => {
  const apex = async (big) => page.evaluate((big) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.Input.reset();
    const C = window.BS.CONFIG, h = window.BS.hero();
    Object.assign(h, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, dead: false, ghost: 1e9 });
    if (big) window.BS.applyMushroom('highjump');
    window.BS.Input.press('jump', true);   // hold for full height
    let minY = h.y;
    for (let k = 0; k < 120; k++) { window.BS.stepFixed(1); minY = Math.min(minY, h.y); }
    return C.PLAT_Y - minY;
  }, big);
  const big = await apex(true), normal = await apex(false);
  expect(normal).toBeGreaterThan(20);
  expect(big).toBeGreaterThan(normal + 100);   // ~8x the height
});

test('monster-attracting mushroom drops ~10 monsters just ahead', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(3);
    const st = window.BS.state(); st.enemies.length = 0;
    window.BS.applyMushroom('swarm');
    return window.BS.enemies().length;
  });
  expect(r).toBeGreaterThanOrEqual(8);   // up to 10 (a couple may skip a hole slot)
  expect(r).toBeLessThanOrEqual(10);
});

test('poison mushroom: dizzy wobble for ~2s, then a fall costs a heart', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal');
    const st = window.BS.state(), h = window.BS.hero(); st.hp = 5; h.ghost = 0;
    window.BS.applyMushroom('poison');
    const dizzy0 = h.dizzy;
    let wobbleObserved = false;
    for (let k = 0; k < 400; k++) { window.BS.stepFixed(1); if (h.dizzy > 0) wobbleObserved = true; }
    return { dizzy0, wobbleObserved, hp: st.hp };
  });
  expect(r.dizzy0).toBeCloseTo(2, 1);   // 2s of wobble
  expect(r.wobbleObserved).toBe(true);
  expect(r.hp).toBeLessThan(5);         // after the wobble the hero fell → lost a heart
});

test('heal is the most common good mushroom (weighted up)', async ({ page }) => {
  const c = await page.evaluate(() => {
    const counts = {};
    for (let s = 0; s < 400; s++) for (const ch of window.BS.genLevel(4, s).chests) counts[ch.type] = (counts[ch.type] || 0) + 1;
    return counts;
  });
  expect(c.heal).toBeGreaterThan(c.money);      // heal weighted higher than the other good shrooms
  expect(c.heal).toBeGreaterThan(c.highjump);
});
