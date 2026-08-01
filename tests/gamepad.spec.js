// @ts-check
// Gamepad support (PS5 DualSense / Xbox / any standard-mapping pad). We mock
// navigator.getGamepads with a synthetic pad and drive pollGamepad() directly (the auto
// loop's polling is gated on !testFreeze, so freezing makes it deterministic).
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

async function installPad(page) {
  await page.evaluate(() => {
    window.__pad = {
      connected: true, mapping: 'standard', id: 'DualSense Wireless Controller',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    navigator.getGamepads = () => [window.__pad];
    window.BS.freeze(true);      // stop the rAF loop from polling; we poll manually
    window.BS.Input.reset();
  });
}
async function poll(page, { buttons = [], axes = [0, 0, 0, 0] } = {}) {
  await page.evaluate(({ buttons, axes }) => {
    const pad = window.__pad;
    pad.buttons.forEach((b, i) => { b.pressed = buttons.includes(i); b.value = b.pressed ? 1 : 0; });
    pad.axes = axes;
    window.BS.pollGamepad();
  }, { buttons, axes });
}
const inPlay = (page) => page.evaluate(() => { window.BS.startGame(1); window.BS.gotoPlay(); });

test.describe('gamepad (PS5 / standard mapping)', () => {
  test('D-pad and left stick move the hero; neutral releases (neg. control: no pad = nothing)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await inPlay(page); await installPad(page);
    // NEGATIVE CONTROL: no pad connected → poll is a no-op
    await page.evaluate(() => { navigator.getGamepads = () => []; window.BS.Input.reset(); window.BS.pollGamepad(); });
    expect(await page.evaluate(() => window.BS.Input.right)).toBe(false);
    await page.evaluate(() => { navigator.getGamepads = () => [window.__pad]; });
    // D-pad right (button 15)
    await poll(page, { buttons: [15] });
    expect(await page.evaluate(() => window.BS.Input.right)).toBe(true);
    // release
    await poll(page, { buttons: [] });
    expect(await page.evaluate(() => ({ l: window.BS.Input.left, r: window.BS.Input.right }))).toEqual({ l: false, r: false });
    // left stick pushed left
    await poll(page, { axes: [-1, 0, 0, 0] });
    expect(await page.evaluate(() => window.BS.Input.left)).toBe(true);
  });

  test('✕ (or ↑) = jump: held + rising-edge buffered, release clears', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await inPlay(page); await installPad(page);
    await poll(page, { buttons: [0] });   // cross
    const r = await page.evaluate(() => ({ held: window.BS.Input.jumpHeld, queued: window.BS.Input.consumeJump() }));
    expect(r).toEqual({ held: true, queued: true });
    await poll(page, { buttons: [] });
    expect(await page.evaluate(() => window.BS.Input.jumpHeld)).toBe(false);
    // the D-pad up also jumps
    await poll(page, { buttons: [12] });
    expect(await page.evaluate(() => window.BS.Input.jumpHeld)).toBe(true);
  });

  test('○ (or ↓) = the ↓ skill action, edge-buffered like the DOWN key', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await inPlay(page); await installPad(page);
    await poll(page, { buttons: [1] });   // circle
    const r = await page.evaluate(() => ({ down: window.BS.Input.down, queued: window.BS.Input.consumeDown() }));
    expect(r).toEqual({ down: true, queued: true });
  });

  test('Options starts the game from the title, and pauses in play', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installPad(page);
    await page.evaluate(() => window.BS.gotoTitle());
    await poll(page, { buttons: [9] });               // Options on the title → start
    expect(await page.evaluate(() => window.BS.scene())).not.toBe('TITLE');
    await inPlay(page);
    await poll(page, { buttons: [] });                // clear the edge
    await poll(page, { buttons: [9] });               // Options in play → pause
    expect(await page.evaluate(() => window.BS.isPaused())).toBe(true);
  });

  test('✕ advances a transient screen (VICTORY → title)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installPad(page);
    await page.evaluate(() => { const st = window.BS.state(); st.scene = 'VICTORY'; st.sceneT = 1; });
    await poll(page, { buttons: [0] });               // cross → tapAdvance
    expect(await page.evaluate(() => window.BS.scene())).toBe('TITLE');
  });

  test('movement is ignored on menus (neg. control: stick does nothing on the title)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installPad(page);
    await page.evaluate(() => window.BS.gotoTitle());
    await poll(page, { axes: [-1, 0, 0, 0] });         // stick left, but not playing
    expect(await page.evaluate(() => window.BS.Input.left)).toBe(false);
  });
});

