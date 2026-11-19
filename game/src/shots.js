// Staged scenes for the screenshots. Each shot builds a fresh sim from the fixed seed,
// starts a chapter, adds the heat the scene needs, and lets the autopilot drive for a
// few seconds — so the shot shows the same sim state and camera the game renders.
import { createRandom } from './random.js';
import { createSim } from './sim.js';
import { createMissions } from './missions.js';
import { createAutopilot } from './autopilot.js';
import { chaseCamera } from './camera3d.js';

const SHOT_SEED = 7;

function driveSeconds(sim, missions, pilot, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    sim.step(1 / 60, pilot.input());
    missions.update(1 / 60);
  }
}

export function stageShot(name) {
  const random = createRandom(SHOT_SEED);
  const sim = createSim(random);
  const missions = createMissions(sim);
  const pilot = createAutopilot(sim, missions);
  if (name === 'chase') {
    missions.startChapter(0);
    driveSeconds(sim, missions, pilot, 12);
  } else if (name === 'heli') {
    missions.startChapter(1);
    sim.addHeat(4);
    driveSeconds(sim, missions, pilot, 10);
  } else if (name === 'roadblock') {
    missions.startChapter(1);
    sim.addHeat(4);
    driveSeconds(sim, missions, pilot, 12);
  } else if (name === 'finale') {
    sim.setClock(22, 0);
    missions.startChapter(7);
    driveSeconds(sim, missions, pilot, 10);
  } else {
    throw new Error(`unknown shot: ${name}`);
  }
  const camera = chaseCamera(sim.state.player, null, 0);
  return { sim, missions, camera };
}

export const SHOT_NAMES = ['chase', 'heli', 'roadblock', 'finale'];
