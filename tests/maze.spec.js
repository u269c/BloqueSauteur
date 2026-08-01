// @ts-check
// Level 6 — THE LABYRINTH. Two layers of tests:
//   • ENGINE unit tests drive collideHeroMaze against a small synthetic grid (fully
//     controlled: walls, floor, a pit) so 4-side collision + fall-out death are exact.
//   • GENERATION tests run the real seeded genMaze: contained bounds, solvability across
//     seeds (the correct-by-construction net), climb-shafts/dead-ends, 2D camera.
// Physics is stepped deterministically via BS.freeze + BS.step.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

// A tiny hand-made maze installed as the live terrain, for pure collision/death tests.
// Floor at row 8; a pit at cols 4-5 (no floor, no bottom border) drops the hero out.
function installSyntheticMaze() {
  const T = 16, cols = 12, rows = 12;
  const grid = new Uint8Array(cols * rows);
  const S = (tx, ty) => { grid[ty * cols + tx] = 1; };
  for (let tx = 0; tx < cols; tx++) { S(tx, 0); if (tx < 4 || tx > 5) S(tx, rows - 1); }   // top border; bottom border except the pit
  for (let ty = 0; ty < rows; ty++) { S(0, ty); S(cols - 1, ty); }                         // side borders
  for (let tx = 1; tx < cols - 1; tx++) if (tx < 4 || tx > 5) S(tx, 8);                     // floor with a pit at cols 4-5
  const mz = {
    maze: true, level: 6, seed: 1, cols, rows, tileW: T, width: cols * T, height: rows * T, grid,
    climbables: [], hazards: [], chests: [], floats: [], enemies: [], doors: [], keysNeeded: 0, minibosses: [],
    spawn: { x: 1.5 * T, y: 8 * T }, exit: { x: 10 * T, y: 8 * T }, deathY: rows * T,
  };
  const st = window.BS.state();
  st.terrain = mz; st.levelData = mz; st.phase = 'traverse'; st.scene = 'PLAY'; st.paused = false;
  window.BS.freeze(true); window.BS.Input.reset();
  return mz;
}

// Drop into the real seeded L6 maze in a frozen state.
async function enterMaze(page, seed = 42) {
  await openGame(page, { seed });
  await enterPlayPanel(page, 0);
  await page.evaluate(() => { window.BS.freeze(true); window.BS.startGame(window.BS.MAZE_LEVEL); window.BS.gotoPlay(); window.BS.Input.reset(); });
}

test.describe('L6 maze — collision engine (synthetic grid)', () => {
  test('a solid tile blocks the hero on all four sides; open space does not (neg. control)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const out = await page.evaluate((installSrc) => {
      const installSyntheticMaze = new Function('return (' + installSrc + ')')();
      const mz = installSyntheticMaze();
      const h = window.BS.hero(), T = mz.tileW, col = window.BS.collideHeroMaze, o = {};
      const set = (x, y, vx, vy) => Object.assign(h, { x, y, vx, vy, onGround: false });
      const run = (n) => { for (let i = 0; i < n; i++) col(h, 1 / 120); };
      const floorY = 8 * T;
      // RIGHT into the right border (col 11) from an open tile
      set(9 * T, floorY, 300, 0); run(120);
      o.rightBlocked = Math.abs((h.x + h.w / 2) - 11 * T) < 1.5 && h.x < 11 * T;
      // NEGATIVE CONTROL: leftward from mid-floor travels freely (open space)
      set(9 * T, floorY, -300, 0); const x0 = h.x; run(30);
      o.free = (x0 - h.x) > 30;
      // LEFT into the left border (col 0)
      set(2 * T, floorY, -300, 0); run(120);
      o.leftBlocked = Math.abs((h.x - h.w / 2) - 1 * T) < 1.5;
      // FLOOR: descend onto the floor (row 8), land + onGround
      set(3 * T, floorY - 40, 0, 400); run(60);
      o.floorLanded = h.onGround && Math.abs(h.y - floorY) < 1;
      // CEILING: rise into the top border (row 0), head stops one row down
      set(3 * T, 3 * T, 0, -400); run(60);
      o.ceilingBonk = Math.abs((h.y - h.h) - 1 * T) < 1.5 && h.vy === 0;
      return o;
    }, installSyntheticMaze.toString());
    expect(out.rightBlocked).toBe(true);
    expect(out.free).toBe(true);          // negative control: no tile → free travel
    expect(out.leftBlocked).toBe(true);
    expect(out.floorLanded).toBe(true);
    expect(out.ceilingBonk).toBe(true);
  });

  test('falling through a pit costs a heart + respawns at the entrance (neg. control: floor is safe)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((installSrc) => {
      const installSyntheticMaze = new Function('return (' + installSrc + ')')();
      const mz = installSyntheticMaze();
      const h = window.BS.hero(), T = mz.tileW, o = {};
      const hp0 = window.BS.state().hp;
      // NEGATIVE CONTROL: stand on the solid floor → no heart lost
      Object.assign(h, { x: 2 * T, y: 8 * T - 30, vx: 0, vy: 0, dead: false });
      for (let i = 0; i < 240; i++) window.BS.step(1 / 120);
      o.floorHp = window.BS.state().hp;
      // over the pit (cols 4-5) → fall out past deathY → lose a heart + respawn at spawn
      Object.assign(h, { x: 4.5 * T, y: 8 * T - 40, vx: 0, vy: 0, dead: false });
      for (let i = 0; i < 360; i++) window.BS.step(1 / 120);
      o.afterHp = window.BS.state().hp;
      o.respawned = Math.abs(h.x - mz.spawn.x) < 4 && Math.abs(h.y - mz.spawn.y) < 4;
      o.hp0 = hp0;
      return o;
    }, installSyntheticMaze.toString());
    expect(r.floorHp).toBe(r.hp0);        // negative control: the floor costs nothing
    expect(r.afterHp).toBeLessThan(r.hp0);
    expect(r.respawned).toBe(true);
  });
});

