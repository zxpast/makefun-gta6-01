// Solano Heat — the screenshot scenes behind ?shot=start|drive|chase|mission.
//
// Each one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a simple autopilot (walk to the nearest parked car and
// steal it, then drive toward a waypoint with the throttle down and the
// steering chasing the bearing), so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { CAR, CITY, STEP } from './config.js';
import { MARKERS } from './city.js';
import { ACTION_ENTER_CAR } from './input.js';
import { CHAPTERS } from './missions.js';
import { spawnPoliceCar } from './entities.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 12;
const CHASE_SECONDS = 5;
const MISSION_SECONDS = 2;

function angleDiff(want, have) {
  let d = want - have;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** On foot: run toward a point. */
function walkToward(world, tx, ty) {
  const p = world.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { move: { x: dx / len, y: dy / len }, running: true, actions: 0 };
}

/** In a car: full throttle, steering chasing the bearing to the target. */
function driveToward(world, tx, ty) {
  const car = world.state.player.inCar;
  if (!car) return { move: { x: 0, y: 0 }, running: false, actions: 0 };
  const want = Math.atan2(ty - car.y, tx - car.x);
  const err = angleDiff(want, car.angle);
  const steer = err > 0.15 ? 1 : err < -0.15 ? -1 : 0;
  const dist = Math.hypot(tx - car.x, ty - car.y);
  return { move: { x: steer, y: dist > 120 ? -1 : 0 }, running: false, actions: 0 };
}

/** The nearest road line to a coordinate (roads run every roadGap pixels). */
function nearestRoadCoord(value, max) {
  const k = Math.round(value / CITY.roadGap);
  return Math.max(CITY.roadGap, Math.min(max - CITY.roadGap, k * CITY.roadGap));
}

/**
 * Waypoints along the road grid from a point to a target: reach the nearest
 * road, travel along it to the target's road, travel along that road to the
 * target's corner, then finish at the target itself. Every leg runs along a
 * road — a beeline between two road points would cut diagonally across the
 * block between them and straight into its buildings. Legs are split into
 * short hops (no more than a block apart) so the car always steers at a
 * nearby point: aiming at a far waypoint lets a small sideways drift grow,
 * and the car ends up scraping the buildings beside the road.
 */
function roadRoute(fromX, fromY, toX, toY) {
  const vx = nearestRoadCoord(fromX, CITY.width);
  const hy = nearestRoadCoord(fromY, CITY.height);
  const tx = nearestRoadCoord(toX, CITY.width);
  const ty = nearestRoadCoord(toY, CITY.height);
  const corners = Math.abs(fromX - vx) <= Math.abs(fromY - hy)
    ? [{ x: vx, y: fromY }, { x: vx, y: ty }, { x: tx, y: ty }, { x: toX, y: toY }]
    : [{ x: fromX, y: hy }, { x: tx, y: hy }, { x: tx, y: ty }, { x: toX, y: toY }];
  const points = [];
  let px = fromX;
  let py = fromY;
  for (const corner of corners) {
    const leg = Math.hypot(corner.x - px, corner.y - py);
    const hops = Math.max(1, Math.ceil(leg / (CITY.roadGap / 2)));
    for (let h = 1; h <= hops; h += 1) {
      points.push({ x: px + ((corner.x - px) * h) / hops, y: py + ((corner.y - py) * h) / hops });
    }
    px = corner.x;
    py = corner.y;
  }
  return points;
}

/**
 * A driver that follows a road route: full throttle on the straights, coasting
 * through sharp turns so they stay tight, and a short reverse when wedged
 * against a building for more than a moment.
 */
function createDriver(world, toX, toY) {
  let route = null;
  let stuckTimer = 0;
  let reverseTimer = 0;
  return function drive() {
    const car = world.state.player.inCar;
    if (!car) return { move: { x: 0, y: 0 }, running: false, actions: 0 };
    if (!route) route = roadRoute(car.x, car.y, toX, toY);
    if (route.length === 0) return { move: { x: 0, y: 0 }, running: false, actions: 0 };
    // A tight arrival radius: the first waypoint pulls the car onto the road
    // centre, and a wide one would let it skip that and scrape the buildings
    // lining the road for the whole leg.
    if (Math.hypot(route[0].x - car.x, route[0].y - car.y) < 40) {
      route.shift();
      if (route.length === 0) return { move: { x: 0, y: 0 }, running: false, actions: 0 };
    }
    const want = Math.atan2(route[0].y - car.y, route[0].x - car.x);
    const err = angleDiff(want, car.angle);
    const steer = err > 0.08 ? 1 : err < -0.08 ? -1 : 0;
    // The world's steering flips when the car moves backwards, so the wheel
    // has to flip too — otherwise the nose swings away from the target.
    const wheel = car.speed < 0 ? -steer : steer;
    if (reverseTimer > 0) {
      reverseTimer -= STEP;
      return { move: { x: wheel, y: 1 }, running: false, actions: 0 };
    }
    if (Math.abs(car.speed) < 40) {
      stuckTimer += STEP;
      if (stuckTimer > 0.8) {
        stuckTimer = 0;
        reverseTimer = 0.6;
      }
    } else {
      stuckTimer = 0;
    }
    // How sharp is the next real turn in the route, and how far away is it?
    // Brake early for corners — a 90-degree turn at full speed runs straight
    // into the buildings lining the road.
    let cornerDist = Infinity;
    let cornerSharp = false;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const legA = Math.atan2(b.y - a.y, b.x - a.x);
      const legB = i + 2 < route.length
        ? Math.atan2(route[i + 2].y - b.y, route[i + 2].x - b.x)
        : legA;
      if (Math.abs(angleDiff(legB, legA)) > 0.5) {
        cornerDist = Math.hypot(b.x - car.x, b.y - car.y);
        cornerSharp = true;
        break;
      }
    }
    let throttle;
    if (cornerSharp && cornerDist < 320 && Math.abs(car.speed) > 40) {
      throttle = car.speed >= 0 ? 1 : -1; // brake toward a stop for the corner
    } else if (Math.abs(err) > 1.8 && Math.abs(car.speed) > 40) {
      throttle = car.speed >= 0 ? 1 : -1; // brake hard for a U-turn, then swing round at a crawl
    } else if (Math.abs(car.speed) < 60 && Math.abs(err) > 1.2) {
      throttle = 1; // back up to swing the nose round
    } else if (Math.abs(err) > 0.6) {
      throttle = 0; // coast through the turn
    } else {
      throttle = -1; // flat out on the straight
    }
    return { move: { x: wheel, y: throttle }, running: false, actions: 0 };
  };
}

