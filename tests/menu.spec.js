// @ts-check
// R3-PR3: 3 save slots (persist/load/delete/independent), mode descriptions,
// points carry across a run.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

test.describe('PR3 · save slots', () => {
  test('persistent progress (purchases + best) persists across reload; re-selecting restores it', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.evaluate(() => { const st = window.BS.state(); st.best = 3; st.owned.shield = true; window.BS.Save.save(); });
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    await expect(page.locator('#slots .slot-card').first()).toContainText('LV3');
    await expect(page.locator('#slots .slot-card').first().locator('.acq canvas')).toHaveCount(1);   // shield icon shown
    await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => ({ shield: window.BS.state().owned.shield, best: window.BS.state().best }));
    expect(r).toEqual({ shield: true, best: 3 });
  });

  test('the three slots hold independent purchases', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.evaluate(() => { window.BS.state().owned.shield = true; window.BS.Save.save(); });
    await enterPlayPanel(page, 1);
    await page.evaluate(() => { window.BS.state().owned.dodge = true; window.BS.Save.save(); });
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    const r = await page.evaluate(() => [window.BS.Save.slot(0).owned, window.BS.Save.slot(1).owned, window.BS.Save.slot(2)].map((o) => o && { shield: !!o.shield, dodge: !!o.dodge }));
    expect(r[0]).toEqual({ shield: true, dodge: false });
    expect(r[1]).toEqual({ shield: false, dodge: true });
    expect(r[2]).toBeNull();   // untouched slot stays empty
  });

  test('deleting a slot needs confirmation: first click arms, second clears it', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.evaluate(() => { window.BS.state().owned.shield = true; window.BS.Save.save(); });
    expect(await page.evaluate(() => !!window.BS.Save.slot(0))).toBe(true);
    const del = page.locator('#slots .slot-card').first().locator('.slot-del');
    await del.click();                                       // first click only arms
    await expect(del).toHaveClass(/confirm/);
    await expect(del).toHaveText('Delete?');
    expect(await page.evaluate(() => !!window.BS.Save.slot(0))).toBe(true);   // neg. control: NOT deleted yet
    await del.click();                                       // second click confirms
    expect(await page.evaluate(() => window.BS.Save.slot(0))).toBeNull();
    await expect(page.locator('#slots .slot-card').first()).toContainText('Empty');
  });
});

test.describe('PR3 · mode selection', () => {
  test('clicking a mode highlights it and updates the active mode', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.locator('.mode-btn.easy').click();
    await expect(page.locator('.mode-btn.easy')).toHaveClass(/sel/);
    expect(await page.evaluate(() => window.BS.mode())).toBe('easy');
    await page.locator('.mode-btn.rage').click();
    await expect(page.locator('.mode-btn.rage')).toHaveClass(/sel/);
    await expect(page.locator('.mode-btn.easy')).not.toHaveClass(/sel/);   // neg. control: switched
    expect(await page.evaluate(() => window.BS.mode())).toBe('rage');
  });
});

test.describe('v1.1 · points are per-game; purchases persist', () => {
  test('starting a run resets points to 0 (they do not carry between games)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      window.BS.state().points = 30;
      window.BS.startGame();          // real run entry
      return window.BS.state().points;
    });
    expect(r).toBe(0);    // per-game reset
  });

  test('purchased skills persist across games, but hearts are re-buyable', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      const st = window.BS.state();
      st.owned.shield = true; st.owned.heart = true; st.heartsBought = 1; window.BS.Save.save();
      window.BS.startGame();          // new game
      return { shield: st.owned.shield, heart: st.owned.heart, heartsBought: st.heartsBought };
    });
    expect(r.shield).toBe(true);        // purchase persists
    expect(r.heart).toBe(false);        // heart re-buyable (reset)
    expect(r.heartsBought).toBe(0);
  });
});
