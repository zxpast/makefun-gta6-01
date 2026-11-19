# Solano Heat

An open-world crime game in the spirit of GTA 6, built for make.fun
competition gta6-01. You are Rook, a getaway driver in the original city of
Solano Bay: sixteen named districts, traffic, pedestrians, a five-star wanted
system with police cars, roadblocks and a helicopter, twelve story missions
over seven days, and a respect currency that persists between sessions.

## Play

Open `game/index.html` in desktop Chrome, served by any static server
(`python3 -m http.server` from `game/` works). No network, no build step:
every file the game loads sits under `game/`.

| Key | Action |
|---|---|
| W A S D | Drive / walk |
| Space | Handbrake / drift |
| Shift | NOS boost |
| F | Get in / out of the car |
| E | Interact — shop, safehouse, steal a car on foot |
| Click | Shoot (drive-by / on foot) |
| Q / R | Next radio station / radio on-off |
| 1 / 2 / 3 | Pistol / SMG / shotgun |
| M | Mission list |
| Esc | Pause |

## Systems

- **Twelve missions, saw-tooth pacing** — each job teaches one system gently,
  peaks, then the next job breathes. Day 7 is The Night Job: five stars, a
  helicopter, roadblocks, one run to the Marina safehouse.
- **Respect** — the persistent meta currency. Missions, near-misses, drifts
  and takedowns earn it; it buys permanent garage upgrades and weapons, and
  it survives between sessions (localStorage save).
- **Sixteen named districts** — labelled on the minimap, on the HUD, and on
  floating plates above the city.
- **Shops and safehouses** — Ironworks Arms, Pit Stop Garage, Doc's Clinic;
  two safehouses to save, heal and bank respect.
- **Garage upgrades** — engine, armor, NOS and tires, three levels each.
- **Radio** — three synth stations over WebAudio, engine hum, sirens.
- **Juice** — screen shake, hit-stop, spark particles, floating respect text.
- **Wanted** — five stars, line-of-sight decay, busts, roadblocks at four
  stars, helicopter at four stars.

## Entry

`main.ts` copies `game/` and `screenshots/` into the output directory and
writes `dossier.json` with the kit's vendored `buildDossier`:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are real captures of the game running in a desktop browser,
played with the keyboard — never staged or painted.
