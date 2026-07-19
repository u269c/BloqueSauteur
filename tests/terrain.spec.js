// @ts-check
// P2 terrain acceptance tests: determinism + fairness invariants.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

// Pull terrain facts + derived hole/step metrics out of the page.
async function analyze(page, level, seed) {
  return page.evaluate(({ level, seed }) => {
    const t = window.BS.genTerrain(level, seed);
    const C = window.BS.CONFIG, T = C.TILE;
    // holes = gaps between consecutive segments
    const holes = [];
    for (let i = 0; i < t.segments.length - 1; i++) {
      const w = t.segments[i + 1].x0 - t.segments[i].x1;
      if (w > 0) holes.push({ w, leftTop: t.segments[i].top, rightTop: t.segments[i + 1].top });
    }
    const steps = [];
    for (let i = 0; i < t.segments.length - 1; i++)
      steps.push(Math.abs(t.segments[i + 1].top - t.segments[i].top));
    return {
      segs: t.segments, holes, steps,
      x0: t.x0, x1: t.x1, nSeg: t.segments.length,
      firstX0: t.segments[0].x0, lastX1: t.segments[t.segments.length - 1].x1,
      MAX_JUMP_GAP: C.MAX_JUMP_GAP, JUMP_MAX_H: C.JUMP_MAX_H,
      cols: t.cols,
    };
  }, { level, seed });
}

test.describe('P2 · determinism', () => {
  test('same (level, seed) → identical terrain; different seed differs (neg. control)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      const j = (t) => JSON.stringify(t.segments);
      const a = window.BS.genTerrain(2, 4242);
      const a2 = window.BS.genTerrain(2, 4242);
      const b = window.BS.genTerrain(2, 4243);
      return { same: j(a) === j(a2), diff: j(a) === j(b) };
    });
    expect(r.same).toBe(true);
    expect(r.diff).toBe(false);           // negative control: seed actually varies terrain
  });
});

test.describe('P2 · fairness invariants (all levels, many seeds)', () => {
  const seeds = [1, 2, 7, 42, 99, 128, 777, 1000, 31337, 65535];
  for (const level of [1, 2, 3, 4]) {
    test(`level ${level}: solid edges, holes ≤ MAX_JUMP_GAP, steps ≤ JUMP_MAX_H`, async ({ page }) => {
      await openGame(page);
      for (const seed of seeds) {
        const a = await analyze(page, level, seed);
        // solid footing at both ends
        expect(a.firstX0, `L${level} s${seed} left edge`).toBe(a.x0);
        expect(a.lastX1, `L${level} s${seed} right edge`).toBe(a.x1);
        // every hole is jumpable, and takeoff/landing height gap is jumpable
        for (const h of a.holes) {
          expect(h.w, `L${level} s${seed} hole width`).toBeLessThanOrEqual(a.MAX_JUMP_GAP);
          expect(h.w, `L${level} s${seed} hole >0`).toBeGreaterThan(0);
          expect(Math.abs(h.leftTop - h.rightTop)).toBeLessThanOrEqual(a.JUMP_MAX_H);
        }
        // every vertical step between adjacent segments is jumpable
        for (const s of a.steps) expect(s, `L${level} s${seed} step`).toBeLessThanOrEqual(a.JUMP_MAX_H);
      }
    });
  }

  test('level shape matches spec: L1 flat, L3 splits into 2–3 mini-platforms', async ({ page }) => {
    await openGame(page);
    // L1 is always a single flat segment
    for (const seed of [1, 42, 999]) {
      const l1 = await analyze(page, 1, seed);
      expect(l1.nSeg, `L1 s${seed} flat`).toBe(1);
      expect(l1.holes.length).toBe(0);
    }
    // L3 splits into 2–3 platforms (1–2 holes) across seeds
    const counts = [];
    for (const seed of [1, 2, 7, 42, 99, 128, 777]) counts.push((await analyze(page, 3, seed)).nSeg);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...counts)).toBeLessThanOrEqual(3);
  });
});

test.describe('P2 · surface sampling', () => {
  test('surfaceAt returns ground on segments and null over holes', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      // find a seed whose L2 terrain actually has a hole
      let t = null;
      for (let s = 1; s < 200 && !t; s++) { const g = window.BS.genTerrain(2, s); for (let i = 0; i < g.segments.length - 1; i++) if (g.segments[i + 1].x0 > g.segments[i].x1) { t = g; } }
      const surfAt = (x) => window.BS.surfaceAt(t, x);
      const hole = (() => { for (let i = 0; i < t.segments.length - 1; i++) { const a = t.segments[i].x1, b = t.segments[i + 1].x0; if (b > a) return (a + b) / 2; } })();
      const onGround = t.segments[0].x0 + 4;
      return { overHole: surfAt(hole), onGround: surfAt(onGround), offLeft: surfAt(t.x0 - 10), offRight: surfAt(t.x1 + 10) };
    });
    expect(r.overHole).toBeNull();            // hole → no ground
    expect(r.onGround).not.toBeNull();        // segment → ground
    expect(r.offLeft).toBeNull();
    expect(r.offRight).toBeNull();
  });
});

test.describe('v1.4 · no pinhole gaps, spawn runways stay solid', () => {
  const seeds = [1, 2, 7, 42, 99, 128, 777, 1000, 31337, 65535];

  test('no hole is narrower than 2 tiles (single-tile pinholes removed)', async ({ page }) => {
    await openGame(page);
    const T = await page.evaluate(() => window.BS.CONFIG.TILE);
    let sawAnyHole = false;
    for (const level of [2, 3, 4, 5]) {
      for (const seed of seeds) {
        const a = await analyze(page, level, seed);
        for (const h of a.holes) { sawAnyHole = true; expect(h.w, `L${level} s${seed} hole width`).toBeGreaterThanOrEqual(2 * T); }
      }
    }
    expect(sawAnyHole).toBe(true);   // neg. control: we actually generated holes to check
  });

  test('the columns around each spawner are solid ground (monsters get runway)', async ({ page }) => {
    await openGame(page);
    for (const level of [2, 3, 4, 5]) {
      for (const seed of seeds) {
        const r = await page.evaluate(({ level, seed }) => {
          const t = window.BS.genTerrain(level, seed), C = window.BS.CONFIG, T = C.TILE;
          const solid = (x) => window.BS.surfaceAt(t, x) != null;
          const out = { right: [], left: [] };
          // 3-tile runway inward from each spawner's landing column
          for (let k = 0; k <= 3; k++) { out.right.push(solid(C.SPAWN_X - k * T)); out.left.push(solid(C.SPAWN_X_L + k * T)); }
          return out;
        }, { level, seed });
        expect(r.right, `L${level} s${seed} right runway`).not.toContain(false);
        expect(r.left, `L${level} s${seed} left runway`).not.toContain(false);
      }
    }
  });
});
