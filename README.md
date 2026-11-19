[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zxpast/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solano Heat

A Grand Theft Auto VI–inspired open-city chase game for the make.fun GTA6-01 bounty.

Lucia Vane is broke in Solano City. Steal a car, run eight chapters of jobs — courier
drops, gang pickups, getaways, turf takeovers, a midnight run, a silent pickup, and the
finale **The Night Job** — while the wanted level climbs, the helicopter circles, and
roadblocks go up on the roads ahead. Four side jobs (taxi, courier, vigilante, repo),
a garage for armor, engine and NOS upgrades, three weapons, and a three-station radio
round out the city.

## Play

- **W A S D / arrows** — drive or walk
- **Shift** — sprint on foot
- **Space** — NOS boost in the car
- **E** — steal a car / enter, **X** — step out of the car
- **F** — shoot from the car, **P** — punch on foot
- **Q** — cycle weapon, **R** — next radio station
- **M** — retry a failed mission
- **L** — save, **K** — load (saves the sim and the finished chapters; a corrupt
  save is ignored and the game starts fresh)
- **1 / 2 / 3** — buy armor / engine / NOS at the garage

## Run it

```sh
node serve.ts        # http://localhost:8080/game/
node test/sim-test.mjs
node main.ts         # builds dossier.json
```

## Tech

Three.js r187 (vendored under `game/vendor/three/`) renders the city; the rules run in
`game/src/sim.js`, a deterministic 60 Hz engine shared by the game, the autopilot, and
the screenshot painter, so a screenshot shows exactly the frame the game renders.
Screenshots are painted in Node from the same sim state and chase camera — never
fabricated.