test.describe('L6 maze — seeded generation', () => {
  test('genMaze is contained and larger than the screen in both dimensions', async ({ page }) => {
    await openGame(page);
    const m = await page.evaluate(() => {
      const mz = window.BS.genMaze(6, 12345);
      const borderSolid = window.BS.tileSolid(mz, 0, 5) && window.BS.tileSolid(mz, mz.cols - 1, 5)
        && window.BS.tileSolid(mz, 5, 0) && window.BS.tileSolid(mz, 5, mz.rows - 1);
      return { maze: mz.maze, w: mz.width, h: mz.height, borderSolid,
               oobTop: window.BS.tileSolid(mz, 5, -1), oobBelow: window.BS.tileSolid(mz, 5, mz.rows + 2),
               spawnOnFloor: window.BS.tileSolid(mz, Math.floor(mz.spawn.x / mz.tileW), Math.round(mz.spawn.y / mz.tileW)),
               exitOnFloor: window.BS.tileSolid(mz, Math.floor(mz.exit.x / mz.tileW), Math.round(mz.exit.y / mz.tileW)) };
    });
    expect(m.maze).toBe(true);
    expect(m.w).toBeGreaterThan(480);
    expect(m.h).toBeGreaterThan(270);
    expect(m.borderSolid).toBe(true);
    expect(m.oobTop).toBe(true);
    expect(m.oobBelow).toBe(false);
    expect(m.spawnOnFloor).toBe(true);   // the tile under the spawn is solid floor
    expect(m.exitOnFloor).toBe(true);
  });

  test('every seed produces a solvable maze; a walled grid is not (neg. control)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      const seeds = [];
      for (let s = 1; s <= 40; s++) seeds.push(window.BS.mazeSolvable(window.BS.genMaze(6, s * 2654435761 >>> 0)));
      const allSolvable = seeds.every(Boolean);
      // NEGATIVE CONTROL: fill the grid solid → the exit is unreachable
      const walled = window.BS.genMaze(6, 7);
      walled.grid.fill(1);
      return { allSolvable, count: seeds.length, walledUnsolvable: !window.BS.mazeSolvable(walled) };
    });
    expect(r.count).toBe(40);
    expect(r.allSolvable).toBe(true);       // correct-by-construction, proven per seed
    expect(r.walledUnsolvable).toBe(true);  // the solver actually fails when it should
  });

  test('the maze has climb-shafts (vertical links) and dead-end rooms', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      const mz = window.BS.genMaze(6, 999);
      const links = mz.cells.links;
      const deadEnds = links.filter((m) => m && (m & (m - 1)) === 0).length;   // exactly one open side
      return { climbables: mz.climbables.length, deadEnds, cells: links.length };
    });
    expect(r.climbables).toBeGreaterThan(0);   // vertical navigation exists
    expect(r.deadEnds).toBeGreaterThan(0);     // a perfect maze always has dead-ends to explore
  });

  test('every climb-shaft has SOLID FLOOR at its top perch (you can climb up and stand off it)', async ({ page }) => {
    await openGame(page);
    const bad = await page.evaluate(() => {
      const T = 16, misses = [];
      for (let s = 1; s <= 30; s++) {
        const mz = window.BS.genMaze(6, s * 40503 >>> 0);
        for (const c of mz.climbables) {
          const cx = Math.floor(c.x / T), topFloorRow = Math.round(c.top / T);
          if (!window.BS.tileSolid(mz, cx, topFloorRow)) misses.push({ s, cx, topFloorRow });   // hole at the top = you fall back down
        }
      }
      return misses;
    });
    expect(bad).toEqual([]);   // regression: the shaft used to carve away the top floor tile
  });

  test('climbing to the top of a shaft lands you on the floor (you do not fall back down)', async ({ page }) => {
    await enterMaze(page, 777);
    const r = await page.evaluate(() => {
      const mz = window.BS.terrain(), h = window.BS.hero(), c = mz.climbables[0];
      // start at the shaft bottom, hold UP to climb to the top perch
      Object.assign(h, { x: c.x, y: c.bot, vx: 0, vy: 0, climbing: false, onGround: true });
      window.BS.Input.reset(); window.BS.Input.press('jump', true);
      for (let i = 0; i < 240; i++) window.BS.step(1 / 120);
      const reachedTop = Math.abs(h.y - c.top) < 2;
      // release everything and let physics settle — the hero must STAY on the floor
      window.BS.Input.reset();
      for (let i = 0; i < 180; i++) window.BS.step(1 / 120);
      return { reachedTop, stayedUp: Math.abs(h.y - c.top) < 2 && h.onGround, y: h.y, top: c.top };
    });
    expect(r.reachedTop).toBe(true);
    expect(r.stayedUp).toBe(true);   // the bug: hero fell straight back down the shaft
  });

  test('two stacked shafts in one column: you can descend past the junction (and ascend back)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      const T = 16, cols = 6, rows = 18;
      const grid = new Uint8Array(cols * rows);
      const S = (tx, ty) => { grid[ty * cols + tx] = 1; };
      for (let ty = 0; ty < rows; ty++) { S(0, ty); S(cols - 1, ty); }
      for (let tx = 0; tx < cols; tx++) { S(tx, 0); S(tx, rows - 1); }
      for (const fr of [4, 9, 14]) for (let tx = 1; tx < cols - 1; tx++) S(tx, fr);   // three floors
      // two shafts stacked in column 3: upper (rows 4→9) + lower (rows 9→14), meeting at the mid floor
      const mz = {
        maze: true, level: 6, seed: 1, cols, rows, tileW: T, width: cols * T, height: rows * T, grid,
        climbables: [{ x: 3.5 * T, top: 4 * T, bot: 9 * T, kind: 'pole' }, { x: 3.5 * T, top: 9 * T, bot: 14 * T, kind: 'ladder' }],
        hazards: [], chests: [], floats: [], enemies: [], doors: [], keysNeeded: 0, minibosses: [],
        // exit kept far from the shaft column (col 3, x=56) so climbing to the top can't trip it
        spawn: { x: 1.5 * T, y: 9 * T }, exit: { x: 1.5 * T, y: 4 * T }, deathY: rows * T,
      };
      const st = window.BS.state(); st.terrain = mz; st.levelData = mz; st.phase = 'traverse'; st.scene = 'PLAY'; st.paused = false;
      window.BS.freeze(true); window.BS.Input.reset();
      const h = window.BS.hero();
      // stand at the mid-floor junction, hold DOWN → must descend PAST it toward the bottom floor
      Object.assign(h, { x: 3.5 * T, y: 9 * T, vx: 0, vy: 0, climbing: false, onGround: true });
      window.BS.Input.press('down', true);
      for (let i = 0; i < 240; i++) window.BS.step(1 / 120);
      window.BS.Input.reset();
      const wentDown = h.y > 9 * T + 40;
      // from the bottom floor, hold UP → must ascend PAST the junction toward the top
      Object.assign(h, { x: 3.5 * T, y: 14 * T, vx: 0, vy: 0, climbing: false, onGround: true });
      window.BS.Input.press('jump', true);
      for (let i = 0; i < 360; i++) window.BS.step(1 / 120);
      window.BS.Input.reset();
      const wentUp = h.y < 9 * T - 40;
      return { wentDown, wentUp, y: h.y };
    });
    expect(r.wentDown).toBe(true);   // the bug: grabbing the upper shaft clamped you at the junction
    expect(r.wentUp).toBe(true);
  });

  test('the 2D camera follows the hero in X and Y and clamps to the maze bounds', async ({ page }) => {
    await enterMaze(page);
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), C = window.BS.CONFIG, st = window.BS.state(), o = {};
      const snapStep = () => { st.camSnap = true; window.BS.step(1 / 120); };   // snap so we check the clamp target, not the ease
      Object.assign(h, { x: 40, y: 40, vx: 0, vy: 0 }); snapStep();
      o.tl = { x: Math.round(window.BS.cam().x), y: Math.round(window.BS.cam().y) };
      Object.assign(h, { x: mz.width - 20, y: mz.height - 20, vx: 0, vy: 0 }); snapStep();
      const cam = window.BS.cam();
      o.brX = cam.x >= mz.width - C.W - 2 && cam.x <= mz.width - C.W + 0.5;
      o.brY = cam.y >= mz.height - C.H - 2 && cam.y <= mz.height - C.H + 0.5;
      Object.assign(h, { x: mz.width / 2, y: mz.height / 2, vx: 0, vy: 0 }); snapStep();
      o.midY = window.BS.cam().y;
      return o;
    });
    expect(r.tl).toEqual({ x: 0, y: 0 });
    expect(r.brX).toBe(true);
    expect(r.brY).toBe(true);
    expect(r.midY).toBeGreaterThan(0);   // Y genuinely pans (unlike the L1-5 heightfield)
  });

  test('reaching the exit fires the exit marker once (neg. control: elsewhere it does not)', async ({ page }) => {
    await enterMaze(page);
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), o = {};
      Object.assign(h, { x: mz.spawn.x, y: mz.spawn.y, vx: 0, vy: 0 });
      for (let i = 0; i < 30; i++) window.BS.step(1 / 120);
      o.atEntrance = window.BS.mazeExitReached();
      Object.assign(h, { x: mz.exit.x, y: mz.exit.y, vx: 0, vy: 0 });
      window.BS.step(1 / 120);
      o.atExit = window.BS.mazeExitReached();
      return o;
    });
    expect(r.atEntrance).toBe(false);
    expect(r.atExit).toBe(true);
  });

  test('L1-5 still use the heightfield engine — cam.y stays 0 (neg. control vs the maze)', async ({ page }) => {
    await openGame(page, { seed: 7 }); await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      window.BS.freeze(true); window.BS.startGame(1); window.BS.gotoPlay();
      const h = window.BS.hero(); Object.assign(h, { x: 300, y: 100 });
      for (let i = 0; i < 30; i++) window.BS.step(1 / 120);
      return { camY: window.BS.cam().y, maze: !!window.BS.terrain().maze };
    });
    expect(r.maze).toBe(false);
    expect(r.camY).toBe(0);
  });
});

