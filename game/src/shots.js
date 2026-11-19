// Solano Heat — the four screenshot scenes. Each one plays the real rules
// forward from a fresh sim with the autopilot driving, then stages the heat
// the shot is about: a daytime chase, a night helicopter pursuit, a
// roadblock at dusk, and the finale with everything on. The Node painter
// stages the same scenes from the same seed, so the screenshots are the
// game's own frames.
import { STEP } from './config.js';
import { createAutopilot } from './autopilot.js';

function driveFor(sim, missions, seconds) {
  const pilot = createAutopilot(sim, missions);
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    sim.step(STEP, pilot.input());
  }
}

function placePoliceForShot(sim) {
  // The chase camera looks forward, so cruisers on the tail sit behind
  // the lens and never appear in the frame. Stage the same chase from a
  // moment the cops are closing in where the player can see them: two
  // pulling alongside, one cutting across ahead, one ramming the bumper.
  const p = sim.state.player;
  const fwdX = Math.sin(p.angle);
  const fwdZ = Math.cos(p.angle);
  const rightX = Math.cos(p.angle);
  const rightZ = -Math.sin(p.angle);
  const spots = [
    { f: 10, s: -8 }, { f: 2, s: 8 }, { f: 28, s: 0 }, { f: 16, s: -14 },
  ];
  sim.state.police.forEach((cop, i) => {
    const spot = spots[i % spots.length];
    cop.x = p.x + fwdX * spot.f + rightX * spot.s;
    cop.z = p.z + fwdZ * spot.f + rightZ * spot.s;
    cop.angle = p.angle;
    cop.speed = 22;
    cop.mode = 'chase';
  });
}

function placeHeliForShot(sim) {
  // Ahead of the player and off to the side, so the helicopter and its
  // spotlight cone are inside the chase camera's frame. The heli sits
  // heading-relative: 25 m ahead, 12 m to the player's right.
  const p = sim.state.player;
  sim.state.heli.x = p.x + Math.sin(p.angle) * 25 + Math.cos(p.angle) * 12;
  sim.state.heli.z = p.z + Math.cos(p.angle) * 25 - Math.sin(p.angle) * 12;
  sim.state.heli.active = true;
}

function setClock(sim, hours, minutes) {
  sim.setClock(hours, minutes);
}

/** Stage `name` (chase|heli|roadblock|finale) and return the screen to draw. */
export function stageShot(name, sim, missions) {
  sim.reset();
  if (name === 'heli' || name === 'finale') setClock(sim, 22, 10);
  else if (name === 'roadblock') setClock(sim, 18, 40);
  else setClock(sim, 15, 20);

  if (name === 'finale') {
    missions.startChapter(7);
    driveFor(sim, missions, 26);
    sim.state.wanted = 5;
    placeHeliForShot(sim);
    sim.state.roadblockTimer = 0;
    driveFor(sim, missions, 4);
    placePoliceForShot(sim);
    return { screen: 'play' };
  }

  if (name === 'heli') {
    driveFor(sim, missions, 22);
    sim.state.wanted = 4;
    placeHeliForShot(sim);
    driveFor(sim, missions, 3);
    placePoliceForShot(sim);
    return { screen: 'play' };
  }

  if (name === 'roadblock') {
    driveFor(sim, missions, 20);
    sim.state.wanted = 4;
    sim.state.roadblockTimer = 0;
    driveFor(sim, missions, 3);
    placePoliceForShot(sim);
    return { screen: 'play' };
  }

  // chase: broad daylight, three stars, cruisers on the tail.
  driveFor(sim, missions, 24);
  sim.state.wanted = 3;
  driveFor(sim, missions, 3);
  placePoliceForShot(sim);
  return { screen: 'play' };
}
