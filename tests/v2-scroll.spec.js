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
  test('genLevel builds a solid strip with holes, multi-tier floats, enemies + exit', async ({ page }) => {
    const r = await page.evaluate(() => {
      const C = window.BS.CONFIG, lvl = window.BS.genLevel(3, 123);
      const holes = [];
      for (let i = 0; i < lvl.ground.length - 1; i++) { const g = lvl.ground[i + 1].x0 - lvl.ground[i].x1; if (g > 0) holes.push(g); }
      const tiers = new Set(lvl.floats.map((f) => Math.round((lvl.top - f.y) / 26)));
      return {
        startSolid: lvl.ground[0].x0, width: lvl.width, exitX: lvl.exitX,
        floats: lvl.floats.length, enemies: lvl.enemies.length, holeCount: holes.length,
        maxTier: Math.max(...tiers), screens: +(lvl.width / C.W).toFixed(1),
      };
    });
    expect(r.startSolid).toBe(0);              // solid ground at the very start
    expect(r.exitX).toBeLessThan(r.width);
    expect(r.floats).toBeGreaterThan(0);
    expect(r.enemies).toBeGreaterThan(0);
    expect(r.holeCount).toBeGreaterThan(0);
    expect(r.maxTier).toBeGreaterThanOrEqual(2);   // multi-tier float staircases over large holes
    expect(r.screens).toBeGreaterThan(2);
  });

  test('later levels are longer than early ones', async ({ page }) => {
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
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(3);   // L3 uses the horizontal exit (L2 is a pit)
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

  test('L2 sky-climb ends in a boss VOID: dropping into the pit enters the arena', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(3); window.BS.setLevel(2);
      const lvl = window.BS.levelData(), h = window.BS.hero();
      const hasPit = !!lvl.bossPit, hasSign = !!lvl.bossSign;
      Object.assign(h, { x: (lvl.bossPit.x0 + lvl.bossPit.x1) / 2, y: lvl.top + 20, vy: 30, onGround: false, dead: false });
      window.BS.stepFixed(1);
      return { hasPit, hasSign, phase: window.BS.phase() };
    });
    expect(r.hasPit).toBe(true);
    expect(r.hasSign).toBe(true);     // neon BOSS sign marks the drop
    expect(r.phase).toBe('boss');     // dropping into the void → boss arena (not death)
  });
});