// One room on a single floor with a locked key + its guarding orange pair, installed live.
function installMinibossMaze() {
  const T = 16, cols = 20, rows = 10, fr = 7;
  const grid = new Uint8Array(cols * rows);
  const S = (tx, ty) => { grid[ty * cols + tx] = 1; };
  for (let ty = 0; ty < rows; ty++) { S(0, ty); S(cols - 1, ty); }
  for (let tx = 0; tx < cols; tx++) { S(tx, 0); S(tx, rows - 1); }
  for (let tx = 1; tx < cols - 1; tx++) S(tx, fr);
  const key = { id: 0, tx: 3, ty: fr - 1, x: 3 * T + T / 2, y: fr * T, taken: false, locked: true };
  const room = { x0: 0, x1: cols * T, y0: 0, y1: rows * T };   // whole play area is "the room" here
  const mb = { pairId: 0, keyId: 0, freed: false, room, a: { x: 10 * T, y: fr * T }, b: { x: 12 * T, y: fr * T } };
  const mz = {
    maze: true, level: 6, seed: 1, cols, rows, tileW: T, width: cols * T, height: rows * T, grid,
    climbables: [], hazards: [], chests: [], floats: [], enemies: [], doors: [], keys: [key], keysNeeded: 0, minibosses: [mb],
    spawn: { x: 2 * T, y: fr * T }, exit: { x: 18 * T, y: fr * T }, deathY: rows * T,
  };
  const st = window.BS.state();
  st.terrain = mz; st.levelData = mz; st.phase = 'traverse'; st.scene = 'PLAY'; st.paused = false; st.keys = 0; st.mode = 'normal';
  st.enemies.length = 0;
  st.enemies.push(window.BS.makeOrange(mb.a.x, mb.a.y, 0, 0, mb.room));
  st.enemies.push(window.BS.makeOrange(mb.b.x, mb.b.y, 0, 0, mb.room));
  window.BS.freeze(true); window.BS.Input.reset();
  return { T, fr };
}

