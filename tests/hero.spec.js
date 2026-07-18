// @ts-check
// P3 hero acceptance tests: jump shape, collision, gap clearing, lava death,
// hurt/knockback + i-frames, ghostly respawn. Each with a negative control.
// Tests freeze the rAF loop and drive physics with BS.stepFixed for determinism.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.BS.freeze(true); });
});

// Run the sim on level 1 (flat) with a controlled input program.
async function sim(page, program, setup) {
  return page.evaluate(({ program, setup }) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.Input.reset();
    const h = window.BS.hero();
    if (setup) Object.assign(h, setup);
    let apexY = h.y, samples = [];
    for (const seg of program) {
      window.BS.Input.reset();
      if (seg.left) window.BS.Input.press('left', true);
      if (seg.right) window.BS.Input.press('right', true);
      if (seg.jump) window.BS.Input.press('jump', true);
      for (let i = 0; i < seg.for; i++) {
        window.BS.stepFixed(1);
        apexY = Math.min(apexY, h.y);
        samples.push({ x: h.x, y: h.y, vy: h.vy, onGround: h.onGround });
      }
    }
    const g = window.BS.hero(); window.BS.Input.reset();
    return { apexY, end: { x: g.x, y: g.y, vy: g.vy, onGround: g.onGround }, startY: samples.length ? samples[0].y : h.y };
  }, { program, setup });
}

test.describe('P3 · variable-height jump', () => {
  test('full-hold apex ≈ 3 tiles; a tap hops much lower (neg. control)', async ({ page }) => {
    const groundY = await page.evaluate(() => { window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); return window.BS.hero().y; });
    const full = await sim(page, [{ for: 120, jump: true }]);
    const fullHeight = groundY - full.apexY;
    const tap = await sim(page, [{ for: 1, jump: true }, { for: 120 }]);
    const tapHeight = groundY - tap.apexY;
    const TILE = await page.evaluate(() => window.BS.CONFIG.TILE);
    expect(fullHeight).toBeGreaterThan(2.4 * TILE);
    expect(fullHeight).toBeLessThan(3.8 * TILE);
    expect(tapHeight).toBeLessThan(fullHeight * 0.7);   // negative control: hold duration matters
    expect(tapHeight).toBeGreaterThan(0.4 * TILE);
  });

  test('cannot double-jump: a second press while airborne does not re-launch', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.Input.reset();
      const h = window.BS.hero();
      window.BS.Input.press('jump', true); window.BS.stepFixed(4);
      window.BS.Input.press('jump', false); window.BS.stepFixed(2);
      window.BS.Input.press('jump', true); window.BS.stepFixed(1);
      const vyAfter2 = h.vy; window.BS.Input.reset();
      return { vyAfter2, jumpV: window.BS.CONFIG.JUMP_V };
    });
    expect(r.vyAfter2).toBeGreaterThan(-r.jumpV * 0.9);   // did NOT re-launch at full jump velocity
  });
});

test.describe('P3 · horizontal collision', () => {
  test('can clear a MAX_JUMP_GAP hole with a running jump', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const C = window.BS.CONFIG, T = C.TILE, t = window.BS.terrain();
      const gapCols = Math.floor(C.MAX_JUMP_GAP / T), holeStart = 8;
      for (let i = 0; i < t.nCols; i++) t.cols[i] = C.PLAT_Y;
      for (let i = holeStart; i < holeStart + gapCols; i++) t.cols[i] = null;
      t.segments = []; let i = 0; while (i < t.nCols) { if (t.cols[i] == null) { i++; continue; } let j = i; while (j < t.nCols && t.cols[j] === t.cols[i]) j++; t.segments.push({ x0: t.x0 + i * T, x1: t.x0 + j * T, top: t.cols[i] }); i = j; }
      const h = window.BS.hero();
      Object.assign(h, { x: t.x0 + (holeStart - 1) * T, y: C.PLAT_Y, vx: C.RUN_SPEED, vy: 0, onGround: true, dead: false });
      window.BS.Input.reset(); window.BS.Input.press('right', true);
      window.BS.stepFixed(8);
      window.BS.Input.press('jump', true);
      window.BS.stepFixed(80); window.BS.Input.reset();
      return { onGround: h.onGround, alive: !h.dead, landedX: h.x, holeEndX: t.x0 + (holeStart + gapCols) * T };
    });
    expect(r.alive).toBe(true);
    expect(r.onGround).toBe(true);
    expect(r.landedX).toBeGreaterThanOrEqual(r.holeEndX);   // landed on the far platform
  });

  test('a tall step blocks horizontal movement (must jump over)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const C = window.BS.CONFIG, T = C.TILE, t = window.BS.terrain();
      for (let i = 0; i < t.nCols; i++) t.cols[i] = C.PLAT_Y;
      for (let i = 10; i < t.nCols; i++) t.cols[i] = C.PLAT_Y - 2 * T;
      t.segments = [{ x0: t.x0, x1: t.x0 + 10 * T, top: C.PLAT_Y }, { x0: t.x0 + 10 * T, x1: t.x1, top: C.PLAT_Y - 2 * T }];
      const h = window.BS.hero(); const wallX = t.x0 + 10 * T;
      Object.assign(h, { x: wallX - 20, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
      window.BS.Input.reset(); window.BS.Input.press('right', true);
      window.BS.stepFixed(120); window.BS.Input.reset();
      return { x: h.x, wallX };
    });
    expect(r.x).toBeLessThanOrEqual(r.wallX + 0.6);    // stopped at the wall face
    expect(r.x).toBeGreaterThan(r.wallX - 30);         // negative control: it did travel toward it
  });
});

