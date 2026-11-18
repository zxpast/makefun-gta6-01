[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solano Heat — a 3D open-world crime game

Sun-soaked 3D open-world crime — chase-cam driving, helicopter pursuits, roadblocks, radio and garage upgrades. Built from scratch for make.fun's gta6-01 bounty in Three.js (vendored under `game/vendor/three/`). Everything is original: the sun-soaked city of **Port Solano**, its people, cars, crews and story are invented here — nothing from Rockstar or any other commercial game.

## The story

Lucia Vane came back to Port Solano broke, with a borrowed jacket and a debt she did not make. The city runs on favours: the Docks crew moves what the harbour will not admit, the North Hills families pay for silence, and the Sunset Pier dealers never sleep. Eight chapters take Lucia from her first stolen car to **The Night Job** — one package, a helicopter overhead, roadblocks on every fast road, and a clock that does not stop.

## The city

Port Solano is a 960 by 640 metre open world: six districts (North Hills, Downtown, Eastside, Sunset Pier, Marina, the Docks), a road grid full of traffic, sidewalks full of pedestrians, parked cars worth stealing, and police who answer to your wanted level. Day turns to dusk as you play; the neon comes on over the Pier and the Docks, and the helicopter's spotlight sweeps the streets at four stars and up.

## What you can do

- **Explore on foot and by car** — walk, run, steal any parked car (E), drive with real acceleration, braking and steering, NOS boost (Shift, once bought), and lose the cops or outrun them.
- **Eight story missions** — a first car theft, a courier run, a gang pickup, a getaway, a turf takeover, the timed **Midnight Run** (Docks to North Hills in 90 seconds), the stealth **Silent Pickup** (bring the handoff home with zero wanted stars — arrive hot and the deal is off), and the finale **The Night Job** (150 seconds, helicopter overhead, roadblocks ahead).
- **Side jobs** — taxi fares, courier drops, vigilante takedowns and repo runs (steal a car, deliver it to the Eastside Garage, $500).
- **Wanted system** — 0 to 5 stars. Steal, hit or shoot and the heat rises; police cars chase, ram and bust you. At 4–5 stars a police helicopter joins with a spotlight and roadblocks go up on the roads ahead. Break line of sight for six seconds and the cops lose your trail; lay low and the stars fade.
- **Combat** — fists on foot (Space), and three guns (F): pistol, SMG and shotgun, with drive-by shooting from the car. Buy ammo at the garage.
- **Radio** — three WebAudio stations (R to change): SOL FM, NEON NIGHTS, PIER TALK. All music is synthesised live; there are no audio files.
- **Garage** — at the Eastside Garage (G when you are there): armor (+60 max health, $800), engine tune (+6 m/s, $1,200), NOS kit ($600, refill $100), and weapon ammo.
- **HUD and minimap** — cash, wanted stars, game clock, district name, mission objective, a countdown on timed jobs, a clean/spotted line on quiet ones, speed, NOS, weapon, radio, and a live minimap with roads, markers, police and the helicopter.
- **Save** — progress, cash, garage and completed missions persist in the browser. An autopilot (`?auto=1`) plays the game itself as a demo.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move on foot, drive the car |
| Shift | Run on foot / NOS boost in a car |
| E | Enter / exit the nearest car |
| Space | Punch (on foot) |
| F | Shoot (pistol / SMG / shotgun) |
| Q | Switch weapon |
| R | Change radio station |
| G | Garage (at the Eastside Garage) |
| M | Missions and side jobs |
| 1–4 | Take a side job / buy in the garage |
| 5–6 | Buy SMG / shotgun ammo in the garage |
| P / Esc | Pause |
| N | Sound on / off |

## Playing

Serve `game/` with any static server — `node serve.ts` then open http://localhost:8080 — and play in desktop Chrome. No network request is made; every file the game loads sits under `game/`.

Screenshots are renders of the game's own code: the browser stages each scene with `?shot=chase|heli|roadblock|finale` (seed 7), and `shots/render-shots.mjs` paints the same staged states with the same chase camera in Node. Nothing is edited, composited or borrowed.

## Structure

- `game/index.html` — the page, import map for Three.js, HUD panels
- `game/src/main.js` — boot, the fixed-step loop, screens, autopilot demo
- `game/src/config.js` — every tuning number, colour and district
- `game/src/city.js` — the road grid, districts, buildings, markers, road graph
- `game/src/sim.js` — the rules: driving, collisions, police, helicopter, roadblocks, wanted, weapons, garage
- `game/src/missions.js` — the eight chapters and the four side jobs
- `game/src/camera3d.js` — chase camera and projection, shared by browser and screenshots
- `game/src/world3d.js` — Three.js rendering: instanced city, cars, helicopter, marker
- `game/src/hud.js` — DOM HUD and live minimap
- `game/src/input.js` — keyboard and pointer
- `game/src/audio.js` — synthesised sound: engine, sirens, gunshots, three radio stations
- `game/src/autopilot.js` — the driver that plays missions by the same rules
- `game/src/shots.js` — the four screenshot scenes
- `game/src/random.js` — the seeded random number generator
- `game/src/save.js` — localStorage saves
- `shots/render-shots.mjs` — the Node screenshot painter (same scenes, same camera)
- `test/sim-test.mjs` — Node tests: autopilot missions, 60-second drive, determinism
- `main.ts` — the hand-in program (Node 22, standard library only)

## License

MIT — see `LICENSE`.
