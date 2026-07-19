# BloqueSauteur

A retro **8-bit single-screen platformer** that runs as one self-contained HTML file in
any modern browser — built for phones and iPads, playable with touch or keyboard.

Survive each level for 60 seconds while spiked eyeball-monsters pour out of the
spawner(s), then stomp the level **boss**. Earn points, spend them at the parachuting
**merchant** between levels, and fight through **five** themed worlds to the volcano finale.

![concept](design/concept-art/IMG_0048.jpeg)

## Play

Just open **`bloquesauteur.html`** in a browser — no build step, no server, no assets, no
network. On a phone/tablet, drop it on your home screen for a full-screen experience.

- **Keyboard:** `←` / `→` move, `↑` (hold for height) jump, `↓` skill (see below),
  `P` pause, `M` mute.
- **Touch:** on-screen ◀ ▶ pad + ▲ jump (hold to jump higher); a shield button appears
  when you own the shield. Landscape is recommended; portrait shows a rotate hint.
- Movement buttons are hidden on desktop (keyboard only).

Pick a **save slot** (1 of 3), a **mode**, and your **hero colour**, then hit PLAY.

## Rules

- **Death is the hazard.** Monster hits knock you back and chip health (see modes) but the
  only way to *lose a heart* is to fall into the hazard — off an edge or through a hole
  (lava, poison, wine, water, a crocodile river, or a long drop, depending on the world).
  Run out of hearts → game over. Respawn is **ghostly** (monsters pass through) for 2s,
  now landing on the safest wide platform.
- **Stomp** a monster from above to kill it; run into one and you get shoved (toward a
  hazard!).
- **Combos:** stay airborne and chain kills between bounces — the k-th kill in a chain is
  worth more, so **2 kills = 4 points, 3 = 9, …** up to a **10×** tier. Landing resets it.
- **Boss** emerges at 60s: stomp it (it enrages near death). Beat it to clear the level.
- **Points:** +1 per stomp, **+5 per boss**; combos multiply. Points are **per game** —
  spent at the merchant and reset when you start/quit a game. **Purchases persist** in your
  save slot (except hearts, which are re-buyable each game).
- Cleared a level in **Easy/Normal**? You gain a **heart** (the gauge grows, animated).

## Modes (title screen)

| | monster hit | boss HP (L1→L5) | spawns | extras |
|---|---|---|---|---|
| **Easy** | harmless | 3·3·3·3·12 | ×1.0 | gain a heart each level |
| **Normal** | −¼ heart | 3·4·5·6·12 | ×1.2 | gain a heart each level |
| **RAGE** | −½ heart, −1 point | 6·8·10·12·12 | ×1.5 | **two spawn boxes**, no level heart |

Health is fractional hearts drawn as **pie wedges** (start with 3). Normal/RAGE play
faster, more frenetic music.

Each screen has its own long, looping **chiptune track** — a full multi-voice arrangement
(bass + lead + synthesised kick/snare/hats), one per genre: French-touch title, EDM,
jazz-fusion, French-house, a dark REZZ-style groove, hard techno, a Charlotte-de-Witte boss
theme, and a "Ghosts 'n' Stuff"-flavoured merchant loop. Normal/RAGE speed the tempo up.

## The merchant & skills

After every level a merchant parachutes in and opens a shop (spend your points; buy each
item once). Items:

- **Spiked Shield** (100) — `↓` on the ground arms a shield; the next attacker dies. 10s cooldown.
- **Double Jump** (125) — a second mid-air jump.
- **Dodge** (125) — hold `←`+`→` to spin, untouchable and un-fallable, up to 5s.
- **Strong Hit** (130) — `↓` in the air dives hard: **2× boss damage**, and a floor blast
  that clears nearby monsters.
- **Half / One / Two Hearts** (40 / 75 / 110) — raise your max hearts **this game**.
- **Striped Suit** (150) — a dapper costume.

## Worlds & levels

Five levels of rising difficulty. Levels 1–4 are re-skinned **randomly each game** (seeded)
from a pool of themed worlds — volcano rock, city rooftops, poison swamp, a climbing wall,
wine corks, a rope bridge over crocodiles, cloud-tops, a dollhouse mansion, a beach — under
one of six animated skies (sunset, sunrise, clear blue, thunderstorm, deep space with a
drifting JWST, windy gloom). **Level 5 is always the Volcano** under a thunderstorm, with a
two-life boss that revives full, enraged and faster, and **screams to freeze you**.

Terrain is seeded — append `?seed=N` (and optionally `?theme=world,sky`) to replay/share an
exact layout:

```
bloquesauteur.html?seed=12345
bloquesauteur.html?theme=ropeBridge,thunder
```

Progress (purchases, unlocks, best level, colour, mode) is saved per slot in your browser.

## Development

Everything lives in `bloquesauteur.html` (banded sections: RNG · CONFIG · TERRAIN · STATE ·
INPUT · AUDIO · FLOW · physics · ENEMIES · BOSS · RENDER · HUD · LOOP). The audio engine is
ported and extended from the reference in `design/concept-art/`.

Tests use Playwright, driving the real file. Pure game logic is exposed on a `window.BS`
hook and stepped deterministically (`BS.freeze` + `BS.stepFixed`) so physics is testable;
device profiles exercise real touch on iPhone/iPad viewports. Every test pairs a positive
check with a negative control.

```sh
npm install          # installs @playwright/test (browsers are cached)
npm test             # full suite: logic + flow (desktop) + device touch (iphone/ipad)
npx playwright test --project=desktop    # just the logic/flow suite
```
