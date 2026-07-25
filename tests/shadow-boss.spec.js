// @ts-check
// PR-F: Level 6 is the finale — reaching the maze exit locks into the shadow arena where
// the EVIL-HERO doppelgänger boss awaits (36 HP; teleport + charge + leap + scream +
// reinforcements). Clearing it wins the game.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

// Drop straight into the shadow boss arena (bypassing the maze) in a frozen PLAY state.
async function enterShadowArena(page, mode = 'normal') {
  await openGame(page, { seed: 5 });
  await enterPlayPanel(page, 0);
  await page.evaluate((m) => {
    const st = window.BS.state();
    window.BS.freeze(true); st.level = 6; window.BS.setMode(m);
    st.hp = 8; st.owned.heart = false;
    window.BS.enterArena();                 // genArena(6) + activateBoss('shadow')
    st.scene = 'PLAY'; st.paused = false; window.BS.Input.reset();
  }, mode);
}

test.describe('L6 finale — config wiring', () => {
  test('L6 is the last level: shadow boss, 36 HP across all modes, its own arena', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => ({
      last: window.BS.LAST_LEVEL,
      boss: window.BS.LEVELS[6].boss,
      hits: ['easy', 'normal', 'rage'].map((m) => window.BS.MODES[m].bossHits[6]),
    }));
    expect(r.last).toBe(6);
    expect(r.boss).toBe('shadow');
    expect(r.hits).toEqual([36, 36, 36]);
  });
});

test.describe('L6 finale — the evil-hero shadow boss', () => {
  test('spawns as a one-life, 36-HP, scream-capable shadow boss', async ({ page }) => {
    await enterShadowArena(page, 'normal');
    const b = await page.evaluate(() => { const b = window.BS.boss(); return { type: b.type, maxHits: b.maxHits, lives: b.lives, canScream: b.canScream }; });
    expect(b.type).toBe('shadow');
    expect(b.maxHits).toBe(36);
    expect(b.lives).toBe(1);         // one life — 36 HP is the wall
    expect(b.canScream).toBe(true);
  });

  test('the teleport attack: it vanishes (untouchable), then reappears beside the hero to strike', async ({ page }) => {
    await enterShadowArena(page, 'normal');
    const r = await page.evaluate(() => {
      const b = window.BS.boss(), h = window.BS.hero();
      Object.assign(h, { x: 130, vx: 0 });
      b.state = 'teleport'; b.stateT = 0.55; b.tpGone = false; b.iframe = 0;
      const hits0 = b.hits;
      let sawGone = false, blockedWhileGone = false, prevGone = false, relocatedNearHero = false, endState = '';
      for (let i = 0; i < 90; i++) {
        window.BS.step(1 / 120);
        if (b.tpGone) { sawGone = true; b.iframe = 0; window.BS.bossHit(); if (b.hits === hits0) blockedWhileGone = true; }   // hit is ignored mid-teleport
        if (prevGone && !b.tpGone) { relocatedNearHero = Math.abs(b.x - h.x) < 60; endState = b.state; }
        prevGone = b.tpGone;
      }
      return { sawGone, blockedWhileGone, relocatedNearHero, endState };
    });
    expect(r.sawGone).toBe(true);            // it disappears mid-teleport
    expect(r.blockedWhileGone).toBe(true);   // untouchable while gone
    expect(r.relocatedNearHero).toBe(true);  // reappears right by the hero
    expect(r.endState).toBe('charge');       // then strikes
  });

  test('it has the full kit: teleport + charge + leap + scream reachable from idle', async ({ page }) => {
    await enterShadowArena(page, 'normal');
    const r = await page.evaluate(() => {
      const b = window.BS.boss(), h = window.BS.hero();
      Object.assign(h, { x: 240 });
      const seen = new Set();
      let leapt = false, prevY = b.y;
      for (let i = 0; i < 4000; i++) {
        window.BS.step(1 / 120);
        seen.add(b.state);
        if (!window.BS.boss()) break;
        if (b.state === 'charge' && b.y < prevY - 8 && !b.onGround) leapt = true;   // rose off the floor mid-charge
        prevY = b.y;
      }
      return { states: [...seen], leapt };
    });
    // reinforcements come from the arena spawn boxes (ARENA[6].boxes = 2) — covered elsewhere
    expect(r.states).toEqual(expect.arrayContaining(['teleport', 'charge', 'shriek', 'scream']));
    expect(r.leapt).toBe(true);
  });

  test('36 stomps kill it and clear the level (one life, no revive)', async ({ page }) => {
    await enterShadowArena(page, 'normal');
    const r = await page.evaluate(() => {
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const b = window.BS.boss(); if (!b) break;
        b.iframe = 0; b.tpGone = false; window.BS.bossHit(); n++;
      }
      return { n, dead: !window.BS.boss(), scene: window.BS.scene() };
    });
    expect(r.n).toBe(36);              // exactly 36 hits
    expect(r.dead).toBe(true);
    expect(r.scene).toBe('CLEAR');     // onBossDefeated fired
  });
});

test.describe('L6 finale — flow', () => {
  test('reaching the maze exit locks into the shadow boss arena', async ({ page }) => {
    await openGame(page, { seed: 8 });
    await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      window.BS.freeze(true); window.BS.startGame(window.BS.MAZE_LEVEL); window.BS.gotoPlay(); window.BS.Input.reset();
      const mz = window.BS.terrain(), h = window.BS.hero();
      Object.assign(h, { x: mz.exit.x, y: mz.exit.y, vx: 0, vy: 0 });
      window.BS.step(1 / 120);
      const b = window.BS.boss();
      return { phase: window.BS.phase(), bossType: b && b.type };
    });
    expect(r.phase).toBe('boss');
    expect(r.bossType).toBe('shadow');
  });

  test('clearing L6 leads to VICTORY (after the final merchant)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    const won = await page.evaluate(() => {
      window.BS.freeze(true);
      const st = window.BS.state(); st.level = 6; window.BS.setMode('normal');
      window.BS.gotoShop();     // final merchant
      window.BS.closeShop();    // leave → merchant blasts off → afterShop
      for (let i = 0; i < 1200; i++) { window.BS.step(1 / 120); if (window.BS.scene() === 'VICTORY') return true; }
      return false;
    });
    expect(won).toBe(true);
  });
});
