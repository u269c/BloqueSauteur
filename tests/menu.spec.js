// @ts-check
// R3-PR3: 3 save slots (persist/load/delete/independent), mode descriptions,
// points carry across a run.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

test.describe('PR3 · save slots', () => {
  test('slot progress persists across reload; re-selecting restores it', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.evaluate(() => { const st = window.BS.state(); st.points = 50; st.best = 3; window.BS.Save.save(); });
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    // slot card summary reflects saved progress
    await expect(page.locator('#slots .slot-card').first()).toContainText('50 pts');
    await expect(page.locator('#slots .slot-card').first()).toContainText('LV3');
    await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => ({ points: window.BS.state().points, best: window.BS.state().best }));
    expect(r).toEqual({ points: 50, best: 3 });
  });

  test('the three slots hold independent data', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.evaluate(() => { window.BS.state().points = 10; window.BS.Save.save(); });
    await page.locator('#slot-back').click();
    await enterPlayPanel(page, 1);
    await page.evaluate(() => { window.BS.state().points = 99; window.BS.Save.save(); });
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    const r = await page.evaluate(() => [window.BS.Save.slot(0).points, window.BS.Save.slot(1).points, window.BS.Save.slot(2)]);
    expect(r[0]).toBe(10);
    expect(r[1]).toBe(99);
    expect(r[2]).toBeNull();   // untouched slot stays empty
  });

  test('deleting a slot clears it', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.evaluate(() => { window.BS.state().points = 7; window.BS.Save.save(); });
    await page.locator('#slot-back').click();
    expect(await page.evaluate(() => !!window.BS.Save.slot(0))).toBe(true);
    await page.locator('#slots .slot-card').first().locator('.slot-del').click();
    expect(await page.evaluate(() => window.BS.Save.slot(0))).toBeNull();
    await expect(page.locator('#slots .slot-card').first()).toContainText('Empty');
  });
});

test.describe('PR3 · mode descriptions', () => {
  test('selecting a mode updates the description line', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.locator('.mode-btn.easy').click();
    await expect(page.locator('#mode-desc')).toContainText('harmless');
    await page.locator('.mode-btn.rage').click();
    await expect(page.locator('#mode-desc')).toContainText('TWO spawn');
    await expect(page.locator('#mode-desc')).not.toContainText('harmless');   // neg. control: updated
  });
});

test.describe('PR3 · points carry across a run', () => {
  test('starting a run keeps the slot balance (does not reset to 0)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    const r = await page.evaluate(() => {
      window.BS.state().points = 30; window.BS.Save.save();
      window.BS.startGame();          // real run entry
      return window.BS.state().points;
    });
    expect(r).toBe(30);   // carried, not wiped
  });
});
