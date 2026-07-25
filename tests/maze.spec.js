// @ts-check
// PR-A: Level 6 maze foundation — a second, tile-grid collision engine (solid on all four
// sides) + a 2D camera. Physics is stepped deterministically via BS.freeze + BS.stepFixed.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

// Drop straight into the L6 maze in a frozen state so we can position the hero and step.
async function enterMaze(page, seed = 42) {
  await openGame(page, { seed });
  await enterPlayPanel(page, 0);
  await page.evaluate(() => { window.BS.freeze(true); window.BS.startGame(window.BS.MAZE_LEVEL); window.BS.gotoPlay(); window.BS.Input.reset(); });
  return page.evaluate(() => ({
    maze: window.BS.terrain().maze === true,
    level: window.BS.state().level,
    cols: window.BS.terrain().cols, rows: window.BS.terrain().rows,
  }));
}

test.describe('L6 maze — foundation', () => {
  test('genMaze returns a contained tile grid larger than the screen in both dimensions', async ({ page }) => {
    await openGame(page);
    const m = await page.evaluate(() => {
      const mz = window.BS.genMaze(6, 1);
      return { maze: mz.maze, w: mz.width, h: mz.height, cols: mz.cols, rows: mz.rows,
               border: window.BS.tileSolid(mz, 0, 5) && window.BS.tileSolid(mz, mz.cols - 1, 5) && window.BS.tileSolid(mz, 5, 0),
               oobTop: window.BS.tileSolid(mz, 5, -1), oobBelow: window.BS.tileSolid(mz, 5, mz.rows + 2) };
    });
    expect(m.maze).toBe(true);
    expect(m.w).toBeGreaterThan(480);          // wider than the viewport
    expect(m.h).toBeGreaterThan(270);          // taller than the viewport → camera must pan in Y
    expect(m.border).toBe(true);               // solid border walls
    expect(m.oobTop).toBe(true);               // out-of-bounds top is solid (contained)
    expect(m.oobBelow).toBe(false);            // below the grid is open (a pit drops you out)
  });

  test('a solid tile blocks the hero on all four sides; open space does not (neg. control)', async ({ page }) => {
    await enterMaze(page);
    // Drive the collision resolver directly (no input/gravity) so each side is a clean assertion.
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), T = mz.tileW, out = {};
      const col = window.BS.collideHeroMaze;
      const set = (x, y, vx, vy) => Object.assign(h, { x, y, vx, vy, onGround: false });
      const run = (n) => { for (let i = 0; i < n; i++) col(h, 1 / 120); };
      const fy = mz.spawn.y;   // main-floor feet height (body sits in the row above the floor)

      // RIGHT into the interior wall at col 14 → right edge stops flush against it
      set(10 * T, fy, 300, 0); run(120);
      out.rightBlocked = h.x < 14 * T && Math.abs((h.x + h.w / 2) - 14 * T) < 1.5;

      // NEGATIVE CONTROL: the same rightward push in open space travels freely
      set(2 * T, fy, 300, 0); const x0 = h.x; run(30);
      out.free = (h.x - x0) > 30;

      // LEFT into the border wall (col 0) → left edge stops flush against col 1
      set(2 * T, fy, -300, 0); run(120);
      out.leftBlocked = Math.abs((h.x - h.w / 2) - 1 * T) < 1.5;

      // FLOOR: descending onto the floor lands + sets onGround
      set(8 * T, fy - 40, 0, 400); run(60);
      out.floorLanded = h.onGround && Math.abs(h.y - fy) < 1;

      // CEILING: rising into the top border stops the head one row down, vy zeroed
      set(8 * T, 4 * T, 0, -400); run(60);
      out.ceilingBonk = Math.abs((h.y - h.h) - 1 * T) < 1.5 && h.vy === 0;
      return out;
    });
    expect(r.rightBlocked).toBe(true);
    expect(r.free).toBe(true);        // negative control: no tile → free movement
    expect(r.leftBlocked).toBe(true);
    expect(r.floorLanded).toBe(true);
    expect(r.ceilingBonk).toBe(true);
  });

  test('the 2D camera follows the hero in X and Y and clamps to the maze bounds', async ({ page }) => {
    await enterMaze(page);
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), C = window.BS.CONFIG, out = {};
      // near the top-left the camera clamps to (0,0)
      Object.assign(h, { x: 40, y: 40, vx: 0, vy: 0 });
      window.BS.step(1 / 120);
      out.tl = { x: window.BS.cam().x, y: window.BS.cam().y };
      // deep in the bottom-right the camera clamps to the far corner (never past the bounds)
      Object.assign(h, { x: mz.width - 20, y: mz.height - 20, vx: 0, vy: 0 });
      window.BS.step(1 / 120);
      const cam = window.BS.cam();
      out.brClampedX = cam.x <= mz.width - C.W + 0.5 && cam.x >= mz.width - C.W - 2;
      out.brClampedY = cam.y <= mz.height - C.H + 0.5 && cam.y >= mz.height - C.H - 2;
      // a mid-room position pans the camera to a positive, non-clamped Y (proves Y actually moves)
      Object.assign(h, { x: mz.width / 2, y: mz.height / 2, vx: 0, vy: 0 });
      window.BS.step(1 / 120);
      out.midY = window.BS.cam().y;
      return out;
    });
    expect(r.tl).toEqual({ x: 0, y: 0 });        // clamps to origin
    expect(r.brClampedX).toBe(true);
    expect(r.brClampedY).toBe(true);
    expect(r.midY).toBeGreaterThan(0);           // Y camera genuinely pans (not stuck at 0 like L1-5)
  });

  test('falling into the bottom pit kills + respawns at the entrance (neg. control: solid floor does not)', async ({ page }) => {
    await enterMaze(page);
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), T = mz.tileW, out = {};
      const hp0 = window.BS.state().hp;
      // NEGATIVE CONTROL: stand on the solid floor for a second → no death
      Object.assign(h, { x: 8 * T, y: mz.spawn.y - 30, vx: 0, vy: 0 });
      for (let i = 0; i < 240; i++) window.BS.step(1 / 120);
      out.floorHp = window.BS.state().hp;
      out.floorAlive = !h.dead && h.onGround;
      // over the pit (cols 30..33) → fall out past deathY → lose a heart, respawn at spawn
      Object.assign(h, { x: 31 * T, y: mz.spawn.y - 40, vx: 0, vy: 0, dead: false });
      let died = false;
      for (let i = 0; i < 360; i++) { window.BS.step(1 / 120); if (window.BS.state().hp < out.floorHp) died = true; }
      out.pitTookHeart = died;
      out.respawnedAtEntrance = Math.abs(h.x - mz.spawn.x) < 4 && Math.abs(h.y - mz.spawn.y) < 4;
      out.hp0 = hp0;
      return out;
    });
    expect(r.floorHp).toBe(r.hp0);          // negative control: standing on the floor costs nothing
    expect(r.floorAlive).toBe(true);
    expect(r.pitTookHeart).toBe(true);      // the pit costs a heart
    expect(r.respawnedAtEntrance).toBe(true);
  });

  test('reaching the exit fires the exit marker once (neg. control: elsewhere it does not)', async ({ page }) => {
    await enterMaze(page);
    const r = await page.evaluate(() => {
      const h = window.BS.hero(), mz = window.BS.terrain(), out = {};
      // NEGATIVE CONTROL: standing at the entrance never trips the exit
      Object.assign(h, { x: mz.spawn.x, y: mz.spawn.y, vx: 0, vy: 0 });
      for (let i = 0; i < 30; i++) window.BS.step(1 / 120);
      out.entranceExit = window.BS.mazeExitReached();
      // teleport onto the exit tile → marker fires
      Object.assign(h, { x: mz.exit.x, y: mz.exit.y, vx: 0, vy: 0 });
      window.BS.step(1 / 120);
      out.atExit = window.BS.mazeExitReached();
      return out;
    });
    expect(r.entranceExit).toBe(false);   // negative control
    expect(r.atExit).toBe(true);
  });

  test('L1-5 still use the heightfield engine — cam.y stays 0 (neg. control vs the maze)', async ({ page }) => {
    await openGame(page, { seed: 7 });
    await enterPlayPanel(page, 0);
    const camY = await page.evaluate(() => {
      window.BS.freeze(true); window.BS.startGame(1); window.BS.gotoPlay();
      const h = window.BS.hero();
      Object.assign(h, { x: 300, y: 100 });
      for (let i = 0; i < 30; i++) window.BS.step(1 / 120);
      return { camY: window.BS.cam().y, maze: !!window.BS.terrain().maze };
    });
    expect(camY.maze).toBe(false);
    expect(camY.camY).toBe(0);   // vertical camera is a maze-only feature
  });
});