test.describe('L6 maze — B&W high-contrast theme', () => {
  test('L6 renders its monochrome world for many frames without errors (neg. control: L1 too)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openGame(page, { seed: 3 }); await enterPlayPanel(page, 0);
    await page.evaluate(() => { window.BS.startGame(window.BS.MAZE_LEVEL); window.BS.gotoPlay(); });
    await page.waitForTimeout(300);   // let the real rAF loop exercise the grayscale-filter draw path
    const mazeActive = await page.evaluate(() => !!window.BS.terrain().maze);
    // NEGATIVE CONTROL: the coloured heightfield L1 still renders clean
    await page.evaluate(() => { window.BS.gotoTitle(); window.BS.startGame(1); window.BS.gotoPlay(); });
    await page.waitForTimeout(150);
    const l1 = await page.evaluate(() => window.BS.state().level === 1 && !window.BS.terrain().maze);
    expect(errors).toEqual([]);
    expect(mazeActive).toBe(true);
    expect(l1).toBe(true);
  });

  test('the colourless lens is render-only — enemy behaviour (6-hit orange) is unchanged', async ({ page }) => {
    await openGame(page);
    const hits = await page.evaluate(() => window.BS.ENEMY_HITS.orange);
    expect(hits).toBe(6);   // greyscale is purely visual; type behaviour is intact
  });
});

