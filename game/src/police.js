// The law in Solano Bay: a wanted level that escalates, police cars that
// hunt, a helicopter from four stars up, and roadblocks that cut the road
// ahead. Pursuit is line-of-sight: break sight for long enough and the heat
// cools, which is what makes a getaway possible at all.

import { intersection, nearestIntersection, hasLineOfSight, routeBetween, resolveBuilding } from './city.js';
import { policeUnits, heliActive, roadblockActive, chaseTopSpeed, starsAfterHiding, headingError, steerFor } from './sim.js';
import { makeCar, stepCar, separate } from './vehicles.js';

export function makePolice() {
  return {
    stars: 0,
    cars: [],
    heli: null,
    roadblocks: [],
    roadblockAt: null,
    quiet: 0,
    bustTimer: 0,
    spawnCooldown: 0,
  };
}

export function setWanted(police, stars) {
  police.stars = Math.max(0, Math.min(5, stars));
  if (police.stars === 0) {
    police.cars = [];
    police.heli = null;
    police.roadblocks = [];
    police.quiet = 0;
    police.bustTimer = 0;
  }
}

// Spawn pursuit cars behind the player, snapped to the nearest intersection
// so a cruiser never spawns inside a building, and inside sight range so the
// chase is visible the moment it starts instead of arriving from nowhere.
export function spawnPursuit(police, player, rng) {
  const want = policeUnits(police.stars);
  while (police.cars.length < want) {
    const behind = player.heading + Math.PI + (rng() - 0.5) * 0.9;
    const dist = 34 + rng() * 18;
    const raw = {
      x: player.x + Math.sin(behind) * dist,
      z: player.z + Math.cos(behind) * dist,
    };
    const spot = nearestIntersection(raw.x, raw.z);
    const car = makeCar(spot.x, spot.z, player.heading,
      { color: 0x1c2a44, topSpeed: chaseTopSpeed(police.stars), accel: 30 });
    car.isPolice = true;
    police.cars.push(car);
  }
}

export function stepPolice(police, player, dt, city, rng) {
  if (police.stars === 0) return police;
  police.spawnCooldown -= dt;
  if (police.spawnCooldown <= 0) {
    spawnPursuit(police, player, rng);
    police.spawnCooldown = 1.2;
  }
  let seen = false;
  for (const car of police.cars) {
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz);
    // Close in: ram the player. Far away: follow the road grid, repathing
    // every two seconds, so a cruiser never cuts a corner through a block
    // and wedges itself on a building face. When the cruiser already shares
    // the player's intersection the route is empty, and it steers direct.
    let steer;
    let brake = 0;
    if (dist < 12) {
      steer = steerFor(headingError(car.heading, Math.atan2(dx, dz)));
    } else {
      car.repath = (car.repath ?? 0) - dt;
      if (!car.route || car.waypoint >= car.route.length || car.repath <= 0) {
        car.route = routeBetween(
          nearestIntersection(car.x, car.z),
          nearestIntersection(player.x, player.z),
        );
        car.waypoint = 0;
        car.repath = 2;
      }
      let target = null;
      if (car.route.length > 0) {
        const goal = car.route[car.waypoint];
        if (goal && Math.hypot(goal.x - car.x, goal.z - car.z) < 6) car.waypoint += 1;
        target = car.route[Math.min(car.waypoint, car.route.length - 1)];
      }
      if (target) {
        const err = headingError(car.heading, Math.atan2(target.x - car.x, target.z - car.z));
        steer = steerFor(err);
        if (Math.abs(err) > 1.1 && car.speed > 12) brake = 1;
      } else {
        steer = steerFor(headingError(car.heading, Math.atan2(dx, dz)));
      }
    }
    stepCar(car, { throttle: 0.95, brake, steer, nos: false }, dt, city);
    if (dist < 4.5) separate(car, player);
    if (dist < 60 && hasLineOfSight(city, car.x, car.z, player.x, player.z)) seen = true;
  }
  // The helicopter keeps station ahead and above the player, low enough
  // and far enough forward that the chase camera looking forward has it in
  // the frame, with its spotlight leaning back down onto the car.
  if (heliActive(police.stars)) {
    if (!police.heli) {
      police.heli = {
        x: player.x, z: player.z, y: 13, heading: player.heading,
        rotor: 0, radius: 3,
      };
    }
    const h = police.heli;
    const tx = player.x + Math.sin(player.heading) * 22;
    const tz = player.z + Math.cos(player.heading) * 22;
    h.x += (tx - h.x) * Math.min(1, dt * 1.4);
    h.z += (tz - h.z) * Math.min(1, dt * 1.4);
    h.y += (13 - h.y) * Math.min(1, dt);
    h.heading = player.heading;
    h.rotor += dt * 22;
    if (hasLineOfSight(city, h.x, h.z, player.x, player.z)) seen = true;
  } else {
    police.heli = null;
  }
  // Roadblocks wall the road ahead. Each one is three cruisers parked
  // across the street the player is heading for.
  if (roadblockActive(police.stars)) {
    if (police.roadblocks.length === 0) placeRoadblock(police, player, city);
    const block = police.roadblocks[0];
    const d = Math.hypot(block.x - player.x, block.z - player.z);
    if (d < 12 || d > 130) placeRoadblock(police, player, city);
  } else {
    police.roadblocks = [];
  }
  // Busted: boxed in at a crawl with a cruiser on the bumper.
  const close = police.cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 4);
  if (close && Math.abs(player.speed) < 2) police.bustTimer += dt;
  else police.bustTimer = 0;
  // Heat decay: nobody sees the player, the tail goes cold.
  if (seen) police.quiet = 0;
  else police.quiet += dt;
  const before = police.stars;
  police.stars = starsAfterHiding(police.stars, police.quiet);
  if (police.stars < before && police.stars === 0) setWanted(police, 0);
  return police;
}

function placeRoadblock(police, player, city) {
  const ahead = 62;
  const cx = player.x + Math.sin(player.heading) * ahead;
  const cz = player.z + Math.cos(player.heading) * ahead;
  const near = nearestIntersection(cx, cz);
  const p = intersection(near.i, near.j);
  const across = player.heading + Math.PI / 2;
  police.roadblocks = [0, 1, 2].map((k) => {
    const off = (k - 1) * 6;
    return {
      x: p.x + Math.sin(across) * off,
      z: p.z + Math.cos(across) * off,
      heading: across,
      radius: 2.2,
    };
  });
  police.roadblockAt = { x: p.x, z: p.z };
}

export function policeBusted(police) {
  return police.bustTimer > 3;
}
