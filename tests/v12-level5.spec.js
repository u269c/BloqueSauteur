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

test('the boss scream freezes the hero (~5s), which prevents movement; then releases', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(5); window.BS.setMode('normal');
    const st = window.BS.state(); st.hero.ghost = 0; window.BS.activateBoss();
    const b = window.BS.boss(), h = window.BS.hero();
    // force a scream (hero not ghostly, so the freeze lands)
    b.state = 'idle'; b.x = b.startX; b.stateT = 0; b.screamT = 0;
    window.BS.stepFixed(1);
    const frozen = h.frozen, screaming = b.state === 'scream';
    // movement block: hold right while frozen (ghost now, so the boss can't knock us) → no movement
    h.ghost = 1e9; const x0 = h.x;
    window.BS.Input.reset(); window.BS.Input.press('right', true); window.BS.stepFixed(30);
    const moved = Math.abs(h.x - x0);
    window.BS.Input.reset();
    return { frozen, screaming, moved };
  });
  expect(r.frozen).toBeGreaterThan(4);       // ~5s freeze
  expect(r.screaming).toBe(true);
  expect(r.moved).toBeLessThan(1);           // input ignored while frozen
});
