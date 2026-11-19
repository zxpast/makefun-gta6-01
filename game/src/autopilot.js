// The driver that plays the game itself: it follows the missions' current target along
// the road graph, steals a car when it needs one, and brakes for the corners. It reads
// only the sim's public state, the same way a player reads the screen.
import { CAR } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createAutopilot(sim, missions) {
  let route = [];
  let routeTarget = null;
  let stuckTimer = 0;
  let reversing = 0;
  let lastX = 0;
  let lastZ = 0;

  function refreshRoute(target) {
    const p = sim.state.player;
    route = sim.city.route(p.x, p.z, target.x, target.z);
    routeTarget = { x: target.x, z: target.z };
  }

  function nearestParked() {
    const p = sim.state.player;
    let best = null;
    let bestD = Infinity;
    for (const car of sim.city.parked) {
      const d = (car.x - p.x) ** 2 + (car.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function input() {
    const out = {
      fwd: false, back: false, left: false, right: false, run: false, nos: false,
      punch: false, shoot: false, enter: false, weaponCycle: false, radioNext: false,
    };
    const p = sim.state.player;
    const target = missions.target();
    if (target === null) return out;

    // On foot: if a parked car is right here, take it — whatever the mission is.
    if (p.onFoot) {
      const parked = nearestParked();
      if (parked !== null && Math.hypot(parked.x - p.x, parked.z - p.z) < 3) {
        out.enter = true;
        return out;
      }
      const missionD = Math.hypot(target.x - p.x, target.z - p.z);
      const dest = parked !== null && missionD > 10 ? { x: parked.x, z: parked.z } : target;
      // Walk the road route to the destination, the same way the car drives it —
      // a straight line across the blocks gets stuck on buildings.
      if (routeTarget === null || Math.hypot(routeTarget.x - dest.x, routeTarget.z - dest.z) > 1 || route.length === 0) {
        refreshRoute(dest);
      }
      while (route.length > 1 && Math.hypot(route[0].x - p.x, route[0].z - p.z) < 4) route.shift();
      const next = route[0] ?? dest;
      const want = Math.atan2(next.x - p.x, next.z - p.z);
      const diff = angleDiff(p.angle, want);
      out.left = diff < -0.15;
      out.right = diff > 0.15;
      out.fwd = Math.abs(diff) < 1.2;
      out.run = true;
      return out;
    }

    // In a car: follow the route to the target, one waypoint at a time.
    if (routeTarget === null || Math.hypot(routeTarget.x - target.x, routeTarget.z - target.z) > 1 || route.length === 0) {
      refreshRoute(target);
    }
    while (route.length > 1 && Math.hypot(route[0].x - p.x, route[0].z - p.z) < 6) route.shift();
    const next = route[0];
    if (next === undefined) return out;
    const d = Math.hypot(next.x - p.x, next.z - p.z);
    const want = Math.atan2(next.x - p.x, next.z - p.z);
    const diff = angleDiff(p.angle, want);

    // The last waypoint is the mission target itself: once close, creep onto it
    // and stop there instead of circling through it, or a wait step can never
    // count its seconds — and a goto step needs the player inside its 6 m radius.
    // (Far out, the final leg is driven at full speed like any other.)
    if (route.length === 1 && d < 12) {
      if (d < 3) {
        out.back = p.speed > 1;
        return out;
      }
      out.fwd = p.speed < 4;
      out.back = p.speed > 6;
      out.left = diff < -0.12;
      out.right = diff > 0.12;
      return out;
    }

    // Stuck against something: back up briefly, then try again.
    const moved = Math.hypot(p.x - lastX, p.z - lastZ);
    lastX = p.x;
    lastZ = p.z;
    if (Math.abs(p.speed) < 0.6 && d > 8) {
      stuckTimer += 1 / 60;
      if (stuckTimer > 1.5) {
        reversing = 0.8;
        stuckTimer = 0;
      }
    } else {
      stuckTimer = 0;
    }
    if (reversing > 0) {
      reversing -= 1 / 60;
      out.back = true;
      out.left = diff > 0;
      out.right = diff < 0;
      return out;
    }

    out.left = diff < -0.12;
    out.right = diff > 0.12;
    const corner = Math.abs(diff) > 0.7;
    if (Math.abs(diff) > 2.4) {
      out.back = true;
    } else if (corner || d < 12) {
      // Corners are taken at speed, not crawled: the car turns fast enough for
      // 20 m/s through an intersection, and only brakes above that.
      out.fwd = p.speed < 20;
      out.back = p.speed > 24;
    } else {
      out.fwd = true;
      out.nos = Math.abs(diff) < 0.2 && p.speed > 18;
    }
    return out;
  }

  return { input };
}
