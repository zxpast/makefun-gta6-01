// The autopilot: a driver that plays Port Solano by the same rules a
// person does, through the same sim.step() input. It walks to the nearest
// parked car and steals it, then follows the road graph to its target —
// full throttle on the straights, coasting through sharp turns, reversing
// briefly when wedged — and it can play whole missions: steal, pick up,
// deliver, on a clock. The browser's auto-demo and the Node tests both
// drive through here, so a mission the autopilot cannot finish is a
// mission a player probably cannot finish either.
import { STEP } from './config.js';
import { routeOnRoads } from './city.js';
import { angleDelta, clamp } from './random.js';
import { ACTION_ENTER } from './sim.js';

function angleDiff(want, have) {
  return angleDelta(have, want);
}

function walkToward(sim, tx, tz) {
  const p = sim.state.player;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const len = Math.hypot(dx, dz) || 1;
  return { move: { x: dx / len, z: dz / len }, running: true, actions: 0, nos: false };
}

export function createDriver(sim, toX, toZ) {
  let route = null;
  let stuckTimer = 0;
  let reverseTimer = 0;
  let lastProgress = 0;
  let lastX = 0;
  let lastZ = 0;
  return function drive() {
    const car = sim.state.player.inCar;
    if (!car) return { move: { x: 0, z: 0 }, running: false, actions: 0, nos: false };
    if (!route) {
      route = routeOnRoads(sim.state.city, car.x, car.z, toX, toZ);
      lastX = car.x;
      lastZ = car.z;
      lastProgress = 0;
    }
    if (route.length === 0) return { move: { x: 0, z: 0 }, running: false, actions: 0, nos: false };
    const head = route[0];
    if (Math.hypot(head.x - car.x, head.z - car.z) < 7) {
      route.shift();
      if (route.length === 0) return { move: { x: 0, z: 0 }, running: false, actions: 0, nos: false };
    }
    const want = Math.atan2(route[0].z - car.z, route[0].x - car.x);
    const err = angleDiff(want, car.angle);
    const steer = err > 0.08 ? 1 : err < -0.08 ? -1 : 0;
    const wheel = car.speed < 0 ? -steer : steer;
    if (reverseTimer > 0) {
      reverseTimer -= STEP;
      return { move: { x: wheel, z: 1 }, running: false, actions: 0, nos: false };
    }
    // Stuck detection: barely moving for a while means wedged on a corner.
    lastProgress += STEP;
    if (lastProgress > 0.5) {
      const moved = Math.hypot(car.x - lastX, car.z - lastZ);
      if (moved < 1.5 && Math.abs(car.speed) < 3) {
        stuckTimer += 0.5;
        if (stuckTimer > 0.8) {
          stuckTimer = 0;
          reverseTimer = 0.7;
        }
      } else {
        stuckTimer = 0;
      }
      lastX = car.x;
      lastZ = car.z;
      lastProgress = 0;
    }
    // Brake early for the next sharp turn in the route.
    let cornerDist = Infinity;
    let cornerSharp = false;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const legA = Math.atan2(b.z - a.z, b.x - a.x);
      const legB = i + 2 < route.length
        ? Math.atan2(route[i + 2].z - b.z, route[i + 2].x - b.x)
        : legA;
      if (Math.abs(angleDiff(legB, legA)) > 0.5) {
        cornerDist = Math.hypot(b.x - car.x, b.z - car.z);
        cornerSharp = true;
        break;
      }
    }
    const nos = Math.abs(err) < 0.2 && !cornerSharp && Math.abs(car.speed) > 12;
    let throttle;
    if (cornerSharp && cornerDist < 55 && Math.abs(car.speed) > 8) {
      throttle = 1; // brake toward the corner
    } else if (Math.abs(err) > 1.8 && Math.abs(car.speed) > 8) {
      throttle = 1;
    } else if (Math.abs(err) > 0.6) {
      throttle = 0; // coast through the turn
    } else {
      throttle = -1; // flat out on the straight (forward = -move.z)
    }
    return { move: { x: wheel, z: throttle }, running: false, actions: 0, nos };
  };
}

