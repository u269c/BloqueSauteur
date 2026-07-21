// @ts-check
// v2.0 · scrolling engine — traversal level shape, camera, one-way floats,
// reaching the exit → boss arena, and the per-level arena hole/box spec.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test.describe('v2.0 · traversal level shape', () => {
  test('genLevel builds a solid left→right strip with jumpable holes + floats + exit', async ({ page }) => {
    const r = await page.evaluate(() => {
      const C = window.BS.CONFIG, lvl = window.BS.genLevel(3, 123);
      // holes = gaps between consecutive ground segments
      const holes = [];
      for (let i = 0; i < lvl.ground.length - 1; i++) { const g = lvl.ground[i + 1].x0 - lvl.ground[i].x1; if (g > 0) holes.push(g); }
      return {
        ground: lvl.ground.length, floats: lvl.floats.length, enemies: lvl.enemies.length,
        startSolid: lvl.ground[0].x0, width: lvl.width, exitX: lvl.exitX,
        maxHole: Math.max(...holes), holeCount: holes.length, MAX: C.MAX_JUMP_GAP,
        screens: +(lvl.width / C.W).toFixed(1),
      };
    });
    expect(r.startSolid).toBe(0);                   // solid ground at the very start
    expect(r.exitX).toBeLessThan(r.width);          // exit sits before the far end
    expect(r.floats).toBeGreaterThan(0);            // jump-up platforms exist
    expect(r.enemies).toBeGreaterThan(0);           // enemies pre-placed
    expect(r.maxHole).toBeLessThanOrEqual(r.MAX);   // every hole is jumpable
    expect(r.screens).toBeGreaterThan(2);           // it's a real scroll (multiple screens)
  });

  test('later levels are longer / have more holes than early ones', async ({ page }) => {
    const r = await page.evaluate(() => {
      const w = (n) => window.BS.genLevel(n, 7).width;
      return { w1: w(1), w5: w(5) };
    });
    expect(r.w5).toBeGreaterThan(r.w1);   // L5 is a longer trek than L1
  });
});

test.describe('v2.0 · camera', () => {
  test('camera follows the hero and clamps to [0, width−W] (neg. control: never < 0)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const C = window.BS.CONFIG, lvl = window.BS.levelData(), h = window.BS.hero();
      const camAt = (x) => { h.x = x; h.vx = 0; window.BS.stepFixed(1); return window.BS.cam().x; };
      const atStart = camAt(0);                      // far left
      const atMid = camAt(Math.round(lvl.width / 2));
      const atEnd = camAt(lvl.width - 5);            // far right (before triggering exit)
      return { atStart, atMid, atEnd, width: lvl.width, W: C.W, max: lvl.width - C.W };
    });
    expect(r.atStart).toBe(0);                        // clamped left — never negative
    expect(r.atMid).toBeGreaterThan(0);               // scrolled to follow
    expect(r.atMid).toBeLessThanOrEqual(r.max);
    expect(r.atEnd).toBeLessThanOrEqual(r.max + 0.5); // clamped right
  });
});

test.describe('v2.0 · one-way (jump-through) floats', () => {
  test('land on a float from above; pass up through it from below (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const lvl = window.BS.levelData(), f = lvl.floats[0], h = window.BS.hero();
      const cx = f.x + f.w / 2;
      // (a) drop onto the float top → should land
      Object.assign(h, { x: cx, y: f.y - 20, vx: 0, vy: 0, onGround: false, dead: false, ghost: 1e9 });
      for (let k = 0; k < 40 && !h.onGround; k++) window.BS.stepFixed(1);
      const landed = h.onGround && Math.abs(h.y - f.y) < 2;
      // (b) rise from just below → should pass THROUGH the underside (not blocked there)
      Object.assign(h, { x: cx, y: f.y + 3, vx: 0, vy: -300, onGround: false, dead: false, ghost: 1e9 });
      let passed = false, caughtUnder = false;
      for (let k = 0; k < 16; k++) { window.BS.stepFixed(1); if (h.y < f.y - 2) passed = true; if (h.onGround && Math.abs(h.y - f.y) < 2 && h.vy === 0 && !passed) caughtUnder = true; }
      return { landed, passed, caughtUnder };
    });
    expect(r.landed).toBe(true);        // one-way top is solid to a falling hero
    expect(r.passed).toBe(true);        // …but transparent to one rising from below
    expect(r.caughtUnder).toBe(false);  // never blocked/caught on the underside
  });
});

