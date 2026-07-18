// @ts-check
// R2-B · difficulty modes: damage per mode, boss HP scaling, RAGE two-sided
// spawners + no perfect bonus. Physics frozen; driven by BS.stepFixed.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test.describe('R2-B · hit damage per mode', () => {
  test('EASY harmless, NORMAL −1/4 heart, RAGE −1/2 heart', async ({ page }) => {
    const dmg = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.setMode(mode);
      const st = window.BS.state(); st.hp = 3; const h = window.BS.hero();
      Object.assign(h, { ghost: 0, hurt: 0, dead: false });
      const landed = window.BS.heroHurt(true);
      return { landed, hp: st.hp };
    }, mode);
    const easy = await dmg('easy'), normal = await dmg('normal'), rage = await dmg('rage');
    expect(easy.landed).toBe(false);            // EASY: contact does nothing
    expect(easy.hp).toBe(3);
    expect(normal.hp).toBeCloseTo(2.75, 5);     // −1/4
    expect(rage.hp).toBeCloseTo(2.5, 5);        // −1/2
  });

  test('EASY: enemy side-contact never chips health (neg. control vs NORMAL)', async ({ page }) => {
    const hpAfterContact = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(1); window.BS.setMode(mode);
      const st = window.BS.state(); st.hp = 3; st.enemies.length = 0; st.bossActive = true;
      const C = window.BS.CONFIG, h = window.BS.hero();
      Object.assign(h, { x: 240, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost: 0, hurt: 0, dead: false });
      window.BS.spawnEnemy('clear');
      Object.assign(window.BS.enemies()[0], { x: 246, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true });
      window.BS.stepFixed(1);
      return st.hp;
    }, mode);
    expect(await hpAfterContact('easy')).toBe(3);          // harmless
    expect(await hpAfterContact('normal')).toBeCloseTo(2.75, 5);   // negative control
  });
});

test.describe('R2-B · boss HP scales with mode & level', () => {
  test('NORMAL 3/4/5/6, RAGE 6/8/10/12, EASY 3/3/3/3', async ({ page }) => {
    const hp = async (mode, level) => page.evaluate(({ mode, level }) => {
      window.BS.start(); window.BS.setMode(mode); const st = window.BS.state();
      st.level = level; window.BS.setLevel(level); window.BS.activateBoss();
      return window.BS.boss().maxHits;
    }, { mode, level });
    expect([await hp('normal', 1), await hp('normal', 2), await hp('normal', 3), await hp('normal', 4)]).toEqual([3, 4, 5, 6]);
    expect([await hp('rage', 1), await hp('rage', 2), await hp('rage', 3), await hp('rage', 4)]).toEqual([6, 8, 10, 12]);
    expect([await hp('easy', 1), await hp('easy', 4)]).toEqual([3, 3]);
  });

  test('boss enrages in the last third regardless of max HP', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.setMode('rage'); const st = window.BS.state();
      st.level = 4; window.BS.setLevel(4); window.BS.activateBoss();
      const b = window.BS.boss();                 // maxHits 12 → enrage at 8
      const marks = [];
      for (let k = 1; k <= 12; k++) { b.iframe = 0; window.BS.bossHit(); const cur = window.BS.boss(); marks.push(cur ? cur.hits >= Math.ceil(cur.maxHits * 2 / 3) : true); }
      return { enrageAt: marks.indexOf(true) + 1 };
    });
    expect(r.enrageAt).toBe(8);   // 12 HP → enraged from the 8th hit
  });
});

test.describe('R2-B · RAGE mode specials', () => {
  test('two spawn boxes: enemies come from BOTH sides (neg. control: NORMAL only right)', async ({ page }) => {
    const sides = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.reseed(3); window.BS.setLevel(2); window.BS.setMode(mode);
      const st = window.BS.state(); st.hero.ghost = 1e9; st.enemies.length = 0;
      const seen = new Set();
      for (let i = 0; i < 40 * 120; i++) { window.BS.stepFixed(1); for (const e of window.BS.enemies()) seen.add(e.side); }
      return [...seen].sort();
    }, mode);
    expect(await sides('rage')).toEqual(['left', 'right']);   // both boxes active
    expect(await sides('normal')).toEqual(['right']);         // negative control
  });

  test('left-box enemies march right (mirror of right box)', async ({ page }) => {
    const r = await page.evaluate(() => {
      window.BS.start(); window.BS.reseed(1); window.BS.setLevel(2); window.BS.setMode('rage');
      const st = window.BS.state(); st.hero.ghost = 1e9; st.enemies.length = 0; st.bossActive = true;
      window.BS.spawnEnemy('clear', 'left');
      const e = window.BS.enemies()[0]; const x0 = e.x;
      window.BS.stepFixed(30);
      return { dir: e.dir, movedRight: window.BS.enemies()[0] ? window.BS.enemies()[0].x > x0 : false, spawnedLeft: x0 < window.BS.CONFIG.W / 2 };
    });
    expect(r.dir).toBe(1);
    expect(r.spawnedLeft).toBe(true);    // appeared on the left
    expect(r.movedRight).toBe(true);     // marches rightward
  });

  test('no no-hit bonus in RAGE (neg. control vs NORMAL)', async ({ page }) => {
    const bonus = async (mode) => page.evaluate((mode) => {
      window.BS.start(); window.BS.setMode(mode);
      const st = window.BS.state(); st.hero.ghost = 1e9; st.hitThisLevel = false; const hp0 = st.hp;
      st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);
      const need = window.BS.boss().maxHits;
      for (let k = 0; k < need; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
      return { gained: st.gainedLife, delta: st.hp - hp0 };
    }, mode);
    const rage = await bonus('rage'), normal = await bonus('normal');
    expect(rage.gained).toBe(false); expect(rage.delta).toBe(0);   // RAGE: no bonus
    expect(normal.gained).toBe(true); expect(normal.delta).toBe(1); // negative control
  });
});

test.describe('R2-B · frenetic music', () => {
  test('level music plays faster in NORMAL and RAGE than EASY (effective rate)', async ({ page }) => {
    const rate = async (mode) => page.evaluate((mode) => {
      window.BS.gotoTitle();               // reset music so a mode change restarts the track
      window.BS.setMode(mode);
      window.BS.startGame();               // title → intro starts level-1 music
      return { key: window.BS.musicKey(), rate: window.BS.musicRate() };
    }, mode);
    const easy = await rate('easy'), normal = await rate('normal'), rage = await rate('rage');
    expect(easy.key).toBe(1);              // level-1 gameplay track
    expect(easy.rate).toBe(1.0);
    expect(normal.rate).toBeGreaterThan(1.0);
    expect(rage.rate).toBeGreaterThan(normal.rate);
  });
});
