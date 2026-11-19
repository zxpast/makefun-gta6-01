// Solano Heat — the autopilot. It plays by the same rules as a human: it
// reads the sim, follows the road graph to the current marker, steals a car
// when it has to walk far, and brakes for sharp turns. The demo (?auto=1)
// and the screenshot scenes both use it, so what it does is what a player
// can do.
import { PLAYER } from './config.js';
import { nearestVertical, nearestHorizontal, onRoad, routeBetween } from './city.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dist(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }

export function createAutopilot(sim, missions) {
  let route = [];
  let routeTarget = null;
  let routeAt = -10;
  let roamTarget = null;
  let lastPos = null;
  let lastMoveAt = 0;
  let reverseUntil = 0;

  // Drop leading waypoints the car has already passed: a waypoint counts
  // as passed when the car is close to it, when it sits behind the car's
  // nose, or when the car sits past it along the segment to the next
  // waypoint (within 20 m of the road).
  function pruneRoute() {
    const p = sim.state.player;
    while (route.length > 1) {
      const w0 = route[0];
      const w1 = route[1];
      if (dist(p.x, p.z, w0.x, w0.z) < 5) { route.shift(); continue; }
      const toWX = w0.x - p.x;
      const toWZ = w0.z - p.z;
      const d0 = Math.hypot(toWX, toWZ);
      const fwdX = Math.sin(p.angle);
      const fwdZ = Math.cos(p.angle);
      if (d0 < 30 && (toWX * fwdX + toWZ * fwdZ) / d0 < -0.5) { route.shift(); continue; }
      const segX = w1.x - w0.x;
      const segZ = w1.z - w0.z;
      const segLen2 = segX * segX + segZ * segZ;
      if (segLen2 === 0) { route.shift(); continue; }
      const t = ((p.x - w0.x) * segX + (p.z - w0.z) * segZ) / segLen2;
      const px = w0.x + segX * t;
      const pz = w0.z + segZ * t;
      // Only when the car is also travelling in the segment's direction:
      // a car sitting on the road between two nodes but heading the other
      // way has not passed the far node yet — dropping it would send it
      // on a U-turn into the buildings.
      const segLen = Math.sqrt(segLen2);
      const aligned = (fwdX * segX + fwdZ * segZ) / segLen > 0.3;
      if (t > 0.15 && dist(p.x, p.z, px, pz) < 20 && aligned) { route.shift(); continue; }
      break;
    }
  }

  function targetPoint() {
    const m = sim.state.marker;
    if (m) return { x: m.x, z: m.z };
    if (!roamTarget || dist(sim.state.player.x, sim.state.player.z, roamTarget.x, roamTarget.z) < 20) {
      roamTarget = {
        x: 60 + Math.floor(sim.random.next() * 8) * 120,
        z: 60 + Math.floor(sim.random.next() * 5) * 120,
      };
    }
    return roamTarget;
  }

  function nearestParked() {
    const p = sim.state.player;
    let best = null;
    let bestD = Infinity;
    for (const c of sim.state.parked) {
      const d = dist(p.x, p.z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { car: best, d: bestD };
  }

  function steerToward(x, z, speed) {
    const p = sim.state.player;
    const want = Math.atan2(x - p.x, z - p.z);
    const diff = angleDiff(p.angle, want);
    const steer = clamp(diff * 2.2, -1, 1);
    let throttle = 1;
    if (Math.abs(diff) > 1.1) throttle = 0.25;
    else if (Math.abs(diff) > 0.6) throttle = 0.6;
    // A near U-turn at speed overshoots into walls: brake first. A normal
    // corner only eases off — braking to a stop for every 90-degree turn
    // leaves the car sitting under the cops.
    if (Math.abs(diff) > 2.0 && speed > 8) throttle = -0.7;
    if (speed > 24 && Math.abs(diff) > 0.5) throttle = -0.5;
    return { steer, throttle };
  }

  function input() {
    const s = sim.state;
    const p = s.player;
    const goal = targetPoint();
    const goalDist = dist(p.x, p.z, goal.x, goal.z);
    const base = {
      steer: 0, throttle: 0, run: false, nos: false,
      enter: false, exit: false, shoot: false, weaponSwitch: false,
      radio: false, garage: false, garageBuy: null, ammoBuy: null,
    };

    // On foot: walk to the nearest parked car when the goal is far away or
    // the objective needs a car (steal / repo); otherwise walk to the goal.
    if (p.onFoot) {
      const obj = missions.objective();
      const needCar = obj && (obj.type === 'steal' || obj.type === 'repo');
      let targetCar = null;
      if (obj && obj.type === 'repo') targetCar = sim.state.parked.find((c) => c.marked) ?? null;
      const { car, d } = nearestParked();
      const useCar = targetCar ?? car;
      const useD = targetCar ? dist(p.x, p.z, targetCar.x, targetCar.z) : d;
      if (useD < PLAYER.enterRange) {
        base.enter = true;
        return base;
      }
      const dest = (goalDist > 30 || needCar) && useCar ? { x: useCar.x, z: useCar.z } : goal;
      const want = Math.atan2(dest.x - p.x, dest.z - p.z);
      const diff = angleDiff(p.angle, want);
      base.steer = clamp(diff * 2, -1, 1);
      base.throttle = Math.abs(diff) < 1.4 ? 1 : 0.3;
      base.run = true;
      return base;
    }

    // In a car: get onto a road first, then follow the road route to the goal.
    // Stuck (throttle on, position frozen) means reversing out.
    const now = sim.state.time;
    if (lastPos === null) lastPos = { x: p.x, z: p.z, at: now };
    if (dist(p.x, p.z, lastPos.x, lastPos.z) > 2) lastPos = { x: p.x, z: p.z, at: now };
    if (now - lastPos.at > 2.5) {
      reverseUntil = now + 1.2;
      lastPos = { x: p.x, z: p.z, at: now };
    }
    if (now < reverseUntil) {
      const back = steerToward(p.x - Math.sin(p.angle) * 10, p.z - Math.cos(p.angle) * 10, Math.abs(p.speed));
      base.steer = -back.steer;
      base.throttle = -1;
      return base;
    }
    if (!onRoad(p.x, p.z)) {
      const vx = nearestVertical(p.x);
      const hz = nearestHorizontal(p.z);
      const dest = Math.abs(p.x - vx) < Math.abs(p.z - hz) ? { x: vx, z: p.z } : { x: p.x, z: hz };
      const drive = steerToward(dest.x, dest.z, Math.abs(p.speed));
      base.steer = drive.steer;
      base.throttle = drive.throttle;
      return base;
    }
    // The route is planned once per goal, from a point ahead of the car
    // when it is moving: a route planned from the car's bumper starts with
    // the node behind it and forces a U-turn into the buildings, while
    // one planned from ahead flows around the block. It is NOT refreshed
    // on a timer — a refresh re-adds waypoints the car already passed,
    // and the car turns back for them.
    const key = `${Math.round(goal.x)},${Math.round(goal.z)}`;
    if (routeTarget !== key || route.length === 0) {
      let rx = p.x;
      let rz = p.z;
      if (!p.onFoot && Math.abs(p.speed) > 5) {
        rx = p.x + Math.sin(p.angle) * 30;
        rz = p.z + Math.cos(p.angle) * 30;
      }
      route = routeBetween(rx, rz, goal.x, goal.z);
      routeTarget = key;
      routeAt = sim.state.time;
    }
    while (route.length > 1 && dist(p.x, p.z, route[0].x, route[0].z) < 5) route.shift();
    pruneRoute();
    const wp = route[0] ?? goal;
    const drive = steerToward(wp.x, wp.z, Math.abs(p.speed));
    base.steer = drive.steer;
    base.throttle = drive.throttle;
    // Slow for the turn: a 90-degree corner at full speed overshoots the
    // intersection and the car ends up circling the block. Never raise the
    // throttle here — steerToward may be braking for a U-turn, and forcing
    // a minimum throttle would defeat that brake.
    const wpDist = dist(p.x, p.z, wp.x, wp.z);
    const desired = Math.min(26, 5 + wpDist * 0.6);
    if (Math.abs(p.speed) > desired) base.throttle = -0.7;
    if (goalDist < 12 && Math.abs(p.speed) > 6) base.throttle = -0.6;
    // NOS on a long straight when the mission is timed.
    const obj = missions.objective();
    base.nos = !!obj && obj.seconds !== undefined && Math.abs(drive.steer) < 0.15 && Math.abs(p.speed) > 12;
    return base;
  }

  return { input };
}

// Re-exported for the screenshot painter's road snapping.
export { nearestVertical, nearestHorizontal };
