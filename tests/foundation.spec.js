// @ts-check
// P1 foundation acceptance tests. Each assertion pairs a positive check with a
// negative control so a passing test can't be vacuously true.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.describe('P1 · RNG determinism', () => {
  test('same seed → identical sequence; different seed → different (neg. control)', async ({ page }) => {
    await openGame(page);
    const seq = await page.evaluate(() => {
      const gen = (s) => { const r = window.BS.mulberry32(s); return [r(), r(), r(), r(), r()]; };
      return { a: gen(12345), a2: gen(12345), b: gen(99999) };
    });
    expect(seq.a).toEqual(seq.a2);          // deterministic
    expect(seq.a).not.toEqual(seq.b);       // negative control: seed actually matters
    for (const v of seq.a) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

test.describe('P1 · fixed-timestep determinism', () => {
  test('same seed + same inputs → identical hero state; different input diverges', async ({ page }) => {
    await openGame(page, { seed: 777 });
    const run = await page.evaluate(() => {
      const snap = () => { const h = window.BS.state().hero; return { x: h.x, y: h.y, vx: h.vx, vy: h.vy }; };
      const runOnce = (holdRight) => {
        window.BS.reseed(777); window.BS.start();
        window.BS.Input.reset();
        if (holdRight) window.BS.Input.press('right', true);
        window.BS.stepFixed(240);           // 2 s of fixed steps
        const s = snap(); window.BS.Input.reset(); return s;
      };
      const a = runOnce(true), a2 = runOnce(true), idle = runOnce(false);
      return { a, a2, idle };
    });
    expect(run.a).toEqual(run.a2);                    // deterministic under fixed steps
    expect(run.a.x).not.toBeCloseTo(run.idle.x, 1);   // negative control: input changes outcome
  });
});

test.describe('P1 · input → movement', () => {
  test('right increases x, left decreases x, idle holds', async ({ page }) => {
    await openGame(page, { seed: 1 });
    const r = await page.evaluate(() => {
      const x = () => window.BS.state().hero.x;
      const measure = (dir) => {
        window.BS.reseed(1); window.BS.start(); window.BS.Input.reset();
        const x0 = x();
        if (dir) window.BS.Input.press(dir, true);
        window.BS.stepFixed(60);
        const dx = x() - x0; window.BS.Input.reset(); return dx;
      };
      return { right: measure('right'), left: measure('left'), idle: measure(null) };
    });
    expect(r.right).toBeGreaterThan(5);
    expect(r.left).toBeLessThan(-5);
    expect(Math.abs(r.idle)).toBeLessThan(0.001);   // negative control
  });

  test('jump leaves the ground and rises', async ({ page }) => {
    await openGame(page, { seed: 1 });
    const r = await page.evaluate(() => {
      window.BS.reseed(1); window.BS.start(); window.BS.Input.reset();
      const h = window.BS.state().hero; const y0 = h.y;
      window.BS.Input.press('jump', true);
      window.BS.stepFixed(1);                 // consume the queued jump
      const afterJump = { vy: h.vy, onGround: h.onGround };
      window.BS.stepFixed(20);
      const rose = h.y < y0;
      // negative control: without a jump the hero stays grounded
      window.BS.reseed(1); window.BS.start(); window.BS.Input.reset();
      window.BS.stepFixed(21);
      const stayed = window.BS.state().hero.onGround;
      return { afterJump, rose, stayed };
    });
    expect(r.afterJump.vy).toBeLessThan(0);
    expect(r.afterJump.onGround).toBe(false);
    expect(r.rose).toBe(true);
    expect(r.stayed).toBe(true);              // negative control
  });
});

test.describe('P1 · audio unlock on gesture', () => {
  test('tapping the start overlay resumes the AudioContext', async ({ page }) => {
    await openGame(page);
    expect(await page.evaluate(() => window.BS.audioState())).toBe('none'); // not yet created
    await page.locator('#start').click();
    await page.waitForFunction(() => window.BS.audioState() === 'running');
    expect(await page.evaluate(() => window.BS.audioState())).toBe('running');
    expect(await page.evaluate(() => window.BS.scene())).toBe('PLAY');       // gesture also starts game
  });
});
