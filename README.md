[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solano Heat — an open-world crime game

A complete open-world crime game in the spirit of GTA 6, built from scratch for
make.fun's gta6-01 bounty. Everything is original: the sun-soaked city of **Port
Solano**, its people, cars, crews and story are invented here — nothing from
Rockstar or any other commercial game.

## The story

Lucia Vane came back to Port Solano broke, with a borrowed jacket and a debt she
did not make. The city runs on favours: the Docks crew moves what the harbour
will not admit, the North Hills families pay for silence, and the Sunset Pier
dealers never sleep. Seven chapters take Lucia from her first stolen car to the
job that decides who owns the night — if she can stay clean long enough to pull
it off.

## The city

Port Solano is a 3.2 km by 2.4 km open world: six districts (Downtown, the
Docks, North Hills, Eastside, Sunset Pier and the Marina), a road grid full of
traffic, sidewalks full of pedestrians, parked cars worth stealing, and police
who answer to your wanted level. Day turns to dusk as you play; the neon comes
on over the Pier and the Docks.

## What you can do

- **Explore on foot and by car** — walk, run, steal any parked car (E), drive
  with real acceleration, braking and steering, and lose the cops or outrun
  them.
- **Seven story missions** — a first car theft, a courier run, a gang pickup,
  a getaway, a turf takeover, the timed **Midnight Run** (Docks to North Hills
  in 75 seconds) and the stealth **Silent Pickup** (bring the handoff home with
  zero wanted stars — arrive hot and the deal is off).
- **Side jobs** — taxi fares, courier drops, vigilante takedowns and repo runs
  (steal a car, deliver it to the Eastside garage, $500).
- **Wanted system** — 0 to 5 stars. Steal, hit or fight and the heat rises;
  police cars chase, ram and bust you. Lay low and the stars fade.
- **Combat** — fists on foot (Space), and your car is a weapon if you drive it
  like one.
- **HUD and minimap** — cash, wanted stars, game clock, district name, mission
  objective, a countdown bar on timed jobs, a clean/spotted line on quiet
  ones, and a live minimap with roads, markers, traffic and police.
- **Save** — progress, cash and completed missions persist in the browser.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move on foot, drive the car |
| Shift | Run (on foot) |
| E | Enter / exit the nearest car |
| Space | Punch (on foot) |
| M | Missions and side jobs |
| P / Esc | Pause |
| N | Sound on / off |

## Playing

Serve `game/` with any static server — `node serve.ts` then open
http://localhost:8080 — and play in desktop Chrome. No network request is
made; every file the game loads sits under `game/`.

## Structure

- `game/index.html` — the page, canvas and status line
- `game/src/main.js` — boot, the fixed-step loop, screens and screenshot scenes
- `game/src/config.js` — every tuning number, colour and district
- `game/src/city.js` — the road grid, districts, buildings and markers
- `game/src/entities.js` — cars, pedestrians and police
- `game/src/missions.js` — the seven chapters and the four side jobs
- `game/src/world.js` — the rules: movement, collisions, wanted, time
- `game/src/render.js` — drawing: city, camera, HUD, minimap, effects
- `game/src/input.js` — keyboard and pointer
- `game/src/random.js` — the seeded random number generator
- `game/src/audio.js` — synthesised sound (engine, sirens, jingles)
- `game/src/save.js` — localStorage saves
- `game/src/shots.js` — the four screenshot scenes
- `main.ts` — the hand-in program (Node 22, standard library only)

## License

MIT — see `LICENSE`.
