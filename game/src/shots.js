// The screenshot scenes behind ?shot=chase|heli|roadblock|finale (and the
// title scene behind ?shot=start). Each one plays the real rules forward
// from a fresh simulation for a fixed number of steps, steered by the
// autopilot — steal a car, drive the road graph toward a waypoint — so the
// frame is what a short game really looks like and the same seed always
// gives the same frame. The browser loop and the Node screenshot painter
// both stage through here, so a screenshot and the game on screen agree.
import { STEP } from './config.js';
import { MARKERS } from './city.js';
import { createDriver, driveFor, stealNearestCar } from './autopilot.js';

export const SHOT_NAMES = ['chase', 'heli', 'roadblock', 'finale', 'start'];

export function stageShot(name, sim) {
  sim.state.demo = false;
  sim.reset();
  if (name === 'heli') {
    // Night, five stars: the helicopter is overhead with its spotlight,
    // police cars behind, neon on over the Pier.
    sim.state.clock = 0.93;
    stealNearestCar(sim, 20);
    sim.state.wanted = 5;
    sim.state.flash = 0;
    driveFor(sim, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.z, 9);
    tidyShot(sim, 5);
    frameHeli(sim);
    return 'play';
  }
  if (name === 'roadblock') {
    // Dusk, four stars: roadblocks are up on the roads ahead and the car
    // is about to meet them.
    sim.state.clock = 0.78;
    stealNearestCar(sim, 20);
    sim.state.wanted = 4;
    sim.state.flash = 0;
    driveFor(sim, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.z, 7);
    tidyShot(sim, 4);
    // The drive just passed the roadblocks the sim spawned at the start,
    // so they are behind the car now. Clear them and let the sim spawn a
    // fresh set ahead of the car, where the camera can see them.
    sim.state.roadblocks = [];
    sim.step(STEP, { move: { x: 0, z: 0 }, running: false, actions: 0, nos: false });
    tidyShot(sim, 4);
    frameHeli(sim);
    return 'play';
  }
  if (name === 'finale') {
    // The Night Job, mid-flight: chapter 8, the 150-second clock running,
    // NOS in the tank, helicopter overhead, North Hills as the marker.
    sim.state.clock = 0.92;
    sim.state.missions.chapter = 7;
    sim.state.missions.step = 1;
    sim.state.garage.nos = true;
    sim.state.nos = 100;
    stealNearestCar(sim, 20);
    sim.state.wanted = 4;
    sim.state.flash = 0;
    driveFor(sim, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.z, 8);
    tidyShot(sim, 4);
    frameHeli(sim);
    return 'play';
  }
  if (name === 'start') {
    sim.state.demo = true;
    for (let i = 0; i < 5 / STEP; i += 1) sim.step(STEP, null);
    return 'title';
  }
  // Default and 'chase': the cover. Day chase cam, four stars, police
  // behind the car on the Downtown avenues.
  sim.state.clock = 0.6;
  stealNearestCar(sim, 20);
  sim.state.wanted = 4;
  sim.state.flash = 0;
  driveFor(sim, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.z, 8);
  tidyShot(sim, 4);
  frameHeli(sim);
  return 'play';
}

// After staging, the drive may have cost the player health and raised the
// heat (a fast drive through pedestrians does that). A screenshot should
// show the scene as staged — full health, the intended wanted level, no
// flash — not the bruises of the drive that set it up.
function tidyShot(sim, wanted) {
  sim.state.player.health = sim.state.player.maxHealth;
  sim.state.wanted = wanted;
  sim.state.flash = 0;
}

// The helicopter flies 55 m up and just behind the player, which puts it
// above the chase camera's frame. For a shot that must show it, move it
// to a visible slot ahead and to the right, lower, its spotlight still
// on the player. This is staging of the same sim state the browser shows.
function frameHeli(sim) {
  const p = sim.state.player;
  const h = sim.state.heli;
  if (!h.active) return;
  const fx = Math.cos(p.angle);
  const fz = Math.sin(p.angle);
  const rx = -fz;
  const rz = fx;
  h.x = p.x + fx * 45 + rx * 35;
  h.z = p.z + fz * 45 + rz * 35;
  h.y = 22;
  h.angle = p.angle;
}

// Drive the current chapter's first step for a few seconds, for the
// browser's auto-demo: it shows the game playing itself on the title
// screen's backdrop and proves the loop runs without input.
export function demoDrive(sim, seconds) {
  const drive = createDriver(sim, MARKERS.eastsideGarage.x, MARKERS.eastsideGarage.z);
  const total = Math.floor(seconds / STEP);
  for (let i = 0; i < total; i += 1) sim.step(STEP, drive());
}
