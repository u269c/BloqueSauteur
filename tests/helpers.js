// @ts-check
const path = require('path');

const GAME_PATH = path.resolve(__dirname, '..', 'bloquesauteur.html');

/** file:// URL for the game, optional ?seed= and other query params. */
function gameUrl(params = {}) {
  const u = new URL('file://' + GAME_PATH);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

/** Navigate to the game and wait until the window.BS test hook is ready. */
async function openGame(page, params = {}) {
  await page.goto(gameUrl(params));
  await page.waitForFunction(() => !!window.BS);
  return page;
}

/** From the title, pick a save slot to reveal the play panel (mode/colour/PLAY). */
async function enterPlayPanel(page, slot = 0) {
  await page.locator('#slots .slot-card').nth(slot).click();
  await page.waitForSelector('#play-panel:not(.hidden)');
}

module.exports = { GAME_PATH, gameUrl, openGame, enterPlayPanel };