test.describe('L6 maze — orange mini-boss pairs', () => {
  test('genMaze guards each diamond key with a locked pair of orange mini-bosses', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      let ok = true, any = false;
      for (let s = 1; s <= 20; s++) {
        const mz = window.BS.genMaze(6, s * 7919 >>> 0);
        if (mz.minibosses.length !== mz.keys.length) ok = false;
        if (!mz.keys.every((k) => k.locked)) ok = false;       // every key starts locked
        if (mz.minibosses.length > 0) any = true;
      }
      return { ok, any };
    });
    expect(r.ok).toBe(true);
    expect(r.any).toBe(true);
  });

  test('a mini-boss pair spawns at opposite room edges (not clustered on the rope)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      const T = 16; let ok = true, checked = 0;
      for (let s = 1; s <= 30; s++) {
        const mz = window.BS.genMaze(6, s * 7919 >>> 0), cw = mz.cells.cw;
        for (const mb of mz.minibosses) {
          checked++;
          const center = (mb.room.x0 + mb.room.x1) / 2;
          const spread = Math.abs(mb.a.x - mb.b.x);
          const straddles = (mb.a.x < center) !== (mb.b.x < center);   // one each side of centre (the shaft)
          if (spread < (cw - 3.5) * T || !straddles) ok = false;
        }
      }
      return { ok, checked };
    });
    expect(r.checked).toBeGreaterThan(0);
    expect(r.ok).toBe(true);   // spread to the edges, straddling the shaft column
  });

  test('an orange takes exactly 6 hits, is orange, and homes toward the hero', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); const { T, fr } = install();
      const e = window.BS.enemies()[0];
      const orange = e.type === 'orange' && window.BS.ENEMY_HITS.orange === 6;
      // homing: hero far to the LEFT → the orange should move left over time
      Object.assign(window.BS.hero(), { x: 2 * T, y: fr * T, vx: 0, vy: 0, onGround: true });
      const x0 = e.x;
      for (let i = 0; i < 120; i++) window.BS.updateMazeEnemies(1 / 120);
      const homedLeft = e.x < x0 - 8;
      // 6 hits: alive after 5, dead on the 6th
      const e2 = window.BS.enemies()[1];
      for (let i = 0; i < 5; i++) { e2.hitT = 0; window.BS.hitEnemy(e2); }
      const aliveAfter5 = e2.alive;
      e2.hitT = 0; window.BS.hitEnemy(e2);
      return { orange, homedLeft, aliveAfter5, deadAfter6: !e2.alive };
    }, installMinibossMaze.toString());
    expect(r.orange).toBe(true);
    expect(r.homedLeft).toBe(true);
    expect(r.aliveAfter5).toBe(true);
    expect(r.deadAfter6).toBe(true);
  });

  test('defeating BOTH of a pair AWARDS its key instantly; killing one keeps it locked (neg. control)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')();
      // NEGATIVE CONTROL: kill only ONE → key stays locked, no key awarded (hero never even moves)
      install();
      let es = window.BS.enemies();
      for (let i = 0; i < 6; i++) { es[0].hitT = 0; window.BS.hitEnemy(es[0]); }
      window.BS.updateMazeEnemies(1 / 120);
      const mzA = window.BS.terrain();
      const stillLocked = mzA.keys[0].locked === true && mzA.minibosses[0].freed === false && window.BS.mazeKeys() === 0;

      // kill BOTH → the key is awarded on the spot, WITHOUT walking to it
      install();
      const heroX0 = window.BS.hero().x;
      es = window.BS.enemies();
      for (const e of es) for (let i = 0; i < 6; i++) { e.hitT = 0; window.BS.hitEnemy(e); }
      window.BS.updateMazeEnemies(1 / 120);
      const mz = window.BS.terrain(), key = mz.keys[0];
      return { stillLocked, awarded: key.taken === true && window.BS.mazeKeys() === 1, heroDidntMove: window.BS.hero().x === heroX0 };
    }, installMinibossMaze.toString());
    expect(r.stillLocked).toBe(true);   // negative control: one guard alive → locked, no key
    expect(r.awarded).toBe(true);       // both dead → key in hand immediately
    expect(r.heroDidntMove).toBe(true); // …no walk-over-the-drop needed
  });

  test('guards stay dormant until the hero enters their room (neg. control: outside = no chase)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); const { T, fr } = install();
      const es = window.BS.enemies(), h = window.BS.hero();
      const room = { x0: 8 * T, x1: 14 * T, y0: 0, y1: 10 * T };   // a narrow room, not the whole grid
      es.forEach((e) => { e.room = room; e.awake = false; e.x = 11 * T; });
      // NEGATIVE CONTROL: hero OUTSIDE the room → dormant, doesn't budge toward the hero
      Object.assign(h, { x: 2 * T, y: fr * T, vx: 0, vy: 0, onGround: true });
      const x0 = es[0].x;
      for (let i = 0; i < 120; i++) window.BS.updateMazeEnemies(1 / 120);
      const dormant = !es[0].awake && Math.abs(es[0].x - x0) < 1;
      // hero ENTERS the room → it wakes
      Object.assign(h, { x: 11 * T, y: fr * T, vx: 0, vy: 0, onGround: true });
      for (let i = 0; i < 60; i++) window.BS.updateMazeEnemies(1 / 120);
      return { dormant, woke: es[0].awake };
    }, installMinibossMaze.toString());
    expect(r.dormant).toBe(true);   // negative control: outside the room it never chases
    expect(r.woke).toBe(true);
  });

  test('a defeated pair is removed from the enemy list (no lingering sprites)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); install();
      const before = window.BS.enemies().length;
      for (const e of window.BS.enemies().slice()) for (let i = 0; i < 6; i++) { e.hitT = 0; window.BS.hitEnemy(e); }
      window.BS.updateMazeEnemies(1 / 120);   // the cull pass
      return { before, after: window.BS.enemies().length };
    }, installMinibossMaze.toString());
    expect(r.before).toBe(2);
    expect(r.after).toBe(0);   // both dead → gone (used to linger forever)
  });

  test('a full pair telegraphs then hurls a partner projectile that damages the hero', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); const { T, fr } = install();
      const h = window.BS.hero(), es = window.BS.enemies(), st = window.BS.state();
      Object.assign(h, { x: 11 * T, y: fr * T, vx: 0, vy: 0, onGround: true, hurt: 0, ghost: 0, dodgeT: 0 });
      es.forEach((e) => { e.throwCd = 0; e.onGround = true; });
      const hp0 = st.hp;
      let sawTele = false, sawThrown = false;
      for (let i = 0; i < 360; i++) { window.BS.updateMazeEnemies(1 / 120); if (es.some((e) => e.tele > 0)) sawTele = true; if (es.some((e) => e.thrown)) sawThrown = true; }
      return { sawTele, sawThrown, tookDamage: st.hp < hp0 };
    }, installMinibossMaze.toString());
    expect(r.sawTele).toBe(true);       // wind-up telegraph fired
    expect(r.sawThrown).toBe(true);     // a partner was launched
    expect(r.tookDamage).toBe(true);    // and it (or contact) chipped the hero
  });

  test('a thrown partner is confined to the pair room — even aimed through an open doorway', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      const BS = window.BS, T = 16, cols = 24, rows = 10, fr = 7;
      const grid = new Uint8Array(cols * rows); const S = (tx, ty) => { grid[ty * cols + tx] = 1; };
      for (let ty = 0; ty < rows; ty++) { S(0, ty); S(cols - 1, ty); }
      for (let tx = 0; tx < cols; tx++) { S(tx, 0); S(tx, rows - 1); }
      for (let tx = 1; tx < cols - 1; tx++) S(tx, fr);                    // floor across BOTH rooms
      for (let ty = 1; ty < fr; ty++) S(11, ty);                          // dividing wall (col 11)…
      for (let ty = fr - 3; ty < fr; ty++) grid[ty * cols + 11] = 0;      // …with an open doorway at floor level
      const room = { x0: 0, x1: 11 * T, y0: 0, y1: rows * T };            // LEFT room only
      const mz = {
        maze: true, level: 6, cols, rows, tileW: T, width: cols * T, height: rows * T, grid,
        climbables: [], hazards: [], chests: [], floats: [], enemies: [], doors: [], keys: [], keysNeeded: 0,
        minibosses: [{ pairId: 0, keyId: 0, freed: false, room, a: { x: 5 * T, y: fr * T }, b: { x: 7 * T, y: fr * T } }],
        spawn: { x: 2 * T, y: fr * T }, exit: { x: 22 * T, y: fr * T }, deathY: rows * T,
      };
      const st = BS.state(); st.terrain = mz; st.levelData = mz; st.phase = 'traverse'; st.scene = 'PLAY'; st.paused = false;
      st.enemies.length = 0;
      const a = BS.makeOrange(5 * T, fr * T, 0, 0, room), b = BS.makeOrange(7 * T, fr * T, 0, 0, room);
      st.enemies.push(a, b);
      BS.freeze(true); BS.Input.reset();
      // hero ghostly at the doorway so the throw aims RIGHT through it and can't hit him
      Object.assign(BS.hero(), { x: 10 * T, y: fr * T, vx: 0, vy: 0, onGround: true, ghost: 9, dodgeT: 0 });
      a.awake = b.awake = true; a.onGround = b.onGround = true;
      b.role = 'proj'; b.tele = 0.001;                                    // fling partner b at the hero (through the doorway)
      let everThrown = false, leftRoom = false;
      for (let i = 0; i < 240; i++) { BS.updateMazeEnemies(1 / 120); if (b.thrown) { everThrown = true; if (b.x > room.x1 || b.x < room.x0) leftRoom = true; } }
      return { everThrown, leftRoom, endedInRoom: b.x <= room.x1 && b.x >= room.x0 && b.alive };
    });
    expect(r.everThrown).toBe(true);
    expect(r.leftRoom).toBe(false);      // never crossed into the next room (the bug)
    expect(r.endedInRoom).toBe(true);    // still in the room → the pair is finishable
  });

  test('a thrown projectile is what deals the hit (neg. control: a grounded one at range does not)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); const { T, fr } = install();
      const h = window.BS.hero(), st = window.BS.state();
      st.enemies.length = 1;                          // isolate a single orange (no contact from a partner)
      const e = window.BS.enemies()[0];
      Object.assign(e, { x: 10 * T, y: fr * T, onGround: true });
      Object.assign(h, { x: 10 * T + 44, y: fr * T, vx: 0, vy: 0, hurt: 0, ghost: 0, dodgeT: 0 });
      // NEGATIVE CONTROL: grounded orange 44px away → no hit this frame
      const hpA = st.hp; window.BS.updateMazeEnemies(1 / 120);
      const noHitGrounded = st.hp === hpA;
      // now hurl it at the hero → it flies in and lands a hit
      e.role = 'proj'; e.tele = 0.001;
      let hit = false; const hp0 = st.hp;
      for (let i = 0; i < 120 && !hit; i++) { window.BS.updateMazeEnemies(1 / 120); if (st.hp < hp0) hit = true; }
      return { noHitGrounded, wasThrownAndHit: hit };
    }, installMinibossMaze.toString());
    expect(r.noHitGrounded).toBe(true);      // negative control
    expect(r.wasThrownAndHit).toBe(true);
  });
});

