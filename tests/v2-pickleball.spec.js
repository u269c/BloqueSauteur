// @ts-check
// v1.7 · The Challenger — L4 pickleball minigame: NPC challenge, spiral transition,
// match play, and the escalating rewards.
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.BS.freeze(true));
});

test('the challenger exists on L4 only, ~1/3 through the level', async ({ page }) => {
  const r = await page.evaluate(() => {
    const at = (lv) => { window.BS.start(); window.BS.reseed(1); window.BS.setLevel(lv); const c = window.BS.challenger(); return c ? c.x / window.BS.levelData().exitX : null; };
    return { l3: at(3), l4: at(4), l5: at(5) };
  });
  expect(r.l3).toBeNull();
  expect(r.l5).toBeNull();
  expect(r.l4).toBeGreaterThan(0.2);   // roughly the first third
  expect(r.l4).toBeLessThan(0.5);
});

test('approaching the challenger pops the prompt; "Oui" spirals into the pickleball match', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(4);
    const ch = window.BS.challenger(); window.BS.hero().x = ch.x; window.BS.hero().onGround = true;
    window.BS.stepFixed(1);
    const paused = window.BS.state().paused, promptShown = !document.getElementById('challenge').classList.contains('hidden');
    document.getElementById('challenge-yes').click();
    const spiralling = !!window.BS.transition();
    for (let k = 0; k < 300 && window.BS.scene() !== 'PICKLE'; k++) window.BS.step(1 / 60);
    return { paused, promptShown, spiralling, scene: window.BS.scene(), hasMatch: !!window.BS.pickle() };
  });
  expect(r.paused).toBe(true);
  expect(r.promptShown).toBe(true);
  expect(r.spiralling).toBe(true);    // the spiral transition started
  expect(r.scene).toBe('PICKLE');     // …and landed us in the match
  expect(r.hasMatch).toBe(true);
});

test('a match runs (ball rallies) and always ends within the point cap', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(4); window.BS.setupPickle();
    let ended = false, bx0 = window.BS.pickle().ball.x, moved = false;
    for (let k = 0; k < 60 * 60; k++) {   // up to 60s
      const p = window.BS.pickle(); if (!p) break;
      window.BS.Input.left = window.BS.Input.right = false;
      if (p.ball.x < 240) { if (p.ball.x > p.hero.x + 2) window.BS.Input.right = true; else if (p.ball.x < p.hero.x - 2) window.BS.Input.left = true; }
      window.BS.step(1 / 60);
      if (p.ball.x !== bx0) moved = true;
      if (p.state === 'over') { ended = true; break; }
    }
    const p = window.BS.pickle();
    return { moved, ended, max: Math.max(p.scoreH, p.scoreA) };
  });
  expect(r.moved).toBe(true);    // the ball actually rallies
  expect(r.ended).toBe(true);    // the match terminates (win-by-2 with a hard cap)
  expect(r.max).toBeLessThanOrEqual(7);
});

test('rewards escalate: win1 → paddle, win2 → bandana, win3+ → +50; a loss → −25', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(4);
    const st = window.BS.state();
    window.BS.setupPickle(); st.pickleWins = 0; window.BS.endPickle(true); const paddle = st.owned.paddle;
    window.BS.setupPickle(); st.pickleWins = 1; window.BS.endPickle(true); const bandana = window.BS.costumes().includes(17) && window.BS.costumeIdx() === 17;
    window.BS.setupPickle(); st.pickleWins = 2; st.points = 0; window.BS.endPickle(true); const win3 = st.points;
    window.BS.setupPickle(); st.points = 100; window.BS.endPickle(false); const loss = st.points;
    return { paddle, bandana, win3, loss };
  });
  expect(r.paddle).toBe(true);   // 1st win → paddle in hand
  expect(r.bandana).toBe(true);  // 2nd win → bandana costume (owned + equipped)
  expect(r.win3).toBe(50);       // 3rd+ win → +50 points
  expect(r.loss).toBe(75);       // a loss → −25 points
});

test('declining ("No Thanks") skips the match and marks the challenger done', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.BS.start(); window.BS.reseed(1); window.BS.setLevel(4);
    const ch = window.BS.challenger(); window.BS.hero().x = ch.x; window.BS.hero().onGround = true;
    window.BS.stepFixed(1);
    document.getElementById('challenge-no').click();
    return { done: window.BS.challenger().done, paused: window.BS.state().paused, scene: window.BS.scene() };
  });
  expect(r.done).toBe(true);       // won't nag again
  expect(r.paused).toBe(false);    // back to playing
  expect(r.scene).toBe('PLAY');
});
