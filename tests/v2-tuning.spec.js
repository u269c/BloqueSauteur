// @ts-check
// v2.0 tuning — stomp-bounce respects a held jump (chainable), and the one-way
// jump-through platforms render themed per world without errors.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test('stomping while HOLDING jump rebounds much higher than a tap (chainable)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const apex = async (hold) => page.evaluate((hold) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.setMode('normal'); window.BS.Input.reset();
    const st = window.BS.state(); st.enemies.length = 0;
    const C = window.BS.CONFIG, h = window.BS.hero();
    window.BS.spawnEnemy('clear');
    Object.assign(window.BS.enemies()[0], { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
    Object.assign(h, { x: 240, y: C.PLAT_Y - 10, vx: 0, vy: 60, onGround: false, ghost: 0, hurt: 0, dead: false });
    if (hold) window.BS.Input.press('jump', true);   // hold the jump button across the stomp
    let minY = h.y;
    for (let k = 0; k < 90; k++) { window.BS.stepFixed(1); minY = Math.min(minY, h.y); }
    return C.PLAT_Y - minY;   // apex height reached above the ground line
  }, hold);
  const held = await apex(true), tapped = await apex(false);
  expect(tapped).toBeGreaterThan(0);          // a stomp always rebounds a little
  expect(held).toBeGreaterThan(tapped + 10);  // …but holding jump gives a full-height bounce
});

test('themed jump-through platforms render for every world without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openGame(page);
  const worlds = await page.evaluate(() => window.BS.WORLD_KEYS);
  await page.evaluate(() => { window.BS.start(); window.BS.setLevel(3); });   // L3 traversal has floats
  for (const w of worlds) {
    await page.evaluate((w) => { window.BS.state().theme.world = w; }, w);
    await page.waitForTimeout(40);   // let a couple of frames render this world's floats
  }
  expect(errors).toEqual([]);
});

test('yellow enemies hop while patrolling — clear ones do not (neg. control)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const patrols = async (type) => page.evaluate((type) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1);   // traverse
    const st = window.BS.state(); st.enemies.length = 0; st.hero.ghost = 1e9;
    const top = window.BS.levelData().top;
    window.BS.spawnEnemy(type);
    Object.assign(window.BS.enemies()[0], { x: 200, y: top, vx: 0, vy: 0, onGround: true, patrol: true, dir: 1, baseSpeed: 18 });
    let airborne = false;
    for (let k = 0; k < 300 && window.BS.enemies()[0]; k++) { window.BS.stepFixed(1); if (!window.BS.enemies()[0].onGround) airborne = true; }
    return airborne;
  }, type);
  expect(await patrols('yellow')).toBe(true);    // yellow hops even while patrolling
  expect(await patrols('clear')).toBe(false);    // neg. control: clear enemies stay grounded
});

test('the hero starts with 5 hearts', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => { window.BS.startGame(); return { hp: window.BS.state().hp, base: window.BS.CONFIG.LIVES_START }; });
  expect(r.base).toBe(5);
  expect(r.hp).toBe(5);
});