test.describe('v2.0 · traverse → boss arena', () => {
  test('reaching the exit locks into the boss arena and spawns the boss (no timer)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(2);
      const before = { phase: window.BS.phase(), boss: !!window.BS.boss() };
      const h = window.BS.hero();
      h.x = window.BS.levelData().exitX + 4; window.BS.stepFixed(1);   // step across the exit line
      return { before, after: { phase: window.BS.phase(), boss: !!window.BS.boss(), enemies: window.BS.enemies().length } };
    });
    expect(r.before.phase).toBe('traverse');
    expect(r.before.boss).toBe(false);        // neg. control: no boss while traversing
    expect(r.after.phase).toBe('boss');
    expect(r.after.boss).toBe(true);          // boss spawned on arrival, not on a 60s clock
  });
});

test.describe('v2.0 · enemies live in the level (Phase C)', () => {
  test('pre-placed enemies activate as they scroll into view and patrol (never fall in a hole)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.freeze(true); window.BS.start(); window.BS.reseed(5); window.BS.setLevel(3);
      const C = window.BS.CONFIG, lvl = window.BS.levelData(), h = window.BS.hero(); h.ghost = 1e9;
      let fell = 0, moved = false;
      for (let seg = 0; seg <= 30; seg++) {         // scrub the camera across the level
        h.x = Math.min(lvl.exitX - 10, (seg / 30) * lvl.exitX); h.vx = 0;
        for (const e of window.BS.enemies()) { const x0 = e.x; }
        for (let k = 0; k < 20; k++) window.BS.stepFixed(1);
        for (const e of window.BS.enemies()) { if (e.y >= C.LAVA_Y - 1) fell++; if (Math.abs(e.vx) > 1) moved = true; }
      }
      return { placements: lvl.enemies.length, activated: lvl.enemies.filter((e) => e.active).length, fell, moved };
    });
    expect(r.placements).toBeGreaterThan(0);
    expect(r.activated).toBe(r.placements);   // all activated as the camera passed them
    expect(r.moved).toBe(true);               // they patrol (march) …
    expect(r.fell).toBe(0);                   // …and turn at edges instead of walking into holes
  });
});

test.describe('v2.0 · boss-arena spec (holes + boxes per level)', () => {
  test('arena hole counts match the table (0,2,2,3,3)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const holesOf = (level) => {
        const t = window.BS.genArena(level, 999); let n = 0;
        for (let i = 0; i < t.segments.length - 1; i++) if (t.segments[i + 1].x0 > t.segments[i].x1) n++;
        return n;
      };
      return [1, 2, 3, 4, 5].map(holesOf);
    });
    expect(r).toEqual([0, 2, 2, 3, 3]);
  });

  test('spawn-box counts match the table and RAGE adds a side', async ({ page }) => {
    const boxes = async (level, mode) => page.evaluate(({ level, mode }) => {
      window.BS.setMode(mode); window.BS.setLevel(level); return window.BS.arenaBoxes();
    }, { level, mode });
    expect(await Promise.all([1, 2, 3, 4, 5].map((l) => boxes(l, 'normal')))).toEqual([0, 0, 1, 1, 2]);
    // RAGE adds one spawn side everywhere (capped at 2) — harder duels
    expect(await Promise.all([1, 2, 3, 4, 5].map((l) => boxes(l, 'rage')))).toEqual([1, 1, 2, 2, 2]);
  });
});
