// @ts-check
// R3-PR4: merchant appears after a level; shop buy/greying/persistence; leaving.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

// Reach the SHOP scene with a chosen point balance (frozen sim).
async function toShop(page, points) {
  await page.evaluate((points) => {
    window.BS.freeze(true); window.BS.start(); window.BS.setMode('normal');
    const st = window.BS.state(); st.hero.ghost = 1e9;
    window.BS.enterArena();           // boss
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
  // three tabs; the grid shows one tab at a time (starts on SKILLS)
  await expect(page.locator('#shop-tabs .shop-tab')).toHaveCount(3);
  const skills = await page.evaluate(() => window.BS.SHOP_ITEMS.filter((i) => i.tab === 'skills').length);
  await expect(page.locator('#shop-grid .shop-item')).toHaveCount(skills);
  // switch to COSTUMES → shows every sold costume
  await page.locator('#shop-tabs .shop-tab').nth(2).click();
  const costumes = await page.evaluate(() => window.BS.COSTUMES.filter((c) => c.price < 900).length);
  await expect(page.locator('#shop-grid .shop-item')).toHaveCount(costumes);
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

test('healing tab: Full Heal refills, Regen Potion ticks +¼ heart/5s next level', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 300);
  // Full Heal instantly refills current hearts
  const heal = await page.evaluate(() => {
    const st = window.BS.state(); st.heartsBought = 4; st.hp = 1;
    window.BS.buyItem('fullHeal');
    return { hp: st.hp, max: window.BS.CONFIG.LIVES_START + st.heartsBought + (st.levelHearts | 0) };
  });
  expect(heal.hp).toBe(heal.max);      // topped right up
  // Regen ticks during PLAY (safe flat arena; hero pinned + invincible so only regen moves hp)
  const regen = await page.evaluate(() => {
    window.BS.state().points = 999; window.BS.buyItem('regen');
    window.BS.start(); window.BS.setupArena(1);
    const st = window.BS.state(), C = window.BS.CONFIG, h = window.BS.hero(); st.hp = 2; st.regen = true; st.regenT = 0;
    for (let k = 0; k < 6 * 120; k++) { Object.assign(h, { x: 200, y: C.PLAT_Y, vx: 0, vy: 0, onGround: true, ghost: 1e9, dead: false }); window.BS.stepFixed(1); }
    return st.hp;
  });
  expect(regen).toBeCloseTo(2.25, 5);    // exactly one +¼ tick at 5s
});

test('health items refresh once per level; costumes shown in a 4-wide grid', async ({ page }) => {
  await openGame(page); await enterPlayPanel(page, 0);
  await toShop(page, 400);
  const r = await page.evaluate(() => {
    window.BS.buyItem('heart');                       // buy a heart → owned + banked
    const boughtOwned = window.BS.state().owned.heart, banked = window.BS.state().heartsBought;
    window.BS.gotoShop();                              // arrive at the NEXT level's shop
    const refreshed = window.BS.state().owned.heart, kept = window.BS.state().heartsBought;
    return { boughtOwned, banked, refreshed, kept };
  });
  expect(r.boughtOwned).toBe(true);      // greyed out this visit
  expect(r.refreshed).toBe(false);       // buyable again next level
  expect(r.kept).toBe(r.banked);         // …but the max-hearts bonus is kept
  // costumes tab uses the 4-wide grid
  await page.evaluate(() => { window.BS.gotoShop(); window.BS.buildShop(); });
  await page.locator('#shop-tabs .shop-tab').nth(2).click();
  await expect(page.locator('#shop-grid')).toHaveClass(/wide/);
});
