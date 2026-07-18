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
      st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);            // boss emerges
      const bossType = window.BS.boss() && window.BS.boss().type;
      for (let k = 0; k < 3; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      const sceneClear = st.scene, gained = st.gainedLife, hpAfter = st.hp;
      window.BS.tapAdvance();                  // dismiss CLEAR
      return { bossType, sceneClear, gained, hp0, hpAfter, level: st.level, scene: st.scene };
    });
    expect(r.bossType).toBe('clear');
    expect(r.sceneClear).toBe('CLEAR');
    expect(r.gained).toBe(true);               // no-hit level
    expect(r.hpAfter).toBe(r.hp0 + 1);         // +1 heart bonus (can exceed 3)
    expect(r.level).toBe(2);
    expect(r.scene).toBe('INTRO');
  });

  test('taking a hit forfeits the no-hit bonus (neg. control)', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('normal');
      const st = window.BS.state(); st.hero.ghost = 0; st.hero.hurt = 0; st.hitThisLevel = false; st.hp = 3;
      window.BS.heroHurt(true);                // take a hit this level
      const hpAfterHit = st.hp;
      st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);
      for (let k = 0; k < 3; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      return { gained: st.gainedLife, hp: st.hp, hpAfterHit };
    });
    expect(r.hpAfterHit).toBeCloseTo(2.75, 5); // hit chipped a heart
    expect(r.gained).toBe(false);              // and forfeited the bonus
    expect(r.hp).toBeCloseTo(2.75, 5);         // no +1 heart awarded
  });

  test('E2E: losing all health ends in GAME OVER', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); const st = window.BS.state(); st.hp = 3;
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

  test('E2E: beating the level-4 boss ends in VICTORY', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.BS.freeze(true));
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('normal'); const st = window.BS.state(); st.level = 4; window.BS.setLevel(4); st.hero.ghost = 1e9;
      st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);
      const need = window.BS.boss().maxHits;      // L4 Normal boss has 6 HP
      for (let k = 0; k < need; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      const clear = st.scene;              // CLEAR first
      window.BS.tapAdvance();              // → VICTORY (past level 4)
      return { clear, scene: st.scene };
    });
    expect(r.clear).toBe('CLEAR');
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
      window.BS.gotoPlay(); st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);
      const boss = window.BS.musicKey();                              // boss emergence swaps to boss music
      return { title, lvl, boss };
    });
    expect(r.title).toBe('title');
    expect(r.lvl).toBe(1);
    expect(r.boss).toBe('boss');
  });
});
