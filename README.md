# BloqueSauteur

A retro **8-bit single-screen platformer** that runs as one self-contained HTML file in
any modern browser — built for phones and iPads, playable with touch or keyboard.

Survive the tower for 60 seconds while spiked eyeball-monsters march out of the spawner
and try to shove you into the bubbling lava, then stomp the level **boss**. Clear four
levels of escalating difficulty to win.

![concept](design/concept-art/IMG_0048.jpeg)

## Play

Just open **`bloquesauteur.html`** in a browser — no build step, no server, no assets, no
network. On a phone/tablet, drop it on your home screen for a full-screen experience.

- **Keyboard:** `←` / `→` move, `↑` (hold for height) jump, `P` pause, `M` mute.
- **Touch:** on-screen ◀ ▶ pad (bottom-left) and ▲ jump (bottom-right); hold jump longer
  to jump higher. Landscape is recommended; portrait works with a rotate hint.

## Rules

- **Death is lava.** Enemy hits only knock you back (toward the left lava!) with a brief
  flicker of invulnerability — you lose a life only by falling into the lava, off an edge
  or through a hole. 3 lives to start; respawn ghostly (enemies pass through) for 2s.
- **Jump on top** of a monster to stomp it; run into one and you get shoved.
- **Boss** appears at 60s: stomp it 3 times (it enrages after 2). Beat it to advance.
- **No-hit bonus:** clear a whole level — boss included — without taking a hit and gain a
  life (you can go above 3).
- **Levels 1–4** add enemy types (transparent → +red faster → +yellow jumpers → faster
  everything) and terrain (flat → hills+holes → split mini-platforms → inferno). The boss
  matches: slow charge → fast charge → charge+jump → rainbow feinting.
- **Colour picker** on the title screen recolours your hero (cosmetic). **Rainbow**
  unlocks once you reach level 4. Your choice is saved locally.

## Levels are seeded

Terrain is generated from a seed (random each game). Append `?seed=N` to the URL to replay
an exact layout — handy for sharing a run or reproducing a bug:

```
bloquesauteur.html?seed=12345
```

## Development

Everything lives in `bloquesauteur.html` (banded sections: RNG · CONFIG · TERRAIN · STATE ·
INPUT · AUDIO · FLOW · physics · ENEMIES · BOSS · RENDER · HUD · LOOP). The audio engine is
ported and extended from the reference in `design/concept-art/`.

Tests use Playwright, driving the real file. Pure game logic is exposed on a `window.BS`
hook and stepped deterministically (`BS.freeze` + `BS.stepFixed`) so physics is testable;
device profiles exercise real touch on iPhone/iPad viewports.

```sh
npm install          # installs @playwright/test (browsers are cached)
npm test             # full suite: logic + flow (desktop) + device touch (iphone/ipad)
npx playwright test --project=desktop    # just the logic/flow suite
```
