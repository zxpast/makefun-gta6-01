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
    return 'play';
  }
  if (name === 'start') {
    sim.state.demo = true;
    for (let i = 0; i < 5 / STEP; i += 1) sim.step(STEP, null);
    return 'title';
  }
  // Default and 'chase': the cover. Day chase cam, four stars, police
  // behind the car on the Downtown avenues.
  stealNearestCar(sim, 20);
  sim.state.wanted = 4;
  sim.state.flash = 0;
  driveFor(sim, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.z, 8);
  return 'play';
}

// Drive the current chapter's first step for a few seconds, for the
// browser's auto-demo: it shows the game playing itself on the title
// screen's backdrop and proves the loop runs without input.
export function demoDrive(sim, seconds) {
  const drive = createDriver(sim, MARKERS.eastsideGarage.x, MARKERS.eastsideGarage.z);
  const total = Math.floor(seconds / STEP);
  for (let i = 0; i < total; i += 1) sim.step(STEP, drive());
}
