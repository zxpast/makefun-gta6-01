// Solano Heat driving: arcade car physics and the traffic that shares the
// road. One car model drives the player, the police and the traffic alike:
// a heading, a speed, and a steering input, with grip that falls off as
// speed rises so fast corners slide. No real physics engine, on purpose:
// the whole game has to stay deterministic enough for the sim tests.

import { intersection, routeBetween, resolveBuilding, nearestIntersection } from './city.js';
import { headingError, steerFor, NOS_TOP_SPEED } from './sim.js';

export function makeCar(x, z, heading, opts = {}) {
  return {
    x, z, heading,
    speed: 0,
    radius: 2.2,
    color: opts.color ?? 0xd8b13a,
    topSpeed: opts.topSpeed ?? 42,
    accel: opts.accel ?? 26,
    brake: opts.brake ?? 42,
    grip: opts.grip ?? 3.4,
    nos: 0,
    damage: 0,
    drift: 0,
  };
}

// One physics step. input: { throttle 0..1, brake 0..1, steer -1..1, nos }.
export function stepCar(car, input, dt, city) {
  const top = input.nos && car.nos > 0 ? NOS_TOP_SPEED : car.topSpeed;
  if (input.throttle > 0) car.speed += car.accel * input.throttle * dt;
  if (input.brake > 0) {
    car.speed -= (car.speed > 0.5 ? car.brake : car.accel * 0.7) * input.brake * dt;
  }
  // Rolling drag and a hard cap, so a car never runs away downhill.
  car.speed -= car.speed * 0.35 * dt;
  if (car.speed > top) car.speed = top;
  if (car.speed < -14) car.speed = -14;
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;

  const direction = car.speed >= 0 ? 1 : -1;
  const turn = input.steer * car.grip * dt * Math.min(1, Math.abs(car.speed) / 9) * direction;
  car.heading += turn;
  car.drift = Math.abs(input.steer) > 0.85 && Math.abs(car.speed) > 24 ? 1 : Math.max(0, car.drift - dt * 2);
  if (input.nos && car.nos > 0) car.nos = Math.max(0, car.nos - dt);

  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  if (city && resolveBuilding(city, car)) {
    // A wall hit costs speed and a little paint.
    if (Math.abs(car.speed) > 12) car.damage += Math.min(12, Math.abs(car.speed) * 0.4);
    car.speed *= 0.45;
  }
  return car;
}

// Two circles push apart. Returns true when they touched.
export function separate(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const min = a.radius + b.radius;
  if (dist >= min || dist === 0) return false;
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const nz = dz / dist;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  return true;
}

// Traffic: cars that loop the grid on their own routes, keeping to the
// right-hand lane so oncoming traffic passes instead of ramming.
export function makeTraffic(city, rng, count) {
  const cars = [];
  const palette = [0x7a8a99, 0x9a4d4d, 0x4d7a5a, 0x8a7a4d, 0x5a5a7a, 0xb0b0b0];
  for (let k = 0; k < count; k += 1) {
    const a = { i: Math.floor(rng() * 9), j: Math.floor(rng() * 9) };
    const b = { i: Math.floor(rng() * 9), j: Math.floor(rng() * 9) };
    const p = intersection(a.i, a.j);
    const car = makeCar(p.x, p.z, rng() * Math.PI * 2, {
      color: palette[k % palette.length],
      topSpeed: 20 + rng() * 6,
      accel: 14,
    });
    car.route = routeBetween(a, b);
    car.waypoint = 0;
    car.loop = true;
    cars.push(car);
  }
  return cars;
}

export function stepTraffic(car, dt, city) {
  if (!car.route || car.route.length === 0) return car;
  const goal = car.route[car.waypoint];
  const dx = goal.x - car.x;
  const dz = goal.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 5) {
    car.waypoint += 1;
    if (car.waypoint >= car.route.length) {
      if (car.loop) {
        const here = nearestIntersection(car.x, car.z);
        const there = { i: (here.i + 3) % 9, j: (here.j + 5) % 9 };
        car.route = routeBetween(here, there);
        car.waypoint = 0;
      } else {
        car.waypoint = car.route.length - 1;
      }
    }
    return car;
  }
  // Right-hand lane: sit 3.5 units to the right of the travel direction.
  const want = Math.atan2(dx, dz);
  const laneX = goal.x + Math.cos(want) * 3.5;
  const laneZ = goal.z - Math.sin(want) * 3.5;
  const laneErr = headingError(car.heading, Math.atan2(laneX - car.x, laneZ - car.z));
  stepCar(car, { throttle: 0.7, brake: 0, steer: steerFor(laneErr), nos: false }, dt, city);
  return car;
}