test.describe('P3 · lava death + respawn ghost', () => {
  test('falling into a hole costs exactly one life and respawns ghostly', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);
      const C = window.BS.CONFIG, T = C.TILE, t = window.BS.terrain();
      for (let i = 0; i < t.nCols; i++) t.cols[i] = C.PLAT_Y;
      for (let i = 6; i < 6 + Math.floor(C.MAX_JUMP_GAP / T); i++) t.cols[i] = null;
      t.segments = []; let i = 0; while (i < t.nCols) { if (t.cols[i] == null) { i++; continue; } let j = i; while (j < t.nCols && t.cols[j] === t.cols[i]) j++; t.segments.push({ x0: t.x0 + i * T, x1: t.x0 + j * T, top: t.cols[i] }); i = j; }
      const st = window.BS.state(); st.hp = 3;
      const h = window.BS.hero();
      Object.assign(h, { x: t.x0 + 7 * T, y: C.PLAT_Y - 10, vx: 0, vy: 0, onGround: false, dead: false, ghost: 0, hurt: 0 });
      for (let k = 0; k < 240 && st.hp === 3; k++) window.BS.stepFixed(1);
      return { hp: st.hp, ghost: h.ghost, respawnGhost: C.RESPAWN_GHOST, safeY: h.y, lavaY: C.LAVA_Y };
    });
    expect(r.hp).toBe(2);
    expect(r.ghost).toBeGreaterThan(0);
    expect(r.ghost).toBeLessThanOrEqual(r.respawnGhost);
    expect(r.safeY).toBeLessThan(r.lavaY);
  });
});

test.describe('P3 · hurt, knockback, invulnerability', () => {
  test('hit knocks left + grants i-frames; ghost/i-frames block further hits (neg. control)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode('normal'); window.BS.Input.reset();
      const st = window.BS.state(); st.hp = 3; st.hitThisLevel = false;
      const h = window.BS.hero(); Object.assign(h, { ghost: 0, hurt: 0, vx: 0, dead: false });
      const hit1 = window.BS.heroHurt(true);
      const vxAfter = h.vx, hurtAfter = h.hurt, hitFlag = st.hitThisLevel, hpAfter1 = st.hp;
      const hit2 = window.BS.heroHurt(true);
      h.hurt = 0; h.ghost = 1.0;
      const hit3 = window.BS.heroHurt(true);
      window.BS.Input.reset();
      return { hit1, hit2, hit3, vxAfter, hurtAfter, hitFlag, hp: st.hp, hpAfter1 };
    });
    expect(r.hit1).toBe(true);
    expect(r.vxAfter).toBeLessThan(0);        // knocked LEFT (toward the left lava)
    expect(r.hurtAfter).toBeGreaterThan(0);
    expect(r.hitFlag).toBe(true);
    expect(r.hpAfter1).toBeCloseTo(2.75, 5);  // Normal: one hit chips 1/4 heart
    expect(r.hit2).toBe(false);               // negative control: i-frames block a second hit
    expect(r.hit3).toBe(false);               // negative control: ghost blocks hits
    expect(r.hp).toBeCloseTo(2.75, 5);        // blocked hits cost nothing more
  });
});
