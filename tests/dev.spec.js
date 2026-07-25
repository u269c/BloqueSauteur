// @ts-check
// PR-0: DEV mode — a discreet title-screen panel to toggle every skill/costume and
// jump straight into any level. Fast-iteration test harness for building Level 6.
const { test, expect } = require('@playwright/test');
const { openGame, enterPlayPanel } = require('./helpers');

test.describe('dev mode', () => {
  test('the gear opens the dev panel; it is closed by default (neg. control)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    // NEGATIVE CONTROL: panel starts hidden.
    await expect(page.locator('#dev')).toHaveClass(/hidden/);
    await page.locator('#dev-btn').click();
    await expect(page.locator('#dev')).not.toHaveClass(/hidden/);
    await expect(page.locator('#dev-skills .dev-chip')).toHaveCount(5);   // 5 persistent skills
    await page.locator('#dev-close').click();
    await expect(page.locator('#dev')).toHaveClass(/hidden/);
  });

  test('the dev gear is hidden during play (lives inside the title overlay)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await expect(page.locator('#dev-btn')).toBeVisible();
    await page.evaluate(() => window.BS.startGame(1));
    await expect(page.locator('#dev-btn')).toBeHidden();   // #start is display:none in-game → its fixed child hides too
  });

  test('a skill chip toggles ownership on and back off (neg. control), and persists', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.locator('#dev-btn').click();
    const chip = page.locator('#dev-skills .dev-chip[data-skill="strongHit"]');
    // NEGATIVE CONTROL: not owned until toggled.
    expect(await page.evaluate(() => window.BS.state().owned.strongHit)).toBe(false);
    await expect(chip).not.toHaveClass(/on/);
    await chip.click();
    expect(await page.evaluate(() => window.BS.state().owned.strongHit)).toBe(true);
    await expect(chip).toHaveClass(/on/);
    // persisted to the slot
    expect(await page.evaluate(() => !!window.BS.Save.slot(0).owned.strongHit)).toBe(true);
    // toggle back off
    await chip.click();
    expect(await page.evaluate(() => window.BS.state().owned.strongHit)).toBe(false);
  });

  test('ALL owns every costume; a single costume chip toggles one off (neg. control)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.locator('#dev-btn').click();
    const total = await page.evaluate(() => window.BS.COSTUMES.length);
    // NEGATIVE CONTROL: fresh slot owns nothing.
    expect(await page.evaluate(() => window.BS.state().owned.costumes.length)).toBe(0);
    await page.locator('#dev-costumes .dev-chip[data-costume="all"]').click();
    expect(await page.evaluate(() => window.BS.state().owned.costumes.length)).toBe(total);
    // toggling one specific costume removes just that one
    await page.locator('#dev-costumes .dev-chip[data-costume="2"]').click();
    const owned = await page.evaluate(() => window.BS.state().owned.costumes.slice());
    expect(owned).not.toContain(2);
    expect(owned.length).toBe(total - 1);
  });

  test('a level chip starts a fresh game directly at that level (neg. control: L1)', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    // give some points so we can prove the per-game reset happens on jump
    await page.evaluate(() => { window.BS.state().points = 999; });
    await page.locator('#dev-btn').click();
    await page.locator('#dev-levels .dev-chip[data-level="3"]').click();
    const at3 = await page.evaluate(() => ({ level: window.BS.state().level, scene: window.BS.scene(), points: window.BS.state().points }));
    expect(at3.level).toBe(3);
    expect(at3.scene).toBe('INTRO');
    expect(at3.points).toBe(0);   // fresh game
    // NEGATIVE CONTROL: L1 chip lands on level 1, not 3
    await page.evaluate(() => window.BS.gotoTitle());
    await page.locator('#dev-btn').click();
    await page.locator('#dev-levels .dev-chip[data-level="1"]').click();
    expect(await page.evaluate(() => window.BS.state().level)).toBe(1);
  });

  test('the dev loadout carries into the jumped game', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.locator('#dev-btn').click();
    await page.locator('#dev-skills .dev-chip[data-skill="shield"]').click();
    await page.locator('#dev-skills .dev-chip[data-skill="doubleJump"]').click();
    await page.locator('#dev-levels .dev-chip[data-level="2"]').click();
    const r = await page.evaluate(() => ({ level: window.BS.state().level, shield: window.BS.state().owned.shield, dj: window.BS.state().owned.doubleJump }));
    expect(r).toEqual({ level: 2, shield: true, dj: true });
  });

  test('level chips cover exactly levels 1..LAST_LEVEL', async ({ page }) => {
    await openGame(page);
    await enterPlayPanel(page, 0);
    await page.locator('#dev-btn').click();
    const n = await page.evaluate(() => window.BS.LAST_LEVEL);
    await expect(page.locator('#dev-levels .dev-chip')).toHaveCount(n);
  });
});
