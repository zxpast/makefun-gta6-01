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
    missions.update(STEP);
  }
}

function setClock(sim, hours, minutes) {
  sim.state.clockMinutes = hours * 60 + minutes;
}

/** Put the cruisers where the chase camera can see them: alongside and ahead. */
function placePoliceForShot(sim) {
  const p = sim.state.player;
  const fx = Math.sin(p.angle);
  const fz = Math.cos(p.angle);
  const rx = Math.cos(p.angle);
  const rz = -Math.sin(p.angle);
  const spots = [
    { f: 10, s: -8 },
    { f: 2, s: 8 },
    { f: 28, s: 0 },
    { f: 16, s: -14 },
  ];
  sim.state.police.forEach((cop, i) => {
    const spot = spots[i % spots.length];
    cop.x = p.x + fx * spot.f + rx * spot.s;
    cop.z = p.z + fz * spot.f + rz * spot.s;
    cop.angle = p.angle;
    cop.speed = 22;
    cop.mode = 'chase';
  });
}

/** Put the helicopter ahead and off to the side, inside the camera frame. */
function placeHeliForShot(sim) {
  const p = sim.state.player;
  sim.state.heli.x = p.x + Math.sin(p.angle) * 25 + Math.cos(p.angle) * 12;
  sim.state.heli.z = p.z + Math.cos(p.angle) * 25 - Math.sin(p.angle) * 12;
  sim.state.heli.active = true;
}

/** Stage `name` (chase|heli|roadblock|finale) and return the screen to draw. */
export function stageShot(name, sim, missions) {
  sim.reset();
  if (name === 'heli' || name === 'finale') setClock(sim, 22, 10);
  else if (name === 'roadblock') setClock(sim, 18, 40);
  else setClock(sim, 15, 20);

  // Every scene is the same shape: start a chapter, drive to build the
  // chase, set the heat (and the helicopter or roadblock the shot is
  // about), drive a little more so the police and roadblocks spawn, then
  // place the cruisers where the chase camera can see them.
  function stage(chapter, driveSeconds, wanted, afterDrive, settleSeconds) {
    missions.startChapter(chapter);
    driveFor(sim, missions, driveSeconds);
    sim.state.wanted = wanted;
    afterDrive();
    driveFor(sim, missions, settleSeconds);
    placePoliceForShot(sim);
    return { screen: 'play' };
  }

  if (name === 'finale') {
    return stage(7, 26, 5, () => {
      sim.state.roadblockTimer = 0;
      placeHeliForShot(sim);
    }, 4);
  }
  if (name === 'heli') {
    return stage(0, 22, 4, () => placeHeliForShot(sim), 3);
  }
  if (name === 'roadblock') {
    return stage(0, 20, 4, () => {
      sim.state.roadblockTimer = 0;
    }, 3);
  }
  // chase: broad daylight, three stars, cruisers on the tail.
  return stage(0, 24, 3, () => {}, 3);
}