test.describe('v2.0 · enemies live in the level (Phase C)', () => {
  test('pre-placed enemies activate as they scroll into view and patrol (never fall in a hole)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.freeze(true); window.BS.start(); window.BS.reseed(5); window.BS.setLevel(3);
      const C = window.BS.CONFIG, lvl = window.BS.levelData(), h = window.BS.hero(); h.ghost = 1e9;
      let fell = 0, moved = false;
      // park the hero on each ground run (skip the exit pad → never trip the arena) so the
      // camera sweeps the whole level reliably, past every pre-placed enemy.
      for (const g of lvl.ground.slice(0, -1)) {
        Object.assign(h, { x: (g.x0 + g.x1) / 2, y: g.top, vx: 0, vy: 0, onGround: true, dead: false });
        for (let k = 0; k < 8; k++) window.BS.stepFixed(1);
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

test.describe('v1.7 · level tuning (bigger, fewer holes, raised grounds)', () => {
  test('L2 has the biggest platforms; all floats sit above ground level (no walk-through base)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const C = window.BS.CONFIG, T = C.TILE;
      const stat = (lv) => { const l = window.BS.genLevel(lv, 4); return {
        avg: l.ground.reduce((s, g) => s + (g.x1 - g.x0), 0) / l.ground.length / T,
        raised: l.ground.filter((g) => g.top < C.PLAT_Y).length,
        maxFloatY: l.floats.length ? Math.max(...l.floats.map((f) => f.y)) : -1e9, top: l.top, tier: 26,
      }; };
      return { l1: stat(1), l2: stat(2), l3: stat(3), l5: stat(5) };
    });
    expect(r.l2.avg).toBeGreaterThan(r.l1.avg);   // L2 platforms are the biggest
    expect(r.l2.avg).toBeGreaterThan(r.l3.avg);
    expect(r.l1.avg).toBeGreaterThan(6);          // all bigger than the old 4-8
    // every float is at least one tier up (no ground-level float that you fall past)
    for (const s of [r.l1, r.l2, r.l3, r.l5]) if (s.maxFloatY > -1e8) expect(s.maxFloatY).toBeLessThanOrEqual(s.top - s.tier + 0.01);
    expect(r.l1.raised + r.l5.raised).toBeGreaterThan(0);   // raised grounds exist
  });

  test('a raised ground is a solid wall (blocked walking in; can jump onto it)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const C = window.BS.CONFIG, top = C.PLAT_Y, lvl = window.BS.levelData();
      lvl.ground = [{ x0: 0, x1: 200, top }, { x0: 200, x1: 320, top: top - 26 }, { x0: 320, x1: 700, top }];
      lvl.floats = []; lvl.width = 700; lvl.exitX = 690; lvl.bossPit = null;
      const h = window.BS.hero(); Object.assign(h, { x: 150, y: top, vx: 0, vy: 0, onGround: true, ghost: 1e9, dead: false });
      window.BS.Input.reset(); window.BS.Input.press('right', true);
      for (let k = 0; k < 90; k++) window.BS.stepFixed(1);
      const blockedX = h.x, blockedY = h.y;                 // walked into the wall → stopped, stayed low
      let onTop = false;
      for (let j = 0; j < 8; j++) {
        window.BS.Input.press('jump', true);
        for (let k = 0; k < 20; k++) { window.BS.stepFixed(1); if (h.onGround && h.y < top - 10 && h.x > 205 && h.x < 320) onTop = true; }
        window.BS.Input.press('jump', false); window.BS.stepFixed(2);
      }
      window.BS.Input.reset();
      return { blockedX, blockedY, top, onTop };
    });
    expect(r.blockedX).toBeLessThan(205);            // couldn't walk through the raised wall
    expect(r.blockedY).toBeGreaterThan(r.top - 6);   // stayed at the low level (didn't teleport up)
    expect(r.onTop).toBe(true);                      // …but jumping gets you onto the plateau
  });
});

test.describe('v1.7 · climbing (ropes/ladders/vines/chains/poles)', () => {
  test('climbables: L1 none, all five kinds exist across L3+; hold ↑ climbs to the top', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.freeze(true);
      const kinds = new Set(); let l1 = 0;
      for (let lv = 1; lv <= 5; lv++) for (let s = 0; s < 40; s++) { const cs = window.BS.genLevel(lv, s).climbables || []; if (lv === 1) l1 += cs.length; cs.forEach((c) => kinds.add(c.kind)); }
      window.BS.start(); window.BS.reseed(3); window.BS.setLevel(3);
      const c = window.BS.climbables()[0], h = window.BS.hero(); h.ghost = 1e9;
      Object.assign(h, { x: c.x, y: c.bot, vx: 0, vy: 0, onGround: true, dead: false });
      window.BS.Input.reset(); window.BS.Input.press('jump', true);
      let reachedTop = false;
      for (let k = 0; k < 500; k++) { window.BS.stepFixed(1); if (Math.abs(h.y - c.top) < 2) reachedTop = true; }
      window.BS.Input.reset();
      return { kinds: [...kinds].sort(), l1, reachedTop };
    });
    expect(r.kinds).toEqual(['chain', 'ladder', 'pole', 'rope', 'vine']);
    expect(r.l1).toBe(0);             // none on level 1 (L2 gets gauntlet ropes)
    expect(r.reachedTop).toBe(true);  // climbed all the way up
  });

  test('every level 2+ has a sky-gauntlet (rope up + float maze + rope down)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const gaunt = (lv) => { let min = 99; for (let s = 0; s < 20; s++) min = Math.min(min, window.BS.genLevel(lv, s).climbables.filter((c) => c.kind === 'rope').length); return min; };
      return { l1: window.BS.genLevel(1, 1).climbables.filter((c) => c.kind === 'rope').length, l2: gaunt(2), l5: gaunt(5) };
    });
    expect(r.l1).toBe(0);              // no gauntlet on L1
    expect(r.l2).toBeGreaterThanOrEqual(2);   // ≥1 gauntlet = ≥2 ropes (up + down), every seed
    expect(r.l5).toBeGreaterThanOrEqual(2);
  });

  test('a climbable is ignored without an up/down press (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(3); window.BS.setLevel(3);
      const c = window.BS.climbables()[0], h = window.BS.hero(); h.ghost = 1e9;
      Object.assign(h, { x: c.x, y: c.bot, vx: 0, vy: 0, onGround: true, dead: false });
      window.BS.Input.reset();
      for (let k = 0; k < 60; k++) window.BS.stepFixed(1);
      return { climbing: h.climbing, y: Math.round(h.y), bot: c.bot };
    });
    expect(r.climbing).toBe(false);   // didn't grab on its own
    expect(r.y).toBe(r.bot);          // stayed on the ground
  });
});

