// Solano Heat — the screenshot scenes behind ?shot=start|drive|chase|mission.
// Each one plays the real rules forward from a fresh game for a fixed number of
// steps, steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { AVENUES, STEP, STREETS } from './config.js';
import { ScriptedInput } from './input.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { startMission } from './missions.js';
import { addWanted } from './player.js';

const SAMPLE = STEP;

// Steer a driven car along a patrol route of waypoints: aim at the current
// waypoint, advance to the next when close. Waypoints sit on road centrelines,
// so the car stays on the roads and keeps its speed instead of wedging into
// a building corner or the edge of the world.
function driveAutopilot(game, input, route) {
  const car = game.player.inCar;
  if (!car) return;
  const wp = route.points[route.index];
  if (Math.hypot(wp.x - car.x, wp.y - car.y) < 140) {
    route.index = (route.index + 1) % route.points.length;
  }
  const target = route.points[route.index];
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  input.axes = { x: 0, y: -1 }; // W held: accelerate
  if (diff > 0.12) input.axes.x = 1;
  else if (diff < -0.12) input.axes.x = -1;
  input.sprint = false;
}

// On foot, face the nearest rival and fire; strafe so the scene stays alive.
function combatAutopilot(game, input) {
  const player = game.player;
  let target = null;
  let best = Infinity;
  for (const r of game.rivals) {
    if (r.dead) continue;
    const d = Math.hypot(r.x - player.x, r.y - player.y);
    if (d < best) { best = d; target = r; }
  }
  if (!target) {
    for (const cop of game.policeFoot) {
      if (cop.dead) continue;
      const d = Math.hypot(cop.x - player.x, cop.y - player.y);
      if (d < best) { best = d; target = cop; }
    }
  }
  if (target) {
    game.aim = { x: target.x, y: target.y };
    input.shoot = true;
    // Strafe sideways, away from the target's fire.
    const a = Math.atan2(target.y - player.y, target.x - player.x);
    input.axes = { x: Math.cos(a + Math.PI / 2) * 0.8, y: Math.sin(a + Math.PI / 2) * 0.8 };
  } else {
    input.shoot = false;
    input.axes = { x: 0, y: 0 };
  }
}

function stepGame(game, input, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.step(STEP, input, game.aim || null);
    if (game.player.dead) break;
  }
}

/**
 * Set `game` to the named scene (start, drive, chase or mission; any other name
 * is start) and return the screen to draw over it.
 */
export function stageShot(name, game) {
  const input = new ScriptedInput();
  game.reset();
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    // Title: the city idles for a few seconds behind the panel.
    stepGame(game, input, 5);
    return { screen: SCREEN_TITLE };
  }

  if (name === 'drive') {
    // Lucia in a stolen Comet, cruising Downtown at sunset, one star on her tail.
    game.player.x = 2400;
    game.player.y = 700;
    const car = game.traffic[0];
    car.x = 2400;
    car.y = 700;
    car.angle = Math.PI / 2;
    car.speed = 200;
    car.isPlayerCar = true;
    game.player.inCar = car;
    game.player.angle = Math.PI / 2;
    game.traffic.splice(game.traffic.indexOf(car), 1);
    game.clockMinutes = 18 * 60 + 20;
    addWanted(game.player, 1);
    const route = { index: 0, points: [{ x: 2400, y: 3100 }, { x: 1200, y: 3100 }, { x: 1200, y: 700 }, { x: 2400, y: 700 }] };
    for (let i = 0; i < 60 * 14; i += 1) {
      driveAutopilot(game, input, route);
      game.step(STEP, input, null);
      if (game.player.dead) break;
    }
    return { screen: game.player.dead ? SCREEN_OVER : SCREEN_PLAY };
  }

  if (name === 'chase') {
    // A three-star chase along the Boardwalk at night, police cars closing in.
    game.player.x = 400;
    game.player.y = 900;
    const car = game.traffic[1];
    car.x = 400;
    car.y = 900;
    car.angle = Math.PI / 2;
    car.speed = 260;
    car.isPlayerCar = true;
    game.player.inCar = car;
    game.player.angle = Math.PI / 2;
    game.traffic.splice(game.traffic.indexOf(car), 1);
    game.clockMinutes = 21 * 60 + 30;
    addWanted(game.player, 3);
    const route = { index: 0, points: [{ x: 400, y: 3100 }, { x: 1600, y: 3100 }, { x: 1600, y: 700 }, { x: 400, y: 700 }] };
    for (let i = 0; i < 60 * 10; i += 1) {
      driveAutopilot(game, input, route);
      game.step(STEP, input, null);
      if (game.player.dead) break;
    }
    return { screen: game.player.dead ? SCREEN_OVER : SCREEN_PLAY };
  }

  // mission: the warehouse shootout — mission 4, SMG out, Salt Kings closing in.
  game.player.x = 2050;
  game.player.y = 2600;
  game.player.weapon = 'smg';
  game.player.ammo.smg = 240;
  game.clockMinutes = 17 * 60 + 40;
  game.missions.index = 3;
  startMission(game.missions, game.player);
  game.missions.step = 1;
  game.missions.eliminateCount = 0;
  stepGame(game, input, 1.5);
  for (let i = 0; i < 60 * 12; i += 1) {
    combatAutopilot(game, input);
    game.step(STEP, input, game.aim || null);
    if (game.player.dead) break;
  }
  return { screen: game.player.dead ? SCREEN_OVER : SCREEN_PLAY };
}
