// Port Solano, built from a seed: an 80-metre road grid over a 960 by 640
// metre map, six districts, and one or two seeded buildings per block with
// a height that fits its district. The same seed always builds the same
// city. This module only answers where things are — which district a point
// is in, whether it is on asphalt, which buildings stand in the way, and
// the road graph the traffic and the autopilot drive on. No drawing here,
// no browser in here.
import { CITY, DISTRICTS } from './config.js';
import { pick, range, rangeInt } from './random.js';

export const MARKERS = {
  // Every marker sits on a road line (roads run every 80 m at x/z =
  // 80, 160, 240, ...), never inside a block: a marker in a block is
  // unreachable behind building walls.
  safehouse: { x: 160, z: 400, label: 'Safehouse' },
  eastsideGarage: { x: 800, z: 160, label: 'Eastside Garage' },
  docksPickup: { x: 720, z: 560, label: 'Docks Pickup' },
  northHillsDrop: { x: 160, z: 80, label: 'North Hills Drop' },
  downtownPickup: { x: 400, z: 160, label: 'Downtown Pickup' },
  marinaDrop: { x: 480, z: 560, label: 'Marina Drop' },
  sunsetPier: { x: 80, z: 480, label: 'Sunset Pier' },
  turfWest: { x: 80, z: 160, label: 'Turf: Overlook' },
  turfNorth: { x: 160, z: 80, label: 'Turf: Hills' },
  turfEast: { x: 240, z: 160, label: 'Turf: Ridge' },
  hospital: { x: 480, z: 240, label: 'Hospital' },
  pierEnd: { x: 80, z: 560, label: 'Pier End' },
};

export function createCity(random) {
  const vertical = [];
  const horizontal = [];
  for (let x = CITY.roadGap; x < CITY.width; x += CITY.roadGap) vertical.push(x);
  for (let z = CITY.roadGap; z < CITY.height; z += CITY.roadGap) horizontal.push(z);

  // Intersections of the grid, as the nodes of the road graph.
  const nodes = [];
  for (const x of vertical) {
    for (const z of horizontal) nodes.push({ x, z });
  }
  // Edge roads along the map border, so the graph reaches every district.
  for (const x of [0, CITY.width]) {
    for (const z of horizontal) nodes.push({ x, z });
  }
  for (const z of [0, CITY.height]) {
    for (const x of vertical) nodes.push({ x, z });
  }

  const buildings = [];
  const halfRoad = CITY.roadWidth / 2;
  const cols = Math.floor(CITY.width / CITY.roadGap);
  const rows = Math.floor(CITY.height / CITY.roadGap);
  for (let bx = 0; bx < cols; bx += 1) {
    for (let bz = 0; bz < rows; bz += 1) {
      const blockX = bx * CITY.roadGap + halfRoad + CITY.blockMargin;
      const blockZ = bz * CITY.roadGap + halfRoad + CITY.blockMargin;
      const blockW = CITY.roadGap - CITY.roadWidth - CITY.blockMargin * 2;
      const blockH = CITY.roadGap - CITY.roadWidth - CITY.blockMargin * 2;
      const centreX = blockX + blockW / 2;
      const centreZ = blockZ + blockH / 2;
      const district = districtAt(centreX, centreZ) || DISTRICTS[0];
      const count = rangeInt(random, 1, 2);
      for (let n = 0; n < count; n += 1) {
        const w = range(random, 14, Math.max(15, blockW * 0.55));
        const h = range(random, 14, Math.max(15, blockH * 0.55));
        const x = blockX + range(random, 0, Math.max(0.5, blockW - w));
        const z = blockZ + range(random, 0, Math.max(0.5, blockH - h));
        buildings.push({
          x, z, w, h,
          height: range(random, district.minH, district.maxH),
          shade: pick(random, ['a', 'b', 'c']),
          neon: random() < 0.22,
        });
      }
    }
  }

  const parks = [{ x: 400, z: 40, w: 60, h: 56 }];
  const water = { x: 0, z: CITY.height - 24, w: 320, h: 24 };
  const pier = { x: 24, z: 480, w: 48, h: 160 };
  return {
    roads: { vertical, horizontal },
    nodes,
    buildings,
    parks,
    water,
    pier,
    halfRoad,
    districts: DISTRICTS,
  };
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && z >= d.z && z < d.z + d.h) return d;
  }
  return null;
}

