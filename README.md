[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solano Heat — an open-world crime game

A complete open-world crime game in the spirit of GTA 6, built from scratch
for make.fun's gta6-01 bounty. Everything is original: the city of **Port
Solano**, its people, cars, gangs and story are invented here — nothing from
Rockstar or any other commercial game.

## The story

Lucia Vega, ex-mechanic, comes home to Port Solano with $250 and a grudge:
the **Salt Kings** gang chopped her garage. Take the city back, one job at a
time — steal wheels, move packages, outrun the police, settle the score at
their warehouse, and finish with the big one: Solano Bank.

## How to play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open
http://localhost:8080). No build step, no network — the game is plain static
files, and all sound is synthesized live with WebAudio.

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk / drive |
| Mouse + click | Aim / shoot |
| E | Steal a car / exit a car |
| Shift | Sprint |
| F | Punch |
| 1–4 | Fists / Pistol / SMG / Shotgun |
| M | Start the next mission (or a side job) |
| H | Help |
| P / Esc | Pause |

## Features

- **Open city** — Port Solano: 7 districts, a boardwalk and beach, the Marina,
  the Docks, Downtown, North Hills and Eastside, with a day/night cycle.
- **On foot and by car** — arcade driving with steering, braking, crashes and
  smoke; steal any traffic car (the police notice).
- **Traffic and pedestrians** — 26 cars follow the roads and turn at
  intersections; 42 pedestrians wander the sidewalks and flee gunfire.
- **Wanted level and police** — 0–5 stars. Police cars chase and ram you, foot
  officers open fire at 3+ stars. Hide and the stars fade one by one.
- **Missions and a story** — 7 story chapters (First Wheels, The Pickup,
  Getaway, Payback, The Big Score, Midnight Run, Silent Pickup) plus taxi,
  courier, vigilante and repo side jobs. Midnight Run is a timed delivery —
  75 seconds from the Docks to North Hills, with a countdown bar on the HUD
  and a retry if the clock beats you. Silent Pickup is stealth: reach Sunset
  Pier and bring the handoff home with no wanted stars, or the deal is off.
  Repo Run is a two-part side job: steal a car, then deliver it to the
  Eastside garage.
- **Combat** — 4 weapons, car explosions, rival gang shootouts.
- **HUD with minimap** — cash, health/armour, wanted stars, clock, district,
  weapon/ammo, speed, objective tracker and a live minimap with police blips
  and the mission marker. The wanted stars, clock and district sit on a dark
  panel so they stay readable against bright sky or sand; a delivery countdown
  bar appears on timed jobs, a green/red stealth line on quiet ones, a red
  frame flashes when the heat rises, and a gold banner pays out when a mission
  completes. A one-line tutorial greets first-time players on load.
- **Start screen and save** — title screen over the living city, pause menu,
  and automatic saves to localStorage (money, missions, position, stats).
- **Polish** — synthesized engine hum, sirens, gunshots and jingles; screen
  shake; particles; mission banners; district names as you drive.

## Screenshots

`shots.json` stages four real scenes from the game's own simulation:

1. `1-start.jpg` — the title screen over the living city.
2. `2-drive.jpg` — cruising Downtown at sunset with a wanted star.
3. `3-chase.jpg` — a three-star police chase on the Boardwalk at night.
4. `4-mission.jpg` — the timed delivery, mission 6: Midnight Run, racing
   north to North Hills with the countdown bar on the HUD.

## Structure

- `game/src/config.js` — tuning numbers and tables
- `game/src/random.js` — seeded random numbers
- `game/src/input.js` — keyboard/mouse + scripted input for screenshots
- `game/src/audio.js` — synthesized WebAudio sounds
- `game/src/city.js` — city generation and collision
- `game/src/entities.js` — traffic, pedestrians, police AI
- `game/src/player.js` — Lucia on foot, driving, weapons, wanted level
- `game/src/missions.js` — the 7-chapter story (timed-delivery and stealth
  steps included) and side jobs, incl. the two-part Repo Run
- `game/src/world.js` — the simulation: rules, bullets, pickups, police
- `game/src/render.js` — drawing: city, cars, HUD, minimap, screens
- `game/src/save.js` — localStorage save/load
- `game/src/shots.js` — the four screenshot scenes
- `game/src/main.js` — boot, game loop, screens

## Badges

![Solano Heat](https://img.shields.io/badge/game-Solano%20Heat-orange)
![Open world](https://img.shields.io/badge/world-Port%20Solano-blue)
![No build step](https://img.shields.io/badge/build-none-green)
![Offline](https://img.shields.io/badge/network-none-green)

## License

MIT — see LICENSE.
