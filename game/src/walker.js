// On foot in Solano Bay: Rook walks the sidewalks, steals cars and fights
// on the pavement. Walking is deliberately simple — a heading, a walk speed
// and a punch — because the car is where the game lives, and the walker only
// has to feel honest for the seconds between cars.

import { resolveBuilding } from './city.js';

export const WALK_SPEED = 7;
export const RUN_SPEED = 11;

// A hurt walker moves slower: below 30 health Rook limps at three fifths.
export function walkTopSpeed(walker, run) {
  const base = run ? RUN_SPEED : WALK_SPEED;
  return walker.health < 30 ? base * 0.6 : base;
}

export function makeWalker(x, z, heading) {
  return {
    x, z, heading,
    speed: 0,
    radius: 0.9,
    onFoot: true,
    punch: 0,
    health: 100,
  };
}

// input: { forward, back, left, right, run }. Moves in the facing direction.
export function stepWalker(walker, input, dt, city) {
  const top = walkTopSpeed(walker, input.run);
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += Math.sin(walker.heading); mz += Math.cos(walker.heading); }
  if (input.back) { mx -= Math.sin(walker.heading); mz -= Math.cos(walker.heading); }
  if (input.left) walker.heading -= 2.6 * dt;
  if (input.right) walker.heading += 2.6 * dt;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    walker.speed = top;
    walker.x += (mx / len) * top * dt;
    walker.z += (mz / len) * top * dt;
  } else {
    walker.speed = 0;
  }
  if (city) resolveBuilding(city, walker);
  if (walker.punch > 0) walker.punch = Math.max(0, walker.punch - dt);
  return walker;
}

// The nearest car the walker can climb into, or null.
export function nearestCar(walker, cars, maxDist = 5) {
  let best = null;
  let bestDist = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - walker.x, car.z - walker.z);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  return best;
}

// A punch lands on anything close enough in front of the walker.
export function punchHits(walker, targets, range = 2.4) {
  const hits = [];
  for (const t of targets) {
    const d = Math.hypot(t.x - walker.x, t.z - walker.z);
    if (d > range) continue;
    const ang = Math.atan2(t.x - walker.x, t.z - walker.z);
    let err = ang - walker.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    if (Math.abs(err) < 1.1) hits.push(t);
  }
  return hits;
}
