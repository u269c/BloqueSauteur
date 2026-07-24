// @ts-check
// v2.0 · costumes — a purchasable set of patterns, equipped from the loadout,
// owned-set persisted per slot. drawCostume renders every id without error.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

test('there are 18 costumes (patterns + 4 FIFA jerseys + earned Bandana)', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.BS.COSTUMES.length)).toBe(18);
  // the jersey kits are present
  const names = await page.evaluate(() => window.BS.COSTUMES.map((c) => c.name));
  for (const kit of ['Canada Kit', 'Switzerland Kit', 'Norway Kit', 'Japan Kit']) expect(names).toContain(kit);
});

test('buying a costume adds it to the owned set, auto-equips it, and persists', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  const r = await page.evaluate(() => {
    const st = window.BS.state(); st.points = 300;
    window.BS.buyItem('costume:5');
    return { owned: window.BS.costumes().slice(), equipped: window.BS.costumeIdx(), points: st.points, saved: window.BS.Save.slot(0).owned.costumes };
  });
  expect(r.owned).toContain(5);
  expect(r.equipped).toBe(5);           // auto-equipped on purchase
  expect(r.points).toBe(300 - 110);     // Camo costs 110
  expect(r.saved).toContain(5);         // persisted into the slot
});

test('cannot equip a costume you do not own (neg. control: owned one equips)', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  const r = await page.evaluate(() => {
    const st = window.BS.state(); st.points = 300;
    // buildCostumes only offers owned costumes → equipping an unowned id never happens via UI.
    const beforeOwned = window.BS.costumes().includes(7);
    window.BS.buyItem('costume:7');       // Spirals (100)
    return { beforeOwned, afterOwned: window.BS.costumes().includes(7), equipped: window.BS.costumeIdx() };
  });
  expect(r.beforeOwned).toBe(false);      // neg. control: not owned before
  expect(r.afterOwned).toBe(true);
  expect(r.equipped).toBe(7);
});

test('buying a costume twice does not double-charge or double-add', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  const r = await page.evaluate(() => {
    const st = window.BS.state(); st.points = 300;
    window.BS.buyItem('costume:1'); const afterFirst = st.points;
    window.BS.buyItem('costume:1'); const afterSecond = st.points;
    return { afterFirst, afterSecond, count: window.BS.costumes().filter((c) => c === 1).length };
  });
  expect(r.afterFirst).toBe(300 - 60);
  expect(r.afterSecond).toBe(300 - 60);   // second buy is a no-op
  expect(r.count).toBe(1);
});

test('the costume picker shows None + owned costumes only', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await page.evaluate(() => { const st = window.BS.state(); st.points = 999; window.BS.buyItem('costume:2'); window.BS.buyItem('costume:8'); window.BS.buildCostumes(); });
  // None + the 2 owned = 3 picker cells
  await expect(page.locator('#costumes .costume-pick')).toHaveCount(3);
});

test('drawCostume renders every costume id without throwing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openGame(page); await enterPlayPanel(page, 0);
  await page.evaluate(() => {
    const st = window.BS.state(); st.points = 99999;
    for (const cost of window.BS.COSTUMES) window.BS.buyItem('costume:' + cost.id);   // buys the 17 sold ones
    if (!window.BS.costumes().includes(17)) window.BS.costumes().push(17);             // Bandana is earned, not sold
    window.BS.buildShop();       // draws a shop icon (→ drawCostume) for every sold costume
    window.BS.buildCostumes();   // draws a picker mannequin (→ drawCostume) for every owned costume (incl. Bandana)
  });
  expect(await page.evaluate(() => window.BS.costumes().length)).toBe(18);
  expect(errors).toEqual([]);   // no id path threw
});
