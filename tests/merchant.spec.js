// @ts-check
// R3-PR4: merchant appears after a level; shop buy/greying/persistence; leaving.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

// Reach the SHOP scene with a chosen point balance (frozen sim).
async function toShop(page, points) {
  await page.evaluate((points) => {
    window.BS.freeze(true); window.BS.start(); window.BS.setMode('normal');
    const st = window.BS.state(); st.hero.ghost = 1e9;
    st.t = window.BS.CONFIG.LEVEL_TIME + 0.01; window.BS.stepFixed(1);           // boss
    const need = window.BS.boss().maxHits; for (let k = 0; k < need; k++) { window.BS.boss().iframe = 0; window.BS.bossHit(); }
    window.BS.tapAdvance();                                                      // CLEAR → SHOP
    // land the merchant so the shop overlay opens (y past the land threshold)
    const m = window.BS.merchant(); m.state = 'descend'; m.y = window.BS.CONFIG.PLAT_Y + 2;
    window.BS.stepFixed(2);
    st.points = points; window.BS.buildShop();                                  // set balance after the boss bonus
  }, points);
}

test('merchant appears after the boss and opens the shop', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 40);
  expect(await page.evaluate(() => window.BS.scene())).toBe('SHOP');
  expect(await page.evaluate(() => !!window.BS.merchant())).toBe(true);
  await expect(page.locator('#shop')).toBeVisible();
  const expected = await page.evaluate(() => window.BS.SHOP_ITEMS.length + window.BS.COSTUMES.length);
  await expect(page.locator('#shop-grid .shop-item')).toHaveCount(expected);   // skills/hearts + costumes
});

test('buying deducts points, marks owned, greys out, and persists', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 200);
  const shield = page.locator('.shop-item[data-key="shield"]');
  await shield.click();                                    // 100 pts
  const r = await page.evaluate(() => ({ points: window.BS.state().points, owned: window.BS.state().owned.shield, saved: window.BS.Save.slot(0).owned.shield }));
  expect(r.points).toBe(100);         // 200 − 100
  expect(r.owned).toBe(true);
  expect(r.saved).toBe(true);          // persisted to the slot (shield is a purchase)
  await expect(shield).toHaveClass(/owned/);
  // clicking again does nothing (already owned)
  await shield.click({ force: true });
  expect(await page.evaluate(() => window.BS.state().points)).toBe(100);
});

test('cannot afford → greyed and unbuyable (neg. control vs affordable)', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 15);                                   // < shield(20)
  const shield = page.locator('.shop-item[data-key="shield"]');
  await expect(shield).toHaveClass(/poor/);
  await shield.click({ force: true });
  expect(await page.evaluate(() => window.BS.state().owned.shield)).toBe(false);
  // costume (120) also unaffordable; heart(30) too — but with 15 nothing is buyable
  expect(await page.evaluate(() => window.BS.SHOP_ITEMS.every((i) => window.BS.state().points < i.price))).toBe(true);
});

test('a heart purchase raises max hearts by one', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 100);
  const r = await page.evaluate(() => {
    const before = window.BS.state().heartsBought;
    window.BS.buyItem('heart');
    return { before, after: window.BS.state().heartsBought, owned: window.BS.state().owned.heart };
  });
  expect(r.after).toBe(r.before + 1);
  expect(r.owned).toBe(true);
});

test('leaving the shop sends the merchant away and advances to the next level', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 40);
  await page.locator('#shop-leave').click();
  await expect(page.locator('#shop')).toBeHidden();
  await page.evaluate(() => { const st = window.BS.state(); for (let k = 0; k < 200 && st.scene === 'SHOP'; k++) window.BS.stepFixed(1); });
  const r = await page.evaluate(() => ({ scene: window.BS.scene(), level: window.BS.state().level, merchant: window.BS.merchant() }));
  expect(r.merchant).toBeNull();       // merchant departed
  expect(r.level).toBe(2);
  expect(r.scene).toBe('INTRO');
});
