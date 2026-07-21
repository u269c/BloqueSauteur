# BloqueSauteur

A retro **8-bit side-scrolling platformer** that runs as one self-contained HTML file in
any modern browser — built for phones and iPads, playable with touch or keyboard.

**Run left→right** through each themed level — hop holes, ride one-way jump-through
platforms, dodge spiked eyeball-monsters that patrol the way — and at the end the screen
locks into a **boss arena** where you duel the level boss (later bosses summon
reinforcements from spawn boxes). Earn points, spend them at the parachuting **merchant**
between levels, and fight through **five** worlds to the volcano finale.

> **v2.0** is a big shift: levels used to be a single 60-second survival screen; now they
> **scroll**. (The scrolling foundation ships first; climbing ropes/stairs, the exotic
> per-world hazards, moving platforms and multi-tier verticality are landing in follow-ups.)

![concept](design/concept-art/IMG_0048.jpeg)

## Play

Just open **`bloquesauteur.html`** in a browser — no build step, no server, no assets, no
network. On a phone/tablet, drop it on your home screen for a full-screen experience.

- **Keyboard:** `←` / `→` move, `↑` (hold for height) jump, `↓` skill (see below),
  `P` pause, `M` mute.
- **Touch:** on-screen ◀ ▶ pad + ▲ jump (hold to jump higher); a shield button appears
  when you own the shield. Landscape is recommended; portrait shows a rotate hint.
- Movement buttons are hidden on desktop (keyboard only).

Pick a **save slot** (1 of 3), a **mode**, your **hero colour**, and (once bought) a
**costume**, then hit PLAY.

## Rules

- **Get to the end.** Each level scrolls left→right for ~several screens. A **progress bar**
  (top-centre) tracks how far you are; reach the end and the camera locks into the **boss
  arena**.
- **Death is the hazard.** Monster hits knock you back and chip health (see modes) but the
  only way to *lose a heart* is to fall into the hazard — off an edge or through a hole
  (lava, poison, water, a long drop…). Run out of hearts → game over. Respawn is **ghostly**
  (monsters pass through) for 2s, landing on solid ground. In **Easy**, a fall costs only
  **½ heart**.
- **Platforms:** jump the holes, or hop the **one-way platforms** (you pass up *through*
  them and land on top). Enemies **patrol** the level — **stomp** from above to kill;
  run into one and you get shoved (toward a hole!).
- **Combos:** stay airborne and chain kills between bounces — the k-th kill in a chain is
  worth more, so **2 kills = 4 points, 3 = 9, …** up to a **10×** tier. Landing resets it.
- **Boss arena:** at the level's end you duel the boss (it enrages near death). Levels 3–5
  add **spawn boxes** that pour reinforcements into the fight. Beat the boss to clear.
- **Points:** +1 per stomp, **+5 per boss**; combos multiply. Points are **per game** —
  spent at the merchant and reset when you start/quit a game. **Purchases persist** in your
  save slot (except hearts, which are re-buyable each game).
- Cleared a level in **Easy/Normal**? You gain a **heart** (the gauge grows, animated).

## Modes (title screen)

| | monster hit | fall | boss HP (L1→L5) | spawns | extras |
|---|---|---|---|---|---|
| **Easy** | harmless | −½ heart | 3·3·3·3·12 | ×1.0 | gain a heart each level |
| **Normal** | −¼ heart | −1 heart | 3·4·5·6·12 | ×1.2 | gain a heart each level |
| **RAGE** | −½ heart, −1 point | −1 heart | 6·8·10·12·12 | ×1.5 | **+1 arena spawn box**, no level heart |

Arena **spawn boxes** by level: 0 · 0 · 1 · 1 · 2 (L4/L5 boxes run 1.3× faster); RAGE adds
one more side.

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
- **Costumes** (55–200) — **13** patterns to collect: striped, polka dots, plus signs,
  oblique lines, tic-tac-toe, camo, bullseye, spirals, checkers, dot grid, diagonal camo,
  target spiral, confetti. Owned costumes persist per slot; **equip one from the title
  loadout** (a picker sits beside the colour swatches).

## Worlds & levels

Five scrolling levels of rising difficulty — more holes, more platforms and (soon) more
hazards each level. Levels 1–4 are re-skinned **randomly each game** (seeded) from a pool of
themed worlds — volcano rock, city rooftops, poison swamp, a climbing wall, wine corks, a
rope bridge over crocodiles, cloud-tops, a dollhouse mansion, a beach — under one of six
animated skies (sunset, sunrise, clear blue, thunderstorm, deep space with a drifting JWST,
windy gloom). **Level 5 is always the Volcano** under a thunderstorm, with a two-life boss
that revives full, enraged and faster, and **screams to freeze you**.

Both the scrolling level and its boss arena are seeded — append `?seed=N` (and optionally
`?theme=world,sky`) to replay/share an exact layout:

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
