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

test('high-jump mushroom lasts 5 jumps (counter decrements per jump)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.Input.reset();
    const C = window.BS.CONFIG, h = window.BS.hero();
    Object.assign(h, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, dead: false, ghost: 1e9 });
    window.BS.applyMushroom('highjump');
    const afterApply = h.bigJump;
    window.BS.Input.press('jump', true); window.BS.stepFixed(1); window.BS.Input.press('jump', false);
    return { afterApply, afterOneJump: h.bigJump };
  });
  expect(r.afterApply).toBe(5);        // charges 5 big jumps
  expect(r.afterOneJump).toBe(4);      // one jump consumes one charge (not a one-shot)
});

test('boss-arena kills score no points (neg. control: traverse kills do)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const pts = async (phase) => page.evaluate((phase) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(3);
    if (phase === 'boss') window.BS.enterArena();   // a real boss fight (bossActive)
    const st = window.BS.state(); st.points = 0; window.BS.hero().onGround = true;
    window.BS.addKill(100, 100, '#fff');
    return st.points;
  }, phase);
  expect(await pts('boss')).toBe(0);      // no farming during the boss duel
  expect(await pts('traverse')).toBe(1);  // neg. control: normal kills still score
});

test('blue donuts: rare on L3-5 only, home toward the hero, worth 3 points', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const r = await page.evaluate(() => {
    const blues = (lv) => { let tot = 0; for (let s = 0; s < 80; s++) tot += window.BS.genLevel(lv, s).enemies.filter((e) => e.type === 'blue').length; return tot; };
    // behaviour: homing + score
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1);
    const st = window.BS.state(); st.enemies.length = 0; st.points = 0;
    const C = window.BS.CONFIG, h = window.BS.hero(); h.ghost = 1e9; Object.assign(h, { x: 300, y: C.PLAT_Y, onGround: true });
    window.BS.spawnEnemy('blue'); const e = window.BS.enemies()[0]; e.homing = true; e.patrol = false; Object.assign(e, { x: 120, y: C.PLAT_Y, onGround: true });
    const x0 = e.x; for (let k = 0; k < 90; k++) window.BS.stepFixed(1);
    const moved = window.BS.enemies()[0].x - x0;
    st.points = 0; const b = window.BS.enemies()[0]; Object.assign(h, { x: b.x, y: b.y - b.r - 3, vy: 60, onGround: false, ghost: 0 }); window.BS.stepFixed(3);
    return { l1: blues(1), l2: blues(2), l3: blues(3), l45: blues(4) + blues(5), moved: Math.round(moved), pts: st.points };
  });
  expect(r.l1).toBe(0);              // never on levels 1-2
  expect(r.l2).toBe(0);
  expect(r.l3).toBeGreaterThan(0);   // present (rarely) on 3-5
  expect(r.l45).toBeGreaterThan(0);
  expect(r.moved).toBeGreaterThan(20);   // homed toward the hero (was to its right)
  expect(r.pts).toBe(3);                 // worth 3 points
});

test('stomping is forgiving: descending onto the upper portion / a bit off-centre still kills', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const tryStomp = (dy, dx, vy) => page.evaluate(({ dy, dx, vy }) => {
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.setMode('normal');
    const st = window.BS.state(); st.enemies.length = 0; st.hp = 5;
    const C = window.BS.CONFIG; window.BS.spawnEnemy('clear');
    const e = window.BS.enemies()[0]; Object.assign(e, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
    const h = window.BS.hero(); Object.assign(h, { x: 240 + dx, y: e.y - e.r * dy, vx: 0, vy, onGround: false, ghost: 0, hurt: 0, dead: false });
    window.BS.stepFixed(2);
    return { alive: window.BS.enemies()[0] ? window.BS.enemies()[0].alive : false, hp: st.hp };
  }, { dy, dx, vy });
  const upper = await tryStomp(0.6, 0, 60);   // feet only ~60% up (below the old centre threshold) — descending
  expect(upper.alive).toBe(false);            // still a stomp now
  expect(upper.hp).toBe(5);                   // no damage
  const offset = await tryStomp(1.4, 15, 60); // 15px off-centre, descending onto the top
  expect(offset.alive).toBe(false);           // wider reach catches it
  // neg. control: grounded, level with the enemy (not descending) → a side hit, not a stomp
  const sideways = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1); window.BS.setMode('normal');
    const st = window.BS.state(); st.enemies.length = 0; st.hp = 5; const C = window.BS.CONFIG;
    window.BS.spawnEnemy('clear'); const e = window.BS.enemies()[0]; Object.assign(e, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
    const h = window.BS.hero(); Object.assign(h, { x: 252, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost: 0, hurt: 0, dead: false });
    window.BS.stepFixed(1);
    return { alive: window.BS.enemies()[0] ? window.BS.enemies()[0].alive : false, hp: st.hp };
  });
  expect(sideways.alive).toBe(true);      // enemy survives a side bump
  expect(sideways.hp).toBeLessThan(5);    // and the hero takes a hit
});

test('enemies push apart instead of overlapping', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setupArena(1);
    const st = window.BS.state(); st.enemies.length = 0; st.hero.ghost = 1e9;
    const C = window.BS.CONFIG;
    window.BS.spawnEnemy('clear'); window.BS.spawnEnemy('clear');
    const a = window.BS.enemies()[0], b = window.BS.enemies()[1];
    Object.assign(a, { x: 238, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, patrol: true, dir: 1 });
    Object.assign(b, { x: 242, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, patrol: true, dir: -1 });
    const before = Math.abs(a.x - b.x);
    for (let k = 0; k < 20; k++) window.BS.stepFixed(1);
    return { before, after: Math.abs(a.x - b.x), r: a.r };
  });
  expect(r.before).toBeLessThan(2 * r.r);        // started overlapping
  expect(r.after).toBeGreaterThanOrEqual(2 * r.r - 1);   // pushed apart to (roughly) non-overlap
});
