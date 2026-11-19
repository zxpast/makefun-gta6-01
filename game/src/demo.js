// The demo driver for Solano Heat: an autopilot that plays the game when
// ?auto=1 is in the URL. It follows the active mission's route waypoint by
// waypoint, steering on heading error and braking for sharp turns, and it
// picks the next mission by itself when one ends. It is the game's own
// driver — no scripted key presses, no teleports — so what it captures on
// screen is the game really being played.

import { headingError, steerFor, NOS_TOP_SPEED } from './sim.js';

export function makeDemo() {
  return {
    active: false,
    idle: 0,
    picked: false,
    stuckFor: 0,
    reversingUntil: 0,
  };
}

// Returns a drive input for this frame, or null when the driver is off.
export function demoDrive(demo, game, dt) {
  if (!demo.active) return null;
  const player = game.player;
  const mission = game.mission;
  // Wedged against a wall: reverse straight back for a beat, no steering,
  // then carry on. A steered reverse spins the car into the next wall.
  if (mission && Math.abs(player.speed) < 3) demo.stuckFor += dt;
  else demo.stuckFor = 0;
  if (demo.stuckFor > 2) {
    demo.reversingUntil = 1.5;
    demo.stuckFor = 0;
  }
  if (demo.reversingUntil > 0) {
    demo.reversingUntil -= dt;
    return { throttle: 0, brake: 1, steer: 0, nos: false };
  }
  if (!mission) {
    // No job running: pick the next one and wait a beat.
    demo.idle += dt;
    if (demo.idle > 1 && game.pickNextMission) {
      game.pickNextMission();
      demo.idle = 0;
    }
    return { throttle: 0, brake: 1, steer: 0, nos: false };
  }
  const route = mission.route || [];
  let goal = mission.target;
  if (route.length > 0 && mission.waypoint < route.length) {
    goal = route[mission.waypoint];
    const d = Math.hypot(goal.x - player.x, goal.z - player.z);
    if (d < 7) {
      mission.waypoint += 1;
      if (mission.waypoint < route.length) goal = route[mission.waypoint];
      else goal = mission.target;
    }
  }
  const want = Math.atan2(goal.x - player.x, goal.z - player.z);
  const err = headingError(player.heading, want);
  const speed = Math.abs(player.speed);
  const brake = Math.abs(err) > 1.1 && speed > 12 ? 1 : 0;
  const nos = Math.abs(err) < 0.25 && speed > 26 && player.nos > 0;
  return {
    throttle: brake ? 0 : 0.95,
    brake,
    steer: steerFor(err),
    nos,
  };
}

// The demo driver also picks missions by "pressing" the menu, the same way
// a player would — so a capture run can start from the title screen.
export function demoMenu(demo, game) {
  if (!demo.active) return;
  if (!game.menuOpen && !game.mission && game.pickNextMission) {
    game.pickNextMission();
  }
}