test.describe('v1.7 · hazards (22 types)', () => {
  test('there are 22 hazard kinds across levels; none on L1', async ({ page }) => {
    const r = await page.evaluate(() => {
      const kinds = new Set(); let l1 = 0;
      for (let lv = 1; lv <= 5; lv++) for (let s = 0; s < 120; s++) { const hs = window.BS.genLevel(lv, s).hazards || []; if (lv === 1) l1 += hs.length; hs.forEach((h) => kinds.add(h.kind)); }
      return { count: kinds.size, l1 };
    });
    expect(r.count).toBeGreaterThanOrEqual(20);
    expect(r.count).toBe(22);
    expect(r.l1).toBe(0);              // L1 stays hazard-free
  });

  test('hazards are bound to their world theme (no cross-world kinds)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const byWorld = window.BS.HAZARDS_BY_WORLD;
      const offenders = [];
      for (const world of Object.keys(byWorld)) {
        const pool = new Set(byWorld[world]);
        for (let lv = 2; lv <= 5; lv++) for (let s = 0; s < 30; s++) {
          for (const h of window.BS.genLevel(lv, s, world).hazards || []) if (!pool.has(h.kind)) offenders.push(world + ':' + h.kind);
        }
      }
      // neg. control: the full 22-kind list contains kinds NOT in the classic world's set
      const cls = new Set(byWorld.classic);
      const leaks = window.BS.HAZARD_KINDS.filter((k) => !cls.has(k)).length;
      return { count: offenders.length, sample: offenders.slice(0, 5), leaks, worlds: Object.keys(byWorld).length };
    });
    expect(r.count).toBe(0);                 // every placed hazard belongs to its world's set
    expect(r.sample).toEqual([]);
    expect(r.worlds).toBe(10);
    expect(r.leaks).toBeGreaterThan(0);      // neg. control: not all kinds fit one world
  });

  test('a hazard hurts the hero; ghost/dodge passes through (neg. control)', async ({ page }) => {
    const hp = (ghost) => page.evaluate((ghost) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(4); window.BS.setMode('normal');
      const lvl = window.BS.levelData(), C = window.BS.CONFIG;
      lvl.hazards = [{ x: 300, top: C.PLAT_Y, kind: 'spikes', ph: 0, range: 20 }];   // always-on
      const st = window.BS.state(); st.hp = 5; const h = window.BS.hero();
      Object.assign(h, { x: 300, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost, hurt: 0, dead: false });
      window.BS.stepFixed(1);
      return st.hp;
    }, ghost);
    expect(await hp(0)).toBeLessThan(5);        // spikes chipped a heart
    expect(await hp(1e9)).toBe(5);              // neg. control: ghostly → passes through
  });
});

test('no raised ground is higher than a normal jump can reach (fairness)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const C = window.BS.CONFIG, TIER = 26;
    const apex = (C.JUMP_V * C.JUMP_V) / (2 * C.G_HELD);   // max jump height
    let maxRise = 0;
    for (let lv = 1; lv <= 5; lv++) for (let s = 0; s < 60; s++) {
      for (const g of window.BS.genLevel(lv, s).ground) maxRise = Math.max(maxRise, C.PLAT_Y - g.top);
    }
    return { maxRise, apex: +apex.toFixed(1), tier: TIER };
  });
  expect(r.maxRise).toBeLessThanOrEqual(r.tier);   // never more than one tier up
  expect(r.tier).toBeLessThan(r.apex);             // …and one tier is jumpable
});
