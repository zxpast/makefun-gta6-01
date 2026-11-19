// Port Solano's map: a 120 m road grid, six districts, procedural towers
// and the named places the missions point at. Pure data and geometry — no
// DOM, no Three.js — so the sim, the autopilot and the Node screenshot
// painter all share exactly the same city.
import { CITY, DISTRICTS } from './config.js';

const VERTICALS = [60, 180, 300, 420, 540, 660, 780, 900];
const HORIZONTALS = [60, 180, 300, 420, 540];

export function buildCity(random) {
  const buildings = [];
  // One lot per block between four roads; each lot holds 1–3 towers whose
  // height grows toward Downtown, so the skyline reads from anywhere.
  for (let ix = 0; ix < VERTICALS.length - 1; ix += 1) {
    for (let iz = 0; iz < HORIZONTALS.length - 1; iz += 1) {
      const x0 = VERTICALS[ix] + 14;
      const x1 = VERTICALS[ix + 1] - 14;
      const z0 = HORIZONTALS[iz] + 14;
      const z1 = HORIZONTALS[iz + 1] - 14;
      const cx = (VERTICALS[ix] + VERTICALS[ix + 1]) / 2;
      const cz = (HORIZONTALS[iz] + HORIZONTALS[iz + 1]) / 2;
      const downtown = Math.hypot(cx - 720, cz - 120);
      const tall = Math.max(0, 1 - downtown / 520);
      const count = random.int(1, 3);
      for (let k = 0; k < count; k += 1) {
        const w = random.range(16, 34);
        const d = random.range(16, 34);
        buildings.push({
          x: random.range(x0 + w / 2, x1 - w / 2),
          z: random.range(z0 + d / 2, z1 - d / 2),
          w, d,
          h: 8 + random.range(0, 26) + tall * random.range(10, 42),
          shade: random.range(0.75, 1.15),
        });
      }
    }
  }

  const places = {
    garage: { x: 700, z: 300, name: 'Eastside Garage' },
    safehouse: { x: 600, z: 540, name: 'Marina Safehouse' },
    pier: { x: 120, z: 540, name: 'Sunset Pier' },
    docks: { x: 840, z: 540, name: 'The Docks' },
    downtown: { x: 720, z: 180, name: 'Downtown Plaza' },
    hills: { x: 180, z: 60, name: 'North Hills' },
    hospital: { x: 420, z: 180, name: 'Solano General' },
    market: { x: 300, z: 420, name: 'Pier Market' },
  };

  return { verticals: VERTICALS, horizontals: HORIZONTALS, buildings, places };
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  }
  return 'Port Solano';
}

export function nearestVertical(x) {
  let best = VERTICALS[0];
  for (const v of VERTICALS) if (Math.abs(v - x) < Math.abs(best - x)) best = v;
  return best;
}

export function nearestHorizontal(z) {
  let best = HORIZONTALS[0];
  for (const h of HORIZONTALS) if (Math.abs(h - z) < Math.abs(best - h)) best = h;
  return best;
}

export function onRoad(x, z) {
  return Math.abs(x - nearestVertical(x)) <= CITY.roadHalf + 2
    || Math.abs(z - nearestHorizontal(z)) <= CITY.roadHalf + 2;
}

function segmentHitsRect(ax, az, bx, bz, r) {
  // Slab test: does segment AB cross the rectangle, with a 1 m margin?
  const minX = r.x - r.w / 2 - 1;
  const maxX = r.x + r.w / 2 + 1;
  const minZ = r.z - r.d / 2 - 1;
  const maxZ = r.z + r.d / 2 + 1;
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minX || ax > maxX) return false;
  } else {
    let a = (minX - ax) / dx;
    let b = (maxX - ax) / dx;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minZ || az > maxZ) return false;
  } else {
    let a = (minZ - az) / dz;
    let b = (maxZ - az) / dz;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

/** True when no building stands between the two points (2D, height ignored). */
export function hasLineOfSight(city, ax, az, bx, bz) {
  for (const b of city.buildings) {
    if (segmentHitsRect(ax, az, bx, bz, b)) return false;
  }
  return true;
}

function nodeId(ix, iz) { return iz * VERTICALS.length + ix; }

/** Breadth-first route over the intersections, as {x, z} waypoints. */
export function routeBetween(ax, az, bx, bz) {
  const startX = VERTICALS.indexOf(nearestVertical(ax));
  const startZ = HORIZONTALS.indexOf(nearestHorizontal(az));
  const endX = VERTICALS.indexOf(nearestVertical(bx));
  const endZ = HORIZONTALS.indexOf(nearestHorizontal(bz));
  const start = nodeId(startX, startZ);
  const goal = nodeId(endX, endZ);
  const prev = new Map([[start, -1]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    const cx = cur % VERTICALS.length;
    const cz = Math.floor(cur / VERTICALS.length);
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      if (nx < 0 || nx >= VERTICALS.length || nz < 0 || nz >= HORIZONTALS.length) continue;
      const nid = nodeId(nx, nz);
      if (!prev.has(nid)) {
        prev.set(nid, cur);
        queue.push(nid);
      }
    }
  }
  if (!prev.has(goal)) return [{ x: bx, z: bz }];
  const path = [];
  let cur = goal;
  while (cur !== -1) {
    path.push({ x: VERTICALS[cur % VERTICALS.length], z: HORIZONTALS[Math.floor(cur / VERTICALS.length)] });
    cur = prev.get(cur);
  }
  path.reverse();
  const lastNode = path[path.length - 1];
  if (!lastNode || lastNode.x !== bx || lastNode.z !== bz) path.push({ x: bx, z: bz });
  return path;
}

/** Clamp a point into the city and push it out of any building footprint. */
export function resolveCollision(city, x, z, radius) {
  let nx = Math.min(CITY.width - 4, Math.max(4, x));
  let nz = Math.min(CITY.height - 4, Math.max(4, z));
  for (const b of city.buildings) {
    const dx = nx - b.x;
    const dz = nz - b.z;
    const ox = b.w / 2 + radius - Math.abs(dx);
    const oz = b.d / 2 + radius - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) nx = b.x + (dx > 0 ? 1 : -1) * (b.w / 2 + radius);
      else nz = b.z + (dz > 0 ? 1 : -1) * (b.d / 2 + radius);
    }
  }
  return { x: nx, z: nz };
}