/** Steal the nearest parked car (up to 15 s of walking for it), then drive at the target for `seconds`. */
function stealAndDrive(world, tx, ty, seconds) {
  for (let i = 0; i < Math.floor(15 / STEP); i += 1) {
    const player = world.state.player;
    if (player.inCar) break;
    const car = world.state.cars.find((c) => c.parked);
    if (!car) break;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    const input = d < CAR.stealRange
      ? { move: { x: 0, y: 0 }, running: false, actions: ACTION_ENTER_CAR }
      : walkToward(world, car.x, car.y);
    world.step(STEP, input);
  }
  const total = Math.floor(seconds / STEP);
  const drive = createDriver(world, tx, ty);
  for (let i = 0; i < total; i += 1) {
    world.step(STEP, drive());
  }
}

function extraFor(world) {
  const missions = world.state.missions;
  return {
    objective: world.objective(),
    step: world.currentStepInfo(),
    marker: world.marker(),
    timedLeft: missions.stepTimer,
    heldSeconds: missions.stepHeld,
    chapters: CHAPTERS,
    chapterIndex: missions.chapter,
    completed: missions.completed,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the HUD values to show. Any name other than drive/chase/mission is start.
 */
export function stageShot(name, world) {
  world.state.demo = false;
  world.reset();
  if (name === 'drive') {
    // Chapter 1: steal a car and drive it to the chapter's own target, so the
    // car on screen matches the objective line in the HUD.
    const driveStep = CHAPTERS[0].steps.find((s) => s.marker);
    const marker = driveStep ? MARKERS[driveStep.marker] : MARKERS.docksPickup;
    stealAndDrive(world, marker.x, marker.y, DRIVE_SECONDS);
    return { screen: SCREEN_PLAY, extra: extraFor(world) };
  }
  if (name === 'chase') {
    stealAndDrive(world, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.y, 6);
    world.state.wanted = 4;
    world.state.police.push(spawnPoliceCar(world.state.city, world.state.random, world.state.player));
    const chase = createDriver(world, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.y);
    const total = Math.floor(CHASE_SECONDS / STEP);
    for (let i = 0; i < total; i += 1) {
      world.step(STEP, chase());
    }
    return { screen: SCREEN_PLAY, extra: extraFor(world) };
  }
  if (name === 'mission') {
    // The Midnight Run, mid-flight: Lucia has the package, the 75 s clock is
    // running, and the North Hills drop is the marker on the map. Six seconds
    // of driving puts her about two thirds of the way there, still moving.
    stealAndDrive(world, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.y, 0);
    world.state.missions.chapter = 5;
    world.state.missions.step = 1;
    const run = createDriver(world, MARKERS.northHillsDrop.x, MARKERS.northHillsDrop.y);
    const total = Math.floor(MISSION_SECONDS / STEP);
    for (let i = 0; i < total; i += 1) {
      world.step(STEP, run());
    }
    return { screen: SCREEN_PLAY, extra: extraFor(world) };
  }
  world.state.demo = true;
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null);
  return { screen: SCREEN_TITLE, extra: extraFor(world) };
}
