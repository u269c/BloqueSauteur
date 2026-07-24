// @ts-check
// v1.2-PR4: level 5 (volcano/thunder) + 2-life scream boss.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test('level 5 is always the volcano world under a thunderstorm', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(999); window.BS.setLevel(5);
    return window.BS.theme();
  });
  expect(r).toEqual({ world: 'classic', sky: 'thunder' });
});

test('the L5 boss has 2 lives: revives once (full 12, faster, bloodshot) then dies', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.setMode('normal'); window.BS.setLevel(5);
    const st = window.BS.state(); st.hero.ghost = 1e9; window.BS.activateBoss();
    const b0 = window.BS.boss(), life1Max = b0.maxHits, lives0 = b0.lives, spd0 = window.BS.CONFIG.SHIELD_ACTIVE; // spd read below via enraged
    // deplete life 1
    for (let k = 0; k < life1Max; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
    const b1 = window.BS.boss();                 // should still exist (revived)
    const revived = { alive: !!b1, hits: b1 ? b1.hits : -1, maxHits: b1 ? b1.maxHits : -1, enraged: b1 ? b1.enraged : false, lives: b1 ? b1.lives : -1 };
    // deplete life 2
    let guard = 0; while (window.BS.boss() && guard++ < 40) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
    return { life1Max, lives0, revived, deadAfter: !window.BS.boss(), scene: st.scene };
  });
  expect(r.lives0).toBe(2);
  expect(r.life1Max).toBe(12);
  expect(r.revived.alive).toBe(true);       // survived the first death
  expect(r.revived.maxHits).toBe(12);       // full 12 bars again
  expect(r.revived.enraged).toBe(true);     // bloodshot / faster
  expect(r.revived.lives).toBe(1);
  expect(r.deadAfter).toBe(true);           // second death ends it
  expect(r.scene).toBe('CLEAR');
});

test('enraged revive charges ~1.5x faster', async ({ page }) => {
  const dist = async (enraged) => page.evaluate((enraged) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(5); window.BS.setMode('normal');
    const st = window.BS.state(); st.hero.ghost = 1e9; window.BS.activateBoss();
    const b = window.BS.boss(); b.enraged = enraged; b.state = 'charge'; b.iframe = 0; b.x = 300; b.y = window.BS.CONFIG.PLAT_Y; b.onGround = true;
    const x0 = b.x; window.BS.stepFixed(30);   // 0.25s
    return x0 - window.BS.boss().x;            // leftward distance
  }, enraged);
  const base = await dist(false), fast = await dist(true);
  expect(fast).toBeGreaterThan(base * 1.35);
});

test('scream: 1.5s shake warning, then freezes a nearby hero (~1.5s) but not one ½-screen away', async ({ page }) => {
  const run = (dist) => page.evaluate((dist) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(5); window.BS.setMode('normal');
    window.BS.activateBoss();
    const b = window.BS.boss(), h = window.BS.hero(), C = window.BS.CONFIG;
    b.canScream = true; b.state = 'shriek'; b.stateT = 1.5;
    const pin = () => { h.x = b.x - dist; h.y = C.PLAT_Y; h.vx = 0; h.vy = 0; h.dead = false; h.ghost = 0; };   // keep the hero put & mortal
    let warnState = null, warnFrozen = null;
    for (let k = 0; k < 400; k++) { pin(); window.BS.stepFixed(1); if (k === 9) { warnState = b.state; warnFrozen = h.frozen; } if (b.state === 'scream') break; }
    const screaming = b.state === 'scream', frozen = h.frozen;
    // while frozen, movement is blocked (stop pinning x; ghost so the boss can't knock us)
    h.ghost = 1e9; const x0 = h.x; window.BS.Input.reset(); window.BS.Input.press('right', true);
    for (let k = 0; k < 20; k++) { h.y = C.PLAT_Y; h.vy = 0; window.BS.stepFixed(1); }
    const moved = Math.abs(h.x - x0); window.BS.Input.reset();
    return { warnState, warnFrozen, screaming, frozen, moved };
  }, dist);
  const near = await run(60), far = await run(300);
  expect(near.warnState).toBe('shriek');            // still winding up (warning) after 10 frames
  expect(near.warnFrozen).toBe(0);                  // no freeze during the warning
  expect(near.screaming).toBe(true);
  expect(near.frozen).toBeGreaterThan(1);           // ~1.5s stun when close
  expect(near.frozen).toBeLessThanOrEqual(1.6);
  expect(near.moved).toBeLessThan(1);               // input ignored while frozen
  expect(far.frozen).toBe(0);                       // ½-screen away → avoided (neg. control)
});
