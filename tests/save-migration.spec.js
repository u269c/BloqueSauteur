// @ts-check
// Rebrand: the save key moved from 'bloquesauteur.save' → 'blocsauteur.save'. Save.load()
// migrates a legacy save the first time so existing progress is not lost, then re-writes
// under the new key. (This spec also exercises the renamed blocsauteur.html end-to-end.)
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.describe('rebrand · save migration', () => {
  test('a save under the old key is migrated, then re-saved under the new key', async ({ page }) => {
    await openGame(page);
    const v = await page.evaluate(() => window.BS.Save.data.v);   // current SAVE_VERSION
    // seed a legacy save under the OLD key; clear the NEW key
    await page.evaluate((v) => {
      localStorage.removeItem('blocsauteur.save');
      const slot = { owned: { shield: true, costumes: [1] }, costumeIdx: 1, pickleWins: 0, rainbowUnlocked: true, colorIdx: 2, mode: 'rage', best: 7 };
      localStorage.setItem('bloquesauteur.save', JSON.stringify({ v, activeSlot: null, slots: [slot, null, null], muted: true }));
    }, v);
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    const r = await page.evaluate(() => {
      const s0 = window.BS.Save.slot(0);
      return { best: s0 && s0.best, shield: !!(s0 && s0.owned && s0.owned.shield), muted: window.BS.muted() };
    });
    expect(r.best).toBe(7);        // legacy progress carried over
    expect(r.shield).toBe(true);
    expect(r.muted).toBe(true);
    // a save now writes under the NEW key
    await page.evaluate(() => window.BS.Save.save());
    expect(await page.evaluate(() => localStorage.getItem('blocsauteur.save') !== null)).toBe(true);
  });

  test('no save under either key → fresh defaults, not the migrated data (neg. control)', async ({ page }) => {
    // Boot auto-selects slot 0, so it is never null. The control proves the best:7 / shield
    // in the test above came from the OLD-key migration, not from defaults: with neither key
    // set, slot 0 is a fresh slot (best 0, no shield) and slots 1–2 stay empty.
    await openGame(page);
    await page.evaluate(() => { localStorage.removeItem('bloquesauteur.save'); localStorage.removeItem('blocsauteur.save'); });
    await page.reload(); await page.waitForFunction(() => !!window.BS);
    const r = await page.evaluate(() => {
      const s0 = window.BS.Save.slot(0);
      return { best: s0 && s0.best, shield: !!(s0 && s0.owned && s0.owned.shield), rest: [1, 2].every((i) => window.BS.Save.slot(i) === null) };
    });
    expect(r.best).toBe(0);
    expect(r.shield).toBe(false);
    expect(r.rest).toBe(true);
  });
});