// Open the merchant with the grid built + a mock pad installed; freeze the loop.
async function openShopWithPad(page) {
  await page.evaluate(() => {
    const st = window.BS.state(); st.level = 1; window.BS.setMode('normal'); st.points = 999;
    window.BS.gotoShop(); window.BS.buildShop();
    window.__pad = { connected: true, mapping: 'standard', id: 'DualSense', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    navigator.getGamepads = () => [window.__pad];
    window.BS.freeze(true);
  });
}
const cells = (page) => page.evaluate(() => document.querySelectorAll('#shop-grid .shop-item').length);

test.describe('merchant · controller navigation', () => {
  test('L1/R1 switch tabs (Skills ↔ Healing ↔ Costumes)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0); await openShopWithPad(page);
    expect(await page.evaluate(() => window.BS.state().shopTab)).toBe('skills');
    await poll(page, { buttons: [5] });                    // R1 → next
    expect(await page.evaluate(() => window.BS.state().shopTab)).toBe('healing');
    await poll(page, { buttons: [] }); await poll(page, { buttons: [5] });   // R1 → next
    expect(await page.evaluate(() => window.BS.state().shopTab)).toBe('costumes');
    await poll(page, { buttons: [] }); await poll(page, { buttons: [4] });   // L1 → prev
    expect(await page.evaluate(() => window.BS.state().shopTab)).toBe('healing');
  });

  test('the costumes tab shows every costume (widened window)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0); await openShopWithPad(page);
    await poll(page, { buttons: [5] }); await poll(page, { buttons: [] }); await poll(page, { buttons: [5] });   // → costumes
    const n = await cells(page), total = await page.evaluate(() => window.BS.COSTUMES.length);
    expect(n).toBeGreaterThanOrEqual(total - 1);   // all costumes present (bandana may be earn-only)
  });

  test('d-pad moves the cursor and ✕ buys the selected item', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0); await openShopWithPad(page);
    await poll(page, { buttons: [15] });                   // D-right → cursor to item 1
    expect(await page.evaluate(() => window.BS.state().shopSel)).toBe(1);
    const key = await page.evaluate(() => document.querySelectorAll('#shop-grid .shop-item')[window.BS.state().shopSel].dataset.key);
    await page.evaluate(() => { window.BS.state().owned[document.querySelectorAll('#shop-grid .shop-item')[window.BS.state().shopSel].dataset.key] = false; });
    await poll(page, { buttons: [] }); await poll(page, { buttons: [0] });   // ✕ → buy
    expect(await page.evaluate((k) => !!window.BS.state().owned[k], key)).toBe(true);
    expect(await page.evaluate(() => window.BS.state().points)).toBeLessThan(999);   // spent points
  });

  test('○ leaves the merchant', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0); await openShopWithPad(page);
    await poll(page, { buttons: [1] });                    // ○ → leave
    expect(await page.evaluate(() => window.BS.merchant() && window.BS.merchant().state)).toBe('ascend');
  });
});

// A pad whose vibration actuator records every playEffect call.
async function installHapticPad(page) {
  await page.evaluate(() => {
    window.__rumbles = [];
    window.__pad = {
      connected: true, mapping: 'standard', id: 'DualSense',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0],
      vibrationActuator: { playEffect: (type, opts) => { window.__rumbles.push({ type, opts }); return Promise.resolve('complete'); } },
    };
    navigator.getGamepads = () => [window.__pad];
    window.BS.freeze(true);
  });
}
const rumbleCount = (page) => page.evaluate(() => window.__rumbles.length);

test.describe('haptic rumble', () => {
  test('rumble() plays a dual-rumble effect with the given magnitudes (neg. control: no actuator)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installHapticPad(page);
    await page.evaluate(() => window.BS.rumble(0.5, 0.3, 120));
    const r = await page.evaluate(() => window.__rumbles);
    expect(r.length).toBe(1);
    expect(r[0].type).toBe('dual-rumble');
    expect(r[0].opts.strongMagnitude).toBe(0.5);
    expect(r[0].opts.weakMagnitude).toBe(0.3);
    // NEGATIVE CONTROL: a pad without a vibration actuator → no-op
    await page.evaluate(() => { window.__pad.vibrationActuator = null; window.__rumbles = []; window.BS.rumble(1, 1, 100); });
    expect(await rumbleCount(page)).toBe(0);
  });

  test('getting HIT rumbles the pad (neg. control: harmless Easy-mode contact does not)', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installHapticPad(page);
    await page.evaluate(() => {
      window.BS.startGame(1); window.BS.gotoPlay(); window.BS.setMode('normal');
      Object.assign(window.BS.hero(), { ghost: 0, hurt: 0, dead: false }); window.__rumbles = [];
      window.BS.heroHurt(true);
    });
    expect(await rumbleCount(page)).toBeGreaterThan(0);
    // NEGATIVE CONTROL: in Easy, contact is harmless → no hit, no rumble
    await page.evaluate(() => {
      window.BS.setMode('easy'); Object.assign(window.BS.hero(), { ghost: 0, hurt: 0, dead: false }); window.__rumbles = [];
      window.BS.heroHurt(true);
    });
    expect(await rumbleCount(page)).toBe(0);
  });

  test('FALLING (a death/respawn) rumbles the pad', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installHapticPad(page);
    await page.evaluate(() => {
      window.BS.startGame(1); window.BS.gotoPlay(); const st = window.BS.state(); st.hp = 5;
      Object.assign(window.BS.hero(), { dead: false }); window.__rumbles = [];
      window.BS.heroDie();
    });
    expect(await rumbleCount(page)).toBeGreaterThan(0);
  });

  test('the boss SCREAM rumbles the pad', async ({ page }) => {
    await openGame(page); await enterPlayPanel(page, 0);
    await installHapticPad(page);
    await page.evaluate(() => {
      const st = window.BS.state(); st.level = 6; window.BS.setMode('normal'); window.BS.enterArena();
      st.scene = 'PLAY'; st.paused = false; window.BS.Input.reset();
      const b = window.BS.boss(); b.state = 'shriek'; b.stateT = 0.02;   // about to unleash the scream
      window.__rumbles = [];
      for (let i = 0; i < 12; i++) window.BS.step(1 / 120);
    });
    expect(await rumbleCount(page)).toBeGreaterThan(0);
  });
});
