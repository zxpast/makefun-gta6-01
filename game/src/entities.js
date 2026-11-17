// Solano Heat — the people and cars of Port Solano.
//
// Three kinds of entity, all plain data the world steps and the renderer draws:
// traffic cars that follow the road grid, pedestrians who wander the sidewalks
// and flee from trouble, and police cars that chase the player once the heat is
// on. Nothing here draws or touches the browser; every behaviour is a small
// function over the state, fed by the world's seeded random stream.
import { CAR, CITY, ON_FOOT, POLICE, TRAFFIC } from './config.js';
import { clampToCity, hitsBuilding, nearestRoadPoint, onRoad } from './city.js';

let nextId = 1;

function makeCar(x, y, angle, kind) {
  return {
    id: nextId,
    kind,
    x, y, angle,
    speed: 0,
    topSpeed: kind === 'fast' ? CAR.fastTopSpeed : CAR.topSpeed,
    length: CAR.length,
    width: CAR.width,
    targetAngle: angle,
    // Traffic only: which way along the road, and when to pick a new turn.
    dir: 0,
    cruise: TRAFFIC.cruise,
    turnIn: 0,
    // Police only: who they chase.
    siren: 0,
  };
}

function makePed(x, y, random) {
  return {
    id: nextId,
    x, y,
    angle: random.range(0, Math.PI * 2),
    speed: 40 + random.range(0, 30),
    wait: random.range(0, 3),
    fleeing: 0,
    color: random.pick(['#c98a7a', '#8ac79a', '#c7b28a', '#9a8ac7', '#7ac7c2']),
  };
}

/** Scatter parked cars along the roads and a few moving ones to start. */
export function spawnTraffic(city, random) {
  const cars = [];
  const peds = [];
  for (let n = 0; n < TRAFFIC.cars; n += 1) {
    const point = nearestRoadPoint(city, random.range(100, CITY.width - 100), random.range(100, CITY.height - 100));
    const angle = random.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const car = makeCar(point.x, point.y, angle, random.pick(['sedan', 'sedan', 'taxi', 'fast']));
    car.speed = car.cruise + random.range(-TRAFFIC.cruiseJitter, TRAFFIC.cruiseJitter);
    car.dir = random.pick([-1, 1]);
    cars.push(car);
  }
  // Parked cars the player can steal, at the curb beside a road near the
  // places that matter — the safehouse, the Docks, the North Hills, Eastside,
  // Sunset Pier and the Marina. A curb spot has to be clear of the buildings
  // lining the block, so each one is tried until a clear stretch is found;
  // the fallback is the road centre itself, facing along the road. Each car
  // faces a fixed way: the one by the safehouse points north, into the city,
  // so Lucia can drive straight off.
  const parkedSpots = [
    { road: 1280, at: 1280, dir: 'v', angle: -Math.PI / 2 },
    { road: 320, at: 2080, dir: 'v', angle: Math.PI / 2 },
    { road: 1920, at: 320, dir: 'v', angle: -Math.PI / 2 },
    { road: 2880, at: 1120, dir: 'v', angle: Math.PI / 2 },
    { road: 320, at: 960, dir: 'v', angle: -Math.PI / 2 },
    { road: 2080, at: 1600, dir: 'h', angle: 0 },
    { road: 640, at: 640, dir: 'h', angle: Math.PI },
    { road: 1600, at: 2240, dir: 'h', angle: 0 },
  ];
  for (const spot of parkedSpots) {
    let placed = null;
    for (let tries = 0; tries < 12 && !placed; tries += 1) {
      const offset = 34;
      let x; let y;
      if (spot.dir === 'v') {
        x = spot.road + offset;
        y = spot.at + random.range(-200, 200);
      } else {
        x = spot.at + random.range(-200, 200);
        y = spot.road + offset;
      }
      const clear = !city.buildings.some((b) => x > b.x - 34 && x < b.x + b.w + 34 && y > b.y - 34 && y < b.y + b.h + 34);
      if (clear) placed = { x, y, angle: spot.angle };
    }
    if (!placed) {
      placed = spot.dir === 'v'
        ? { x: spot.road, y: spot.at, angle: Math.PI / 2 }
        : { x: spot.at, y: spot.road, angle: 0 };
    }
    const car = makeCar(placed.x, placed.y, placed.angle, random.pick(['sedan', 'fast', 'taxi']));
    car.parked = true;
    cars.push(car);
  }
  for (let n = 0; n < TRAFFIC.peds; n += 1) {
    peds.push(makePed(random.range(100, CITY.width - 100), random.range(100, CITY.height - 100), random));
  }
  return { cars, peds, police: [] };
}

