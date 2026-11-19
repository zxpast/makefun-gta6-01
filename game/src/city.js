// Port Solano's map: a road grid, six districts, procedural buildings, parked cars,
// and the road graph the autopilot routes on. Everything is seeded, so the same seed
// always builds the same city.
import { COLORS, DISTRICTS, PLACES, WORLD } from './config.js';
import { randInt, randPick, randRange } from './random.js';

const ROADS_X = [-400, -240, -80, 80, 240, 400];
const ROADS_Z = [-280, -140, 0, 140, 280];
const BUILDING_COLORS = [COLORS.buildingA, COLORS.buildingB, COLORS.buildingC, COLORS.buildingD];

function nodeId(ix, iz) {
  return `${ix},${iz}`;
}

export function createCity(random) {
  const buildings = [];
  const parked = [];
  const carColors = ['#c23b3b', '#3b6bc2', '#3bc26b', '#c2a13b', '#8a3bc2', '#c2c2c2', '#2b2b2b'];

  // One or two buildings per block, kept clear of the roads by a sidewalk margin.
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iz = 0; iz < ROADS_Z.length - 1; iz += 1) {
      const x0 = ROADS_X[ix] + 12;
      const x1 = ROADS_X[ix + 1] - 12;
      const z0 = ROADS_Z[iz] + 12;
      const z1 = ROADS_Z[iz + 1] - 12;
      const count = randInt(random, 1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = randRange(random, 24, Math.max(26, (x1 - x0) / count - 8));
        const d = randRange(random, 24, Math.max(26, z1 - z0 - 16));
        const x = x0 + ((x1 - x0 - w) * (count === 1 ? 0.5 : b / (count - 1 || 1))) + w / 2;
        const z = z0 + d / 2 + randRange(random, 0, Math.max(0, z1 - z0 - d));
        buildings.push({
          x, z, w, d,
          h: randRange(random, 8, 42),
          color: randPick(random, BUILDING_COLORS),
          neon: random() < 0.3,
        });
      }
    }
  }

  // One car is always parked by the safehouse, a short walk from the spawn — the
  // first ride is minutes away, not a hike across the city.
  parked.push({ x: -74.5, z: -60, angle: 0, color: '#c23b3b' });

  // Parked cars along the road edges: the ones worth stealing.
  for (let n = 0; n < 24; n += 1) {
    const vertical = random() < 0.5;
    if (vertical) {
      parked.push({
        x: randPick(random, ROADS_X) + (random() < 0.5 ? -5.5 : 5.5),
        z: randRange(random, -280, 280),
        angle: random() < 0.5 ? 0 : Math.PI,
        color: randPick(random, carColors),
      });
    } else {
      parked.push({
        x: randRange(random, -400, 400),
        z: randPick(random, ROADS_Z) + (random() < 0.5 ? -5.5 : 5.5),
        angle: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2,
        color: randPick(random, carColors),
      });
    }
  }

  // The road graph: intersections are nodes, road stretches are edges.
  const nodes = new Map();
  for (let ix = 0; ix < ROADS_X.length; ix += 1) {
    for (let iz = 0; iz < ROADS_Z.length; iz += 1) {
      nodes.set(nodeId(ix, iz), { x: ROADS_X[ix], z: ROADS_Z[iz], ix, iz });
    }
  }
  const neighbours = new Map();
  for (const [id, node] of nodes) {
    const list = [];
    const at = (ix, iz) => nodes.get(nodeId(ix, iz));
    if (at(node.ix - 1, node.iz)) list.push(at(node.ix - 1, node.iz));
    if (at(node.ix + 1, node.iz)) list.push(at(node.ix + 1, node.iz));
    if (at(node.ix, node.iz - 1)) list.push(at(node.ix, node.iz - 1));
    if (at(node.ix, node.iz + 1)) list.push(at(node.ix, node.iz + 1));
    neighbours.set(id, list);
  }

  function nearestNode(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const node of nodes.values()) {
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  /** Breadth-first route between two points, as road waypoints (no U-turns in the middle). */
  function route(fromX, fromZ, toX, toZ) {
    // A clear straight line beats the road graph: drive directly when no
    // building stands in the way (checked with the car's own radius).
    const len = Math.hypot(toX - fromX, toZ - fromZ);
    const steps = Math.ceil(len / 2);
    let clear = true;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (insideBuilding(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t, 2.5) !== null) {
        clear = false;
        break;
      }
    }
    if (clear) return [{ x: toX, z: toZ }];
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    // Even when the trip starts and ends at the same intersection, route through
    // it first: a straight line from an off-road position to the target can cut
    // through a building, and the road is always clear.
    if (start === goal) return [{ x: start.x, z: start.z }, { x: toX, z: toZ }];
    const prev = new Map([[nodeId(start.ix, start.iz), null]]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of neighbours.get(nodeId(cur.ix, cur.iz))) {
        const id = nodeId(next.ix, next.iz);
        if (!prev.has(id)) {
          prev.set(id, cur);
          queue.push(next);
        }
      }
    }
    const path = [];
    let cur = goal;
    while (cur !== null) {
      path.unshift({ x: cur.x, z: cur.z });
      cur = prev.get(nodeId(cur.ix, cur.iz)) ?? null;
    }
    path.push({ x: toX, z: toZ });
    return path;
  }

  /** The closest point on any road centreline. */
  function nearestRoadPoint(x, z) {
    let bestX = ROADS_X[0];
    let bestD = Infinity;
    for (const rx of ROADS_X) {
      const d = Math.abs(x - rx);
      if (d < bestD) {
        bestD = d;
        bestX = rx;
      }
    }
    let bestZ = ROADS_Z[0];
    bestD = Infinity;
    for (const rz of ROADS_Z) {
      const d = Math.abs(z - rz);
      if (d < bestD) {
        bestD = d;
        bestZ = rz;
      }
    }
    return Math.abs(x - bestX) < Math.abs(z - bestZ) ? { x: bestX, z } : { x, z: bestZ };
  }

  function districtAt(x, z) {
    for (const d of DISTRICTS) {
      if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
    }
    return 'Port Solano';
  }

  function insideBuilding(x, z, pad) {
    for (const b of buildings) {
      if (x > b.x - b.w / 2 - pad && x < b.x + b.w / 2 + pad && z > b.z - b.d / 2 - pad && z < b.z + b.d / 2 + pad) return b;
    }
    return null;
  }

  /** True when a building stands between two points (police line of sight). */
  function segmentBlocked(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len === 0) return false;
    const steps = Math.ceil(len / 2);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (insideBuilding(x1 + dx * t, z1 + dz * t, 0.4) !== null) return true;
    }
    return false;
  }

  return {
    roadsX: ROADS_X,
    roadsZ: ROADS_Z,
    buildings,
    parked,
    places: PLACES,
    route,
    nearestRoadPoint,
    nearestNode,
    districtAt,
    insideBuilding,
    segmentBlocked,
  };
}
