// @ts-check
// P6 flow / UI / audio / persistence acceptance tests + cross-cutting e2e journeys.
const { test, expect } = require('@playwright/test');
const { openGame, gameUrl, enterPlayPanel } = require('./helpers');

test.describe('P6 · scene flow', () => {
  test('E2E: title → play → boss → clear → level 2 (no-hit bonus)', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start();                       // straight into PLAY on L1
      window.BS.setMode('normal');
      const st = window.BS.state(); st.hero.ghost = 1e9; st.hitThisLevel = false;   // survive untouched
      const hp0 = st.hp;
      window.BS.enterArena();            // boss emerges
      const bossType = window.BS.boss() && window.BS.boss().type;
      for (let k = 0; k < 3; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      const sceneClear = st.scene, gained = st.gainedLife, hpAfter = st.hp;
      window.BS.tapAdvance();                  // CLEAR → SHOP (merchant visits)
      const sceneShop = st.scene;
      window.BS.closeShop();                    // leave the merchant
      for (let k = 0; k < 30 && st.scene === 'SHOP'; k++) window.BS.stepFixed(1);  // merchant departs
      return { bossType, sceneClear, sceneShop, gained, hp0, hpAfter, level: st.level, scene: st.scene };
    });
    expect(r.bossType).toBe('clear');
    expect(r.sceneClear).toBe('CLEAR');
    expect(r.sceneShop).toBe('SHOP');          // merchant appears after the level
    expect(r.gained).toBe(true);               // no-hit level
    expect(r.hpAfter).toBe(r.hp0 + 1);         // +1 heart bonus (can exceed 3)
    expect(r.level).toBe(2);
    expect(r.scene).toBe('INTRO');
  });

  test('Normal grants the end-of-level heart even after taking a hit (unconditional)', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('normal');
      const st = window.BS.state(); st.hero.ghost = 0; st.hero.hurt = 0; st.hitThisLevel = false; st.hp = 3;
      window.BS.heroHurt(true);                // take a hit this level (−¼ heart)
      const hpAfterHit = st.hp;
      window.BS.enterArena();
      const need = window.BS.boss().maxHits;
      for (let k = 0; k < need; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      return { gained: st.gainedLife, hpAfterHit, hpAfterClear: st.hp, levelHearts: st.levelHearts };
    });
    expect(r.hpAfterHit).toBeCloseTo(2.75, 5);   // hit still chips a heart
    expect(r.gained).toBe(true);                 // heart is unconditional in Easy/Normal now
    expect(r.levelHearts).toBe(1);
    expect(r.hpAfterClear).toBeCloseTo(3.75, 5); // 2.75 + 1 (the earned heart)
  });

  test('E2E: losing all health ends in GAME OVER', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setupArena(1); const st = window.BS.state(); st.hp = 3;
      const C = window.BS.CONFIG, h = window.BS.hero();
      for (let d = 0; d < 3 && st.scene === 'PLAY'; d++) {           // three fatal lava falls (−1 heart each)
        Object.assign(h, { x: C.PLAT_X0 - 30, y: C.LAVA_Y + 1, vx: 0, vy: 0, ghost: 0, hurt: 0, dead: false, onGround: false });
        window.BS.stepFixed(1);
      }
      return { hp: st.hp, scene: st.scene };
    });
    expect(r.hp).toBe(0);
    expect(r.scene).toBe('GAMEOVER');
  });

  test('E2E: beating the final (level-5) boss ends in VICTORY', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('normal'); const st = window.BS.state();
      st.level = window.BS.LAST_LEVEL; window.BS.setLevel(window.BS.LAST_LEVEL); st.hero.ghost = 1e9;
      window.BS.enterArena();
      // volcano boss has 2 lives; keep hitting through both.
      let guard = 0;
      while (window.BS.boss() && guard++ < 60) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      const clear = st.scene;              // CLEAR first
      window.BS.tapAdvance();              // CLEAR → SHOP
      const shop = st.scene;
      window.BS.closeShop();
      for (let k = 0; k < 60 && st.scene === 'SHOP'; k++) window.BS.stepFixed(1);  // → VICTORY (past level 5)
      return { clear, shop, scene: st.scene };
    });
    expect(r.clear).toBe('CLEAR');
    expect(r.shop).toBe('SHOP');
    expect(r.scene).toBe('VICTORY');
  });
});