export function districtNameAt(x, z) {
  const d = districtAt(x, z);
  return d ? d.name : 'Port Solano';
}

export function onRoad(city, x, z) {
  const half = city.halfRoad;
  for (const rx of city.roads.vertical) if (Math.abs(x - rx) <= half) return true;
  for (const rz of city.roads.horizontal) if (Math.abs(z - rz) <= half) return true;
  return false;
}

// The nearest point on a road centre line, for snapping cars onto roads.
export function nearestRoadPoint(city, x, z) {
  let bestX = x;
  let bestD = Infinity;
  for (const rx of city.roads.vertical) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; bestX = rx; }
  }
  let bestZ = z;
  let bestDz = Infinity;
  for (const rz of city.roads.horizontal) {
    const d = Math.abs(z - rz);
    if (d < bestDz) { bestDz = d; bestZ = rz; }
  }
  return bestD <= bestDz ? { x: bestX, z } : { x, z: bestZ };
}

// The building a rectangle overlaps, or null. Walls are solid.
export function hitsBuilding(city, x, z, w, h) {
  for (const b of city.buildings) {
    if (x < b.x + b.w && x + w > b.x && z < b.z + b.h && z + h > b.z) return b;
  }
  return null;
}

// A straight line of sight between two points is blocked by any building
// whose footprint the segment crosses (sampled every 4 metres).
export function lineBlocked(city, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (hitsBuilding(city, x - 0.5, z - 0.5, 1, 1)) return true;
  }
  return false;
}

export function clampToCity(x, z, margin) {
  return {
    x: Math.min(CITY.width - margin, Math.max(margin, x)),
    z: Math.min(CITY.height - margin, Math.max(margin, z)),
  };
}

// Breadth-first route over the road graph from (sx, sz) to (tx, tz).
// Returns a list of {x, z} waypoints, or an empty list when already there.
export function routeOnRoads(city, sx, sz, tx, tz) {
  const start = nearestNode(city, sx, sz);
  const goal = nearestNode(city, tx, tz);
  // Node indices are numbers and 0 is a valid node — test for -1, not falsy.
  if (start === -1 || goal === -1) return [];
  if (start === goal) return [{ x: tx, z: tz }];
  const prev = new Map();
  const queue = [start];
  prev.set(start, null);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of neighbours(city, cur)) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  if (!prev.has(goal)) return [{ x: tx, z: tz }];
  const path = [];
  let cur = goal;
  while (cur !== null) {
    path.unshift(city.nodes[cur]);
    cur = prev.get(cur);
  }
  path.push({ x: tx, z: tz });
  return path;
}

function nearestNode(city, x, z) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i += 1) {
    const n = city.nodes[i];
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function neighbours(city, index) {
  const n = city.nodes[index];
  const out = [];
  for (let i = 0; i < city.nodes.length; i += 1) {
    if (i === index) continue;
    const m = city.nodes[i];
    const dx = Math.abs(m.x - n.x);
    const dz = Math.abs(m.z - n.z);
    // Adjacent along the same road line, one gap apart.
    if ((dx === CITY.roadGap && dz === 0) || (dz === CITY.roadGap && dx === 0)) out.push(i);
    // Border nodes connect to the nearest grid intersection.
    if ((n.x === 0 || n.x === CITY.width || n.z === 0 || n.z === CITY.height)
      && ((dx === CITY.roadGap && dz === 0) || (dz === CITY.roadGap && dx === 0))) out.push(i);
  }
  return out;
}
