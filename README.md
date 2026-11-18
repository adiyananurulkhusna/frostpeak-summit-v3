[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/gta6-01)
[![GTA 6 Bounty](https://img.shields.io/badge/bounty-GTA%206-ff6b6b)](https://make.fun/bounty/gta6-01)
[![AI Agents](https://img.shields.io/badge/built%20by-AI%20agents-9b59b6)](https://make.fun/bounty/gta6-01)

# Frostpeak Drift

A top-down 2D open-world crime game set in **Frostpeak**, a snowy ski town where
the roads are ice, the lake is frozen solid, and the police never sleep. You are
**Raka**, a snowplow driver who clears the main street by day — and takes on
riskier jobs after dark.

Built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).

## The game

- **Open snowy city** — grid streets, a winding mountain road, a frozen lake you
  can drift across, pine forests, houses with snow-capped roofs, and a ski lodge.
- **Drive on ice** — cars slide and drift when you turn hard; asphalt grips,
  deep snow drags, and the frozen lake barely holds you at all.
- **Steal cars** — five vehicle types (snowplow, sedan, hatchback, van, truck,
  plus the vault truck) parked around town or in traffic. Taking one in front
  of the police raises your wanted level.
- **Wanted level 0–5** — patrol cars chase and ram you, foot police chase you
  down and try to grab you. Get caught: BUSTED. Lose all health: WASTED.
- **Six story missions** — plow the main street, deliver hot soup against the
  clock, ram a thief's car three times, rescue a stranded skier, run a midnight
  delivery to the summit cabin, and steal the vault truck in a final getaway.
- **Combat** — punch up close, or pick up the pistol and shoot (limited ammo).
- **Traffic and pedestrians** — cars cruise the streets, people wander the
  sidewalks and flee from gunfire.
- **HUD with minimap** — health, money, wanted stars, clock, objective,
  dialogs, notifications, and title / pause / busted / wasted / ending screens.
- **Save** — progress autosaves to localStorage; continue from the title screen.
- **Sound** — everything synthesized live with WebAudio: engine hum, sirens,
  wind, gunshots, and a quiet ambient pad. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| E | Enter / exit a car (steal it if occupied) |
| F | Punch |
| Click / J | Shoot (when you have the pistol) |
| H | Horn |
| P | Pause |
| M | Mute |
| L (title) | Continue from save |

## How to run

No build step, no network. Serve the `game/` folder with any static server and
open `index.html` in desktop Chrome:

```bash
cd game
python3 -m http.server 8080
# open http://localhost:8080
```

Or simply open `game/index.html` from a local static server of your choice.

## Project layout

- `game/index.html` — the page; loads the game as ES modules.
- `game/src/main.js` — game loop, input, camera, wanted level, saving.
- `game/src/world.js` — the city map: roads, buildings, pines, frozen lake.
- `game/src/vehicles.js` — drift physics, traffic AI, police pursuit.
- `game/src/people.js` — pedestrians, foot police, combat, pickups.
- `game/src/missions.js` — the six story missions.
- `game/src/audio.js` — synthesized WebAudio sound.
- `game/src/hud.js` — HUD, minimap, dialogs and menu screens.
- `screenshots/` — four real renders of the game running in Chrome.
- `main.ts` — the entry program: copies `game/` and `screenshots/` and writes
  `dossier.json` with `vendor/makefun-game.ts`.

## Credits

Original game by **adiyananurulkhusna** (2026). All art, names, story, and sound
are original — nothing is taken from any commercial game. MIT licensed.

---

Built for the make.fun GTA 6 bounty — play more at [make.fun](https://make.fun/bounty/gta6-01).
Referral code: `0sc1f0wn`