/** A traffic car follows its road; at each intersection it may turn. */
export function stepTrafficCar(city, car, dt, random) {
  if (car.parked) return;
  car.turnIn -= dt;
  const ahead = { x: car.x + Math.cos(car.angle) * car.speed * dt, y: car.y + Math.sin(car.angle) * car.speed * dt };
  const nearCrossing = Math.min(
    ...city.roads.vertical.map((rx) => Math.abs(ahead.x - rx)),
    ...city.roads.horizontal.map((ry) => Math.abs(ahead.y - ry)),
  ) < 26;
  if (nearCrossing && car.turnIn <= 0 && random() < 0.35) {
    car.angle += random.pick([-Math.PI / 2, Math.PI / 2]);
    car.turnIn = 2 + random() * 3;
  }
  car.x = ahead.x;
  car.y = ahead.y;
  const held = clampToCity(car.x, car.y, 40);
  car.x = held.x;
  car.y = held.y;
  if (hitsBuilding(city, car.x - 14, car.y - 14, 28, 28)) {
    car.angle += Math.PI / 2;
    car.x = Math.max(40, Math.min(CITY.width - 40, car.x));
    car.y = Math.max(40, Math.min(CITY.height - 40, car.y));
  }
}

/** A pedestrian wanders; when frightened it runs from the threat. */
export function stepPed(city, ped, dt, threat, random) {
  if (ped.fleeing > 0) {
    ped.fleeing -= dt;
    const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 190 * dt;
    ped.y += Math.sin(away) * 190 * dt;
  } else {
    ped.wait -= dt;
    if (ped.wait <= 0) {
      ped.angle = random.range(0, Math.PI * 2);
      ped.wait = 1 + random() * 3;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }
  const held = clampToCity(ped.x, ped.y, 20);
  ped.x = held.x;
  ped.y = held.y;
  if (hitsBuilding(city, ped.x - 6, ped.y - 6, 12, 12)) {
    ped.angle += Math.PI;
  }
}

/** Frighten every pedestrian within range of a point (a punch, a near miss). */
export function scarePeds(peds, x, y, range) {
  for (const ped of peds) {
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < range) ped.fleeing = 2.5;
  }
}

/** Spawn a police car at the edge of the city, aimed at the player. */
export function spawnPoliceCar(city, random, target) {
  const edge = random.pick(['north', 'south', 'east', 'west']);
  let x;
  let y;
  if (edge === 'north') { x = target.x; y = Math.max(60, target.y - 700); }
  else if (edge === 'south') { x = target.x; y = Math.min(CITY.height - 60, target.y + 700); }
  else if (edge === 'east') { x = Math.min(CITY.width - 60, target.x + 700); y = target.y; }
  else { x = Math.max(60, target.x - 700); y = target.y; }
  const point = nearestRoadPoint(city, x, y);
  const car = makeCar(point.x, point.y, Math.atan2(target.y - point.y, target.x - point.x), 'cop');
  car.topSpeed = POLICE.chaseSpeed;
  car.siren = 0;
  car.ramTimer = 0;
  return car;
}

/** A police car steers at the player and rams; returns true when it touches. */
export function stepPoliceCar(car, target, dt) {
  const wantedAngle = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = wantedAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  car.speed = Math.min(car.topSpeed, car.speed + 420 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.siren += dt;
  const held = clampToCity(car.x, car.y, 40);
  car.x = held.x;
  car.y = held.y;
  return Math.hypot(target.x - car.x, target.y - car.y) < 52;
}

/** The nearest drivable car to a point, within range, or null. */
export function nearestCar(cars, x, y, range) {
  let best = null;
  let bestD = range;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** The nearest pedestrian to a point, within range, or null. */
export function nearestPed(peds, x, y, range) {
  let best = null;
  let bestD = range;
  for (const ped of peds) {
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}

export function playerOnFoot() {
  return {
    x: 1440, y: 1200, angle: -Math.PI / 2,
    speed: 0, inCar: null, punchTimer: 0, health: 100,
  };
}

export function carBounds(car) {
  return { x: car.x - car.length / 2, y: car.y - car.width / 2, w: car.length, h: car.width };
}

export function pointInCar(car, x, y) {
  const dx = x - car.x;
  const dy = y - car.y;
  const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
  const across = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
  return Math.abs(along) <= car.length / 2 && Math.abs(across) <= car.width / 2;
}

export function onRoadPoint(city, x, y) {
  return onRoad(city, x, y);
}

export { ON_FOOT };
