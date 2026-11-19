// Solano Heat — the autopilot. It plays the game itself, by the same rules
// a player uses: it reads the sim's state, follows the road graph to the
// mission waypoint, steals a car when it needs one, brakes for traffic and
// roadblocks, and hides when it has to lose the heat. The demo and the tests
// both drive through this file.

import { CAR, STEP } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createAutopilot(sim, missions) {
  let route = [];
  let routeTarget = null;
  let lastStepType = '';

  function nearestParkedCar(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const car of sim.state.parkedCars) {
      if (!car.parked || car.health <= 0) continue;
      const d = dist(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** A node far from every cop, for losing the heat. */
  function hidingSpot() {
    const p = sim.state.player;
    let best = null;
    let bestScore = -Infinity;
    for (const ax of sim.city.avenues) {
      for (const sz of sim.city.streets) {
        let minD = Infinity;
        for (const cop of sim.state.police) minD = Math.min(minD, dist(ax, sz, cop.x, cop.z));
        const far = dist(ax, sz, p.x, p.z);
        const score = minD + far * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = { x: ax, z: sz };
        }
      }
    }
    return best;
  }

  function refreshRoute(target) {
    const p = sim.state.player;
    if (!target) {
      route = [];
      routeTarget = null;
      return;
    }
    // Keep the route until the target moves or the route runs out. Recomputing
    // on a timer re-snaps to the intersection behind the player and the
    // autopilot ping-pongs between two nodes instead of ever arriving.
    if (routeTarget && dist(target.x, target.z, routeTarget.x, routeTarget.z) < 8 && route.length > 0) return;
    route = sim.city.route(p.x, p.z, target.x, target.z);
    routeTarget = { x: target.x, z: target.z };
  }

  /** The input for one fixed step. */
  function input() {
    const s = sim.state;
    const p = s.player;
    const step = missions.step();
    const stepType = step ? step.type : '';
    if (stepType !== lastStepType) {
      lastStepType = stepType;
      route = [];
      routeTarget = null;
    }

    const out = { throttle: 0, steer: 0, brake: 0, run: false, enter: false, punch: false, shoot: false, nextWeapon: false, nos: false };

    // Losing the heat: drive somewhere the cops cannot see, then stop.
    // Follow the road graph there: driving straight at the spot cuts
    // across blocks and wedges the car against a building face.
    if (stepType === 'loseWanted') {
      if (s.wanted === 0) return out;
      const spot = hidingSpot();
      refreshRoute(spot);
      const node = nextRouteNode();
      const isFinal = route.length <= 1;
      return driveTo(node, out, isFinal);
    }
    // Waiting out a pickup: drive back to the place if the car coasted
    // past it, then stand still inside the waypoint radius.
    if (stepType === 'wait') {
      const wp = missions.waypoint();
      if (wp && dist(p.x, p.z, wp.x, wp.z) > 4) {
        if (p.onFoot) return walkTo(wp.x, wp.z, out);
        refreshRoute(wp);
        const node = nextRouteNode();
        const isFinal = route.length <= 1;
        return driveTo(node, out, isFinal);
      }
      return out;
    }

    const waypoint = missions.waypoint();
    // On foot with far to go: walk the road graph to the nearest parked
    // car and take it. Walking straight at a car cuts across blocks and
    // wedges the player against a building; the route stays on roads.
    if (p.onFoot) {
      if (stepType === 'steal' || (waypoint && dist(p.x, p.z, waypoint.x, waypoint.z) > 30)) {
        const car = nearestParkedCar(p.x, p.z);
        if (car) {
          if (dist(p.x, p.z, car.x, car.z) < CAR.stealRange) {
            out.enter = true;
            return out;
          }
          refreshRoute(car);
          const node = nextRouteNode();
          return walkTo(node ? node.x : car.x, node ? node.z : car.z, out);
        }
      }
      if (waypoint) {
        refreshRoute(waypoint);
        const node = nextRouteNode();
        return walkTo(node ? node.x : waypoint.x, node ? node.z : waypoint.z, out);
      }
      return out;
    }

    // Driving: follow the route to the waypoint.
    if (!waypoint) return out;
    refreshRoute(waypoint);
    const node = nextRouteNode();
    // How sharply the route turns at this node: brake early for a corner
    // instead of arriving at it too fast to stay on the road.
    let turnAhead = 0;
    if (node && route.length > 0) {
      const toNode = Math.atan2(node.x - p.x, node.z - p.z);
      const toAfter = Math.atan2(route[0].x - node.x, route[0].z - node.z);
      turnAhead = angleDiff(toNode, toAfter);
    }
    return driveTo(node, out, false, turnAhead);
  }

  function nextRouteNode() {
    const p = sim.state.player;
    // Skip a node the player has already passed: the next one is nearer.
    while (route.length > 1 && dist(p.x, p.z, route[1].x, route[1].z) < dist(p.x, p.z, route[0].x, route[0].z)) route.shift();
    while (route.length > 1 && dist(p.x, p.z, route[0].x, route[0].z) < 7) route.shift();
    // The last node is the destination itself: only pass it once the car is
    // inside the mission's 5 m waypoint radius, or the car brakes 7 m short
    // and oscillates there forever.
    if (route.length === 1 && dist(p.x, p.z, route[0].x, route[0].z) < 4) route.shift();
    return route.length > 0 ? route[0] : null;
  }

  function walkTo(x, z, out) {
    const p = sim.state.player;
    const want = Math.atan2(x - p.x, z - p.z);
    const turn = angleDiff(p.angle, want);
    out.steer = clamp(turn * 2.2, -1, 1);
    out.throttle = Math.abs(turn) < 1.2 ? 1 : 0.3;
    out.run = true;
    return out;
  }

  /**
   * Drive at `node`. `stopAtNode` means come to a stop there (a hiding spot
   * or a place to wait); otherwise the car drives through, which is how a
   * goto waypoint is reached. The brake is only held while the car is
   * actually moving: the sim's brake also reverses, so holding it at a stop
   * would drive the car backwards away from the node.
   */
  function driveTo(node, out, stopAtNode, turnAhead = 0) {
    const p = sim.state.player;
    if (!node) {
      out.brake = 1;
      return out;
    }
    const want = Math.atan2(node.x - p.x, node.z - p.z);
    const turn = angleDiff(p.angle, want);
    out.steer = clamp(turn * 2.4, -1, 1);
    const d = dist(p.x, p.z, node.x, node.z);
    // Brake for a sharp turn, for traffic ahead, or for the destination.
    let blocked = false;
    const fx = Math.sin(p.angle);
    const fz = Math.cos(p.angle);
    for (const t of sim.state.traffic) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 13 && side < 3.5) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const rb of sim.state.roadblocks) {
        const dx = rb.x - p.x;
        const dz = rb.z - p.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 16 && side < 5) {
          blocked = true;
          break;
        }
      }
    }
    const moving = Math.abs(p.speed) > 0.5;
    if (blocked || (Math.abs(turn) > 1.1 && Math.abs(p.speed) > 7) || (Math.abs(turnAhead) > 0.8 && Math.abs(p.speed) > 10) || (stopAtNode && d < 12)) {
      if (moving) out.brake = 1;
      out.throttle = 0;
    } else {
      out.throttle = 1;
      // Open road, timed job, heat on: burn the NOS.
      if (Math.abs(turn) < 0.25 && Math.abs(p.speed) > 15 && sim.state.garage.nos && sim.state.garage.nosLeft > 0) {
        out.nos = true;
      }
    }
    return out;
  }

  return { input };
}