test.describe('L6 maze — doors + diamond keys', () => {
  test('genMaze places locked doors, one diamond key each, all closed in the grid', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      let allMatch = true, anyDoors = false;
      for (let s = 1; s <= 20; s++) {
        const mz = window.BS.genMaze(6, s * 7919 >>> 0);
        if (mz.doors.length !== mz.keys.length || mz.keysNeeded !== mz.doors.length) allMatch = false;
        if (mz.doors.length > 0) anyDoors = true;
        for (const d of mz.doors) for (const [tx, ty] of d.tiles) if (mz.grid[ty * mz.cols + tx] !== 1) allMatch = false;   // closed = WALL
      }
      return { allMatch, anyDoors };
    });
    expect(r.allMatch).toBe(true);
    expect(r.anyDoors).toBe(true);
  });

  test('every seed is solvable WITH doors; stripping the keys makes it unsolvable (neg. control)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      let solvable = true, keylessBlocks = true, checkedKeyless = 0;
      for (let s = 1; s <= 30; s++) {
        const seed = s * 2654435761 >>> 0;
        if (!window.BS.mazeSolvable(window.BS.genMaze(6, seed))) solvable = false;
        const noKeys = window.BS.genMaze(6, seed);
        if (noKeys.doors.length > 0) { checkedKeyless++; noKeys.keys = []; if (window.BS.mazeSolvable(noKeys)) keylessBlocks = false; }
      }
      return { solvable, keylessBlocks, checkedKeyless };
    });
    expect(r.solvable).toBe(true);
    expect(r.checkedKeyless).toBeGreaterThan(0);
    expect(r.keylessBlocks).toBe(true);   // the doors genuinely gate the only path
  });

  test('a closed door blocks the hero; a key opens it and lets you through (neg. control)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      const T = 16, cols = 16, rows = 8, fr = 6;
      const grid = new Uint8Array(cols * rows);
      const S = (tx, ty) => { grid[ty * cols + tx] = 1; };
      for (let ty = 0; ty < rows; ty++) { S(0, ty); S(cols - 1, ty); }
      for (let tx = 0; tx < cols; tx++) { S(tx, 0); S(tx, rows - 1); }
      for (let tx = 1; tx < cols - 1; tx++) S(tx, fr);           // one floor
      const doorTiles = []; for (let ty = fr - 3; ty < fr; ty++) { S(8, ty); doorTiles.push([8, ty]); }   // a closed door at col 8
      const mz = {
        maze: true, level: 6, seed: 1, cols, rows, tileW: T, width: cols * T, height: rows * T, grid,
        climbables: [], hazards: [], chests: [], floats: [], enemies: [],
        doors: [{ id: 0, tiles: doorTiles, x: 8 * T, y: (fr - 3) * T, w: 1 * T, h: 3 * T, open: false }],
        keys: [{ id: 0, tx: 3, ty: fr - 1, x: 3 * T + T / 2, y: fr * T, taken: false }], keysNeeded: 1, minibosses: [],
        spawn: { x: 2 * T, y: fr * T }, exit: { x: 13 * T, y: fr * T }, deathY: rows * T,
      };
      const st = window.BS.state(); st.terrain = mz; st.levelData = mz; st.phase = 'traverse'; st.scene = 'PLAY'; st.paused = false; st.keys = 0;
      window.BS.freeze(true); window.BS.Input.reset();
      const h = window.BS.hero();
      // NEGATIVE CONTROL: no key → walking right is blocked before the door
      Object.assign(h, { x: 6 * T, y: fr * T, vx: 0, vy: 0, onGround: true, climbing: false });
      window.BS.Input.press('right', true);
      for (let i = 0; i < 180; i++) window.BS.step(1 / 120);
      window.BS.Input.reset();
      const blockedNoKey = h.x < 8 * T && st.keys === 0;
      // collect the key
      Object.assign(h, { x: 3 * T + T / 2, y: fr * T, vx: 0, vy: 0 });
      for (let i = 0; i < 5; i++) window.BS.step(1 / 120);
      const gotKey = st.keys >= 1;
      // walk into the door → it unlocks and the hero passes to the right room
      Object.assign(h, { x: 6 * T, y: fr * T, vx: 0, vy: 0 });
      window.BS.Input.press('right', true);
      for (let i = 0; i < 300; i++) window.BS.step(1 / 120);
      window.BS.Input.reset();
      return { blockedNoKey, gotKey, doorOpen: mz.doors[0].open, passed: h.x > 9 * T, keysLeft: st.keys };
    });
    expect(r.blockedNoKey).toBe(true);   // negative control
    expect(r.gotKey).toBe(true);
    expect(r.doorOpen).toBe(true);
    expect(r.passed).toBe(true);         // walked through after unlocking
    expect(r.keysLeft).toBe(0);          // the key was spent
  });
});