// Walk to the nearest parked car and steal it (up to 20 s of walking).
export function stealNearestCar(sim, maxSeconds) {
  const limit = Math.floor((maxSeconds || 20) / STEP);
  for (let i = 0; i < limit; i += 1) {
    const p = sim.state.player;
    if (p.inCar) return true;
    const car = sim.state.cars.find((c) => c.parked);
    if (!car) return false;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    const input = d < 4.5
      ? { move: { x: 0, z: 0 }, running: false, actions: ACTION_ENTER, nos: false }
      : walkToward(sim, car.x, car.z);
    sim.step(STEP, input);
  }
  return !!sim.state.player.inCar;
}

// Drive at a target for `seconds` of game time.
export function driveFor(sim, tx, tz, seconds) {
  const drive = createDriver(sim, tx, tz);
  const total = Math.floor(seconds / STEP);
  for (let i = 0; i < total; i += 1) sim.step(STEP, drive());
}

// Play the current chapter to completion (or give up after maxSeconds).
// Returns { done, seconds }. The driver is kept across steps and only
// rebuilt when its target changes: a fresh driver every step would aim
// at the nearest road node, which is often the one the car just passed,
// and the car would turn back on itself forever.
export function playChapter(sim, maxSeconds) {
  const startChapter = sim.state.missions.chapter;
  const limit = Math.floor((maxSeconds || 300) / STEP);
  let driver = null;
  let driverTarget = '';
  function driverFor(tx, tz) {
    const key = `${tx},${tz}`;
    if (!driver || driverTarget !== key) {
      driver = createDriver(sim, tx, tz);
      driverTarget = key;
    }
    return driver;
  }
  for (let i = 0; i < limit; i += 1) {
    const missions = sim.state.missions;
    if (missions.chapter !== startChapter) return { done: true, seconds: i * STEP };
    const step = sim.currentStepInfo();
    if (!step) return { done: false, seconds: i * STEP };
    const marker = sim.marker();
    if (step.kind === 'steal') {
      if (!stealNearestCar(sim, 20)) return { done: false, seconds: i * STEP };
      continue;
    }
    if (step.kind === 'loseHeat') {
      // Run from the police: drive at the far corner until the heat cools.
      sim.step(STEP, driverFor(40, 40)());
      continue;
    }
    if (!marker) {
      sim.step(STEP, { move: { x: 0, z: 0 }, running: false, actions: 0, nos: false });
      continue;
    }
    if (step.kind === 'wait') {
      // Stand in the zone: walk or drive there, then hold still.
      const d = Math.hypot(marker.x - sim.state.player.x, marker.z - sim.state.player.z);
      if (d > 6 && sim.state.player.inCar) {
        sim.step(STEP, driverFor(marker.x, marker.z)());
      } else if (d > 6) {
        sim.step(STEP, walkToward(sim, marker.x, marker.z));
      } else {
        sim.step(STEP, { move: { x: 0, z: 0 }, running: false, actions: 0, nos: false });
      }
      continue;
    }
    if (!sim.state.player.inCar) {
      if (!stealNearestCar(sim, 20)) return { done: false, seconds: i * STEP };
      continue;
    }
    sim.step(STEP, driverFor(marker.x, marker.z)());
  }
  return { done: false, seconds: maxSeconds };
}

// Drive freely between random waypoints for `seconds`; returns how far the
// car got and whether the sim stayed sane (no NaN, no teleport).
export function driveFree(sim, seconds, random) {
  const total = Math.floor(seconds / STEP);
  let distance = 0;
  let lastX = sim.state.player.x;
  let lastZ = sim.state.player.z;
  let target = { x: 120, z: 120 };
  let drive = createDriver(sim, target.x, target.z);
  for (let i = 0; i < total; i += 1) {
    if (!sim.state.player.inCar) {
      if (!stealNearestCar(sim, 20)) return { distance, ok: false, reason: 'no car' };
      drive = createDriver(sim, target.x, target.z);
    }
    const p = sim.state.player;
    if (Math.hypot(target.x - p.x, target.z - p.z) < 12) {
      target = { x: 80 + random() * 800, z: 80 + random() * 480 };
      drive = createDriver(sim, target.x, target.z);
    }
    sim.step(STEP, drive());
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.angle)) {
      return { distance, ok: false, reason: 'non-finite state' };
    }
    distance += Math.hypot(p.x - lastX, p.z - lastZ);
    lastX = p.x;
    lastZ = p.z;
  }
  return { distance, ok: true, reason: '' };
}

export { clamp };
