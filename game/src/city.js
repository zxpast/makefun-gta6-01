// Port Solano: a road grid, six districts, the buildings that fill the blocks,
// and the road graph the autopilot drives on. Everything is dealt once from
// the seeded random source, so the same seed builds the same city.

import { DISTRICTS, GRID, WORLD } from './config.js';

/** Avenue x coordinates, west to east. */
export const AVENUES = [];
for (let x = GRID.spacing / 2; x < WORLD.width; x += GRID.spacing) AVENUES.push(x);

/** Street z coordinates, north to south. */
export const STREETS = [];
for (let z = GRID.spacing / 2; z < WORLD.height; z += GRID.spacing) STREETS.push(z);

/** Half a road's width, plus the kerb. */
const ROAD_HALF = GRID.roadWidth / 2;

/** A building: a box on the ground, x/z bounds with a height. */
function makeBuilding(rng, x0, z0, x1, z1) {
  return {
    x0,
    z0,
    x1,
    z1,
    h: rng.range(9, 42),
    lit: rng.chance(0.45),
    shade: rng.range(0.82, 1.08),
  };
}

/** Whether the 2D segment (ax,az)-(bx,bz) crosses the building's footprint. */
function segmentHitsBox(ax, az, bx, bz, b) {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, ax - b.x0], [dx, b.x1 - ax], [-dz, az - b.z0], [dz, b.z1 - az]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

export function createCity(rng) {
  const buildings = [];
  // One or two buildings per block, inset from the roads.
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const bx0 = AVENUES[ai] + ROAD_HALF + 2;
      const bx1 = AVENUES[ai + 1] - ROAD_HALF - 2;
      const bz0 = STREETS[si] + ROAD_HALF + 2;
      const bz1 = STREETS[si + 1] - ROAD_HALF - 2;
      const count = rng.int(1, 2);
      if (count === 1) {
        buildings.push(makeBuilding(rng, bx0, bz0, bx1, bz1));
      } else {
        const split = rng.chance(0.5);
        if (split) {
          const mid = (bx0 + bx1) / 2;
          buildings.push(makeBuilding(rng, bx0, bz0, mid - 2, bz1));
          buildings.push(makeBuilding(rng, mid + 2, bz0, bx1, bz1));
        } else {
          const mid = (bz0 + bz1) / 2;
          buildings.push(makeBuilding(rng, bx0, bz0, bx1, mid - 2));
          buildings.push(makeBuilding(rng, bx0, mid + 2, bx1, bz1));
        }
      }
    }
  }

  // Named places the missions and the garage use.
  const places = {
    garage: { name: 'Eastside Garage', x: 760, z: 280 },
    docks: { name: 'The Docks', x: 120, z: 520 },
    northHills: { name: 'North Hills', x: 200, z: 120 },
    pier: { name: 'Sunset Pier', x: 120, z: 360 },
    marina: { name: 'Marina', x: 440, z: 360 },
    downtown: { name: 'Downtown', x: 680, z: 120 },
    eastside: { name: 'Eastside', x: 840, z: 280 },
    safehouse: { name: 'Safehouse', x: 360, z: 200 },
  };

  // Parked cars wait along the roads, just off the driving line.
  const parked = [];
  for (let i = 0; i < 26; i += 1) {
    const onAvenue = rng.chance(0.5);
    if (onAvenue) {
      const x = rng.pick(AVENUES) + rng.pick([-1, 1]) * (ROAD_HALF - 1.2);
      const z = rng.range(60, WORLD.height - 60);
      parked.push({ x, z, angle: rng.pick([0, Math.PI]) });
    } else {
      const z = rng.pick(STREETS) + rng.pick([-1, 1]) * (ROAD_HALF - 1.2);
      const x = rng.range(60, WORLD.width - 60);
      parked.push({ x, z, angle: rng.pick([Math.PI / 2, -Math.PI / 2]) });
    }
  }

  /** The nearest intersection to a point. */
  function nearestNode(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const ax of AVENUES) {
      for (const sz of STREETS) {
        const d = (ax - x) * (ax - x) + (sz - z) * (sz - z);
        if (d < bestD) {
          bestD = d;
          best = { x: ax, z: sz };
        }
      }
    }
    return best;
  }

  /** A breadth-first route along the grid from one point to another. */
  function route(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    const key = (p) => `${p.x},${p.z}`;
    const prev = new Map();
    const seen = new Set([key(start)]);
    const queue = [start];
    // An index, not shift(): shift() re-indexes the whole array on every
    // dequeue, which turns a 96-node BFS quadratic for no reason.
    for (let qi = 0; qi < queue.length; qi += 1) {
      const cur = queue[qi];
      if (cur.x === goal.x && cur.z === goal.z) break;
      const ai = AVENUES.indexOf(cur.x);
      const si = STREETS.indexOf(cur.z);
      const nexts = [];
      if (ai > 0) nexts.push({ x: AVENUES[ai - 1], z: cur.z });
      if (ai < AVENUES.length - 1) nexts.push({ x: AVENUES[ai + 1], z: cur.z });
      if (si > 0) nexts.push({ x: cur.x, z: STREETS[si - 1] });
      if (si < STREETS.length - 1) nexts.push({ x: cur.x, z: STREETS[si + 1] });
      for (const n of nexts) {
        if (seen.has(key(n))) continue;
        seen.add(key(n));
        prev.set(key(n), cur);
        queue.push(n);
      }
    }
    const path = [goal];
    let cur = goal;
    while (!(cur.x === start.x && cur.z === start.z)) {
      const p = prev.get(key(cur));
      if (!p) break;
      path.unshift(p);
      cur = p;
    }
    path.push({ x: toX, z: toZ });
    return path;
  }

  return {
    buildings,
    places,
    parked,
    avenues: AVENUES,
    streets: STREETS,

    /** The district a point sits in. */
    districtAt(x, z) {
      for (const d of DISTRICTS) {
        if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
      }
      return DISTRICTS[0].name;
    },

    /** Whether a point is inside a building's footprint (with padding). */
    inBuilding(x, z, pad = 0) {
      for (const b of buildings) {
        if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
      }
      return false;
    },

    /** Whether any building stands between two points (line of sight). */
    blockedBetween(ax, az, bx, bz) {
      for (const b of buildings) {
        if (segmentHitsBox(ax, az, bx, bz, b)) return true;
      }
      return false;
    },

    /** The nearest point on a road centreline to (x, z). */
    nearestRoadPoint(x, z) {
      let bestX = AVENUES[0];
      let bestD = Infinity;
      for (const ax of AVENUES) {
        const d = Math.abs(ax - x);
        if (d < bestD) {
          bestD = d;
          bestX = ax;
        }
      }
      let bestZ = STREETS[0];
      bestD = Infinity;
      for (const sz of STREETS) {
        const d = Math.abs(sz - z);
        if (d < bestD) {
          bestD = d;
          bestZ = sz;
        }
      }
      const dx = Math.abs(bestX - x);
      const dz = Math.abs(bestZ - z);
      return dx <= dz ? { x: bestX, z } : { x, z: bestZ };
    },

    /** A point ahead of (x, z) along `angle`, snapped onto a road. */
    pointAhead(x, z, angle, distance) {
      const px = x + Math.sin(angle) * distance;
      const pz = z + Math.cos(angle) * distance;
      return this.nearestRoadPoint(
        Math.max(20, Math.min(WORLD.width - 20, px)),
        Math.max(20, Math.min(WORLD.height - 20, pz)),
      );
    },

    nearestNode,
    route,
  };
}