// A single tall rope shaft between a bottom floor (row 16) and a top floor (row 4).
function installClimbMaze() {
  const T = 16, cols = 8, rows = 20;
  const grid = new Uint8Array(cols * rows);
  const S = (tx, ty) => { grid[ty * cols + tx] = 1; };
  for (let ty = 0; ty < rows; ty++) { S(0, ty); S(cols - 1, ty); }
  for (let tx = 0; tx < cols; tx++) { S(tx, 0); S(tx, rows - 1); }
  for (let tx = 1; tx < cols - 1; tx++) { S(tx, 4); S(tx, 16); }        // top + bottom floors
  const climb = { x: 4 * T + T / 2, top: 4 * T, bot: 16 * T, kind: 'rope' };
  const mz = {
    maze: true, level: 6, seed: 1, cols, rows, tileW: T, width: cols * T, height: rows * T, grid,
    climbables: [climb], hazards: [], chests: [], floats: [], enemies: [], doors: [], keys: [], keysNeeded: 0, minibosses: [],
    spawn: { x: 2 * T, y: 16 * T }, exit: { x: 6 * T, y: 4 * T }, deathY: rows * T,
  };
  const st = window.BS.state();
  st.terrain = mz; st.levelData = mz; st.phase = 'traverse'; st.scene = 'PLAY'; st.paused = false; st.camSnap = true;
  window.BS.freeze(true); window.BS.Input.reset();
  return { T, climb };
}

