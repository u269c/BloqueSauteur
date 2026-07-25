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

  test('the 2D camera follows the hero in X and Y and clamps to the maze bounds', async ({ page }) => {
    await enterMaze(page);
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), C = window.BS.CONFIG, o = {};
      Object.assign(h, { x: 40, y: 40, vx: 0, vy: 0 }); window.BS.step(1 / 120);
      o.tl = { x: window.BS.cam().x, y: window.BS.cam().y };
      Object.assign(h, { x: mz.width - 20, y: mz.height - 20, vx: 0, vy: 0 }); window.BS.step(1 / 120);
      const cam = window.BS.cam();
      o.brX = cam.x >= mz.width - C.W - 2 && cam.x <= mz.width - C.W + 0.5;
      o.brY = cam.y >= mz.height - C.H - 2 && cam.y <= mz.height - C.H + 0.5;
      Object.assign(h, { x: mz.width / 2, y: mz.height / 2, vx: 0, vy: 0 }); window.BS.step(1 / 120);
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
