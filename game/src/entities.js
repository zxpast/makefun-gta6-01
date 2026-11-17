// Solano Heat — everyone else in the city. One job: traffic cars that follow the
// roads, pedestrians on the sidewalks, and police units that chase the player.
// All of them are plain data plus one step() each; drawing lives in render.js.
import {
  AVENUES, CAR, CAR_COLORS, CAR_NAMES, PED_NAMES, STREETS, WORLD_H, WORLD_W,
} from './config.js';
import { int, pick, range } from './random.js';
import { isOnRoad, randomRoadPoint, snapToRoad } from './city.js';

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 42;

export function makeCar(rng, x, y, opts) {
  const o = opts || {};
  const vertical = o.vertical !== undefined ? o.vertical : rng() < 0.5;
  return {
    x, y,
    angle: o.angle !== undefined ? o.angle : (vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI)),
    speed: o.speed !== undefined ? o.speed : range(rng, 90, 150),
    color: o.color || pick(rng, CAR_COLORS),
    name: o.name || pick(rng, CAR_NAMES),
    vertical,
    health: CAR.health,
    isPolice: !!o.isPolice,
    isPlayerCar: !!o.isPlayerCar,
    targetSpeed: o.targetSpeed !== undefined ? o.targetSpeed : range(rng, 90, 150),
    turnCooldown: 0,
    smoke: 0,
    dead: false,
  };
}

export function makePed(rng, x, y) {
  return {
    x, y,
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 28, 55),
    walkPhase: range(rng, 0, Math.PI * 2),
    color: pick(rng, ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#ecf0f1', '#e67e22', '#2ecc71']),
    skin: pick(rng, ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    name: pick(rng, PED_NAMES),
    fleeing: 0,
    dead: false,
    dirTimer: range(rng, 1, 4),
  };
}

// --- Traffic: drive along the road, turn at intersections, slow for the car ahead.
export function stepTraffic(car, dt, rng, city, carsAhead) {
  if (car.dead) return;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Slow down if something is right in front.
  let blocked = false;
  for (const other of carsAhead) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (ahead > 0 && ahead < 70 && side < 26) { blocked = true; break; }
  }
  const want = blocked ? 0 : car.targetSpeed;
  car.speed += Math.max(-260 * dt, Math.min(160 * dt, want - car.speed));
  car.x += fx * car.speed * dt;
  car.y += fy * car.speed * dt;
  car.turnCooldown -= dt;
  // At an intersection, sometimes turn onto the crossing road.
  const onV = AVENUES.some((a) => Math.abs(car.x - a) < 6);
  const onH = STREETS.some((s) => Math.abs(car.y - s) < 6);
  if (onV && onH && car.turnCooldown <= 0 && rng() < 0.012) {
    const choices = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter((a) => Math.abs(a - car.angle) > 0.5);
    car.angle = pick(rng, choices);
    // Snap onto the centre of the new road.
    const p = snapToRoad(car.x, car.y);
    car.x = p.x;
    car.y = p.y;
    car.turnCooldown = 3;
  }
  // Wrap around the world edge instead of despawning.
  if (car.x < -80) car.x = WORLD_W + 60;
  if (car.x > WORLD_W + 80) car.x = -60;
  if (car.y < -80) car.y = WORLD_H + 60;
  if (car.y > WORLD_H + 80) car.y = -60;
  // Keep off buildings: if a building swallowed the car, nudge it back to a road.
  if (!isOnRoad(car.x, car.y) && city.hitsBuilding(car.x - 20, car.y - 10, 40, 20)) {
    const p = snapToRoad(car.x, car.y);
    car.x = p.x;
    car.y = p.y;
  }
}

// --- Pedestrians: wander the sidewalks, flee from gunfire and speeding cars.
export function stepPed(ped, dt, rng, city, danger) {
  if (ped.dead) return;
  ped.walkPhase += dt * 8;
  ped.dirTimer -= dt;
  if (ped.fleeing > 0) {
    ped.fleeing -= dt;
    const dx = ped.x - danger.x;
    const dy = ped.y - danger.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy / d, dx / d);
    const speed = 150;
    const next = city.collideCircle(ped.x + Math.cos(ped.angle) * speed * dt, ped.y + Math.sin(ped.angle) * speed * dt, 10);
    ped.x = next.x;
    ped.y = next.y;
    return;
  }
  if (ped.dirTimer <= 0) {
    ped.dirTimer = range(rng, 1.5, 5);
    // Prefer walking along a road: pick a cardinal direction.
    ped.angle = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]) + range(rng, -0.3, 0.3);
  }
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const next = city.collideCircle(nx, ny, 10);
  if (Math.hypot(next.x - nx, next.y - ny) > 2) {
    ped.angle += Math.PI / 2; // bumped into a wall: turn
    ped.dirTimer = 0.5;
  } else {
    ped.x = next.x;
    ped.y = next.y;
  }
}

// --- Police: chase the player, ram on foot or in a car, shoot at 3+ stars.
export function makePoliceCar(rng, x, y) {
  const car = makeCar(rng, x, y, { isPolice: true, color: '#1a1a2e', speed: 0, targetSpeed: 320 });
  car.siren = 0;
  return car;
}

export function stepPoliceCar(car, dt, playerPos, city) {
  if (car.dead) return;
  car.siren += dt;
  const dx = playerPos.x - car.x;
  const dy = playerPos.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
  car.angle += turn;
  const target = dist > 320 ? 380 : 300;
  car.speed += Math.max(-500 * dt, Math.min(420 * dt, target - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (city.hitsBuilding(car.x - 20, car.y - 10, 40, 20)) {
    // Back out of the building and re-aim.
    car.x -= Math.cos(car.angle) * car.speed * dt * 2;
    car.y -= Math.sin(car.angle) * car.speed * dt * 2;
    car.angle += 0.6;
    car.speed *= 0.5;
  }
}

// A police officer on foot, spawned when the player is cornered at high wanted.
export function makePoliceFoot(rng, x, y) {
  return {
    x, y, angle: 0, speed: 165, health: 60, shootTimer: range(rng, 0.5, 1.5),
    color: '#1a1a2e', skin: '#e0ac69', dead: false, name: 'Officer',
  };
}

export function stepPoliceFoot(cop, dt, playerPos, city) {
  if (cop.dead) return false; // returns true when the cop fires this step
  const dx = playerPos.x - cop.x;
  const dy = playerPos.y - cop.y;
  const dist = Math.hypot(dx, dy) || 1;
  cop.angle = Math.atan2(dy, dx);
  if (dist > 190) {
    const next = city.collideCircle(cop.x + Math.cos(cop.angle) * cop.speed * dt, cop.y + Math.sin(cop.angle) * cop.speed * dt, 10);
    cop.x = next.x;
    cop.y = next.y;
  }
  cop.shootTimer -= dt;
  if (dist < 420 && cop.shootTimer <= 0) {
    cop.shootTimer = 0.9 + Math.random() * 0.7;
    return true;
  }
  return false;
}

export function spawnTraffic(rng, city, playerX, playerY) {
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const p = randomRoadPoint(rng, playerX, playerY, 500);
    cars.push(makeCar(rng, p.x, p.y));
  }
  return cars;
}

export function spawnPeds(rng, city, playerX, playerY) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const p = randomRoadPoint(rng, playerX, playerY, 300);
    // Offset onto the sidewalk beside the road.
    peds.push(makePed(rng, p.x + range(rng, -70, 70), p.y + range(rng, -70, 70)));
  }
  return peds;
}