test.describe('L6 maze — climbing + camera', () => {
  test('the camera scrolls smoothly while climbing (no skip on reaching the top)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); const { climb } = install();
      const h = window.BS.hero();
      Object.assign(h, { x: climb.x, y: climb.bot, vx: 0, vy: 0, climbing: false, onGround: true });
      window.BS.Input.press('jump', true);   // hold up to climb
      window.BS.step(1 / 120);                // warm-up: consumes camSnap
      let climbedFrames = 0, maxDelta = 0;
      const camY0 = window.BS.cam().y;
      for (let i = 0; i < 240; i++) {
        const before = window.BS.cam().y;
        window.BS.step(1 / 120);
        maxDelta = Math.max(maxDelta, Math.abs(window.BS.cam().y - before));
        if (h.climbing) climbedFrames++;
      }
      window.BS.Input.reset();
      return { climbedFrames, maxDelta, camPannedUp: camY0 - window.BS.cam().y };
    }, installClimbMaze.toString());
    expect(r.climbedFrames).toBeGreaterThan(20);   // it actually climbed
    expect(r.camPannedUp).toBeGreaterThan(30);     // the camera followed up the shaft
    expect(r.maxDelta).toBeLessThan(12);           // …with no single-frame jump (the "skip" bug)
  });

  test('at the top you can jump: holding UP does not re-grab, and a tap jumps off', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    const r = await page.evaluate((src) => {
      const install = new Function('return (' + src + ')')(); const { climb } = install();
      const h = window.BS.hero();
      Object.assign(h, { x: climb.x, y: climb.bot, vx: 0, vy: 0, climbing: false, onGround: true });
      window.BS.Input.press('jump', true);   // hold up to climb to the top
      let reachedTop = false;
      for (let i = 0; i < 400 && !reachedTop; i++) { window.BS.step(1 / 120); if (Math.abs(h.y - climb.top) < 2 && !h.climbing) reachedTop = true; }
      // STILL holding up at the top — must NOT re-grab (this was the "stuck" bug)
      let reGrabbed = false;
      for (let i = 0; i < 30; i++) { window.BS.step(1 / 120); if (h.climbing) reGrabbed = true; }
      const standingAtTop = Math.abs(h.y - climb.top) < 2 && !h.climbing && h.onGround;
      // now tap jump (release → press) → the hero jumps off the top
      window.BS.Input.reset(); window.BS.step(1 / 120);
      window.BS.Input.press('jump', true);
      let jumped = false;
      for (let i = 0; i < 24 && !jumped; i++) { window.BS.step(1 / 120); if (h.y < climb.top - 6 && !h.onGround) jumped = true; }
      window.BS.Input.reset();
      return { reachedTop, reGrabbed, standingAtTop, jumped };
    }, installClimbMaze.toString());
    expect(r.reachedTop).toBe(true);
    expect(r.reGrabbed).toBe(false);      // the fix: holding up at the top no longer re-grabs the rope
    expect(r.standingAtTop).toBe(true);
    expect(r.jumped).toBe(true);          // …and you can jump straight off it
  });
});