test.describe('P6 · pause lifecycle', () => {
  test('E2E: window blur pauses; resume unpauses', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      window.BS.start();
      window.dispatchEvent(new Event('blur'));
      const paused = window.BS.isPaused();
      window.BS.pause(false);
      return { paused, resumed: window.BS.isPaused() };
    });
    expect(r.paused).toBe(true);       // auto-paused on blur
    expect(r.resumed).toBe(false);
  });

  test('the level timer does not advance while paused', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); const st = window.BS.state(); st.t = 5;
      window.BS.pause(true);
      const t0 = st.t; window.BS.stepFixed(120); const t1 = st.t;   // 1s of steps while paused
      window.BS.pause(false); window.BS.stepFixed(120); const t2 = st.t;
      return { t0, t1, t2 };
    });
    expect(r.t1).toBeCloseTo(r.t0, 5);          // frozen while paused
    expect(r.t2).toBeGreaterThan(r.t1 + 0.5);   // advances again after resume
  });
});

test.describe('P6 · colour picker + persistence', () => {
  test('E2E: colour persists in the slot across reload; rainbow locked until L4', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page);                       // slot 0 → play panel
    const swatches = page.locator('#swatches .swatch');
    await expect(swatches.last()).toHaveClass(/locked/);   // rainbow locked
    await swatches.nth(4).click();                    // pick orange
    expect(await page.evaluate(() => window.BS.hero().colorIdx)).toBe(4);
    // reload → re-select the same slot → colour restored
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    await enterPlayPanel(page);
    expect(await page.evaluate(() => window.BS.hero().colorIdx)).toBe(4);

    // unlock rainbow, persist to the slot
    await page.evaluate(() => { window.BS.state().rainbowUnlocked = true; window.BS.Save.save(); window.BS.buildSwatches(); });
    await expect(page.locator('#swatches .swatch').last()).not.toHaveClass(/locked/);
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    await enterPlayPanel(page);
    await expect(page.locator('#swatches .swatch').last()).not.toHaveClass(/locked/);   // still unlocked
  });

  test('mute toggle persists across reload (global, not per-slot)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page); await page.locator('#play-btn').click();   // start → topbar clickable
    await page.locator('#mute-btn').click();
    expect(await page.evaluate(() => window.BS.muted())).toBe(true);
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    expect(await page.evaluate(() => window.BS.muted())).toBe(true);
  });
});

test.describe('P6 · determinism & seed', () => {
  test('E2E: ?seed=123 yields identical terrain across two loads', async ({ page }) => {
    await openGame(page, { seed: 123 });
    const a = await page.evaluate(() => JSON.stringify(window.BS.genTerrain(2, window.BS.seed())));
    await page.goto(gameUrl({ seed: 123 })); await page.waitForFunction(() => !!window.BS);
    const b = await page.evaluate(() => JSON.stringify(window.BS.genTerrain(2, window.BS.seed())));
    expect(a).toBe(b);
  });

  test('fixed timestep: state depends on step count, not chunking (frame-rate independent)', async ({ page }) => {
    await openGame(page, { seed: 55 });
    const r = await page.evaluate(() => {
      window.BS.freeze(true);
      const run = (chunks) => {
        window.BS.start(); window.BS.reseed(55); window.BS.setLevel(1); window.BS.Input.reset();
        window.BS.Input.press('right', true);
        for (const c of chunks) window.BS.stepFixed(c);
        const h = window.BS.hero(); window.BS.Input.reset();
        return { x: +h.x.toFixed(6), y: +h.y.toFixed(6) };
      };
      // same total (240 steps) delivered as 60Hz-like big chunks vs 120Hz-like singles
      return { coarse: run([4, 4, 4, 228]), fine: run(Array(240).fill(1)) };
    });
    expect(r.coarse).toEqual(r.fine);   // identical → wall-clock frame rate cannot change physics
  });

  test('music track switches with scene (title → level → boss)', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      window.BS.freeze(true);
      window.BS.gotoTitle();  const title = window.BS.musicKey();
      window.BS.startGame();  const lvl = window.BS.musicKey();       // title → intro starts level-1 music
      const st = window.BS.state();
      window.BS.gotoPlay(); window.BS.enterArena();
      const boss = window.BS.musicKey();                              // boss emergence swaps to boss music
      return { title, lvl, boss };
    });
    expect(r.title).toBe('title');
    expect(r.lvl).toBe(1);
    expect(r.boss).toBe('boss');
  });
});
