// Solano Bay: the city itself, as data. Streets run on a square grid, nine
// intersections a side, and the sixteen districts sit on it in a four-by-four
// board. Nothing here touches the renderer: it hands out positions, boxes
// and names, and render.js turns them into meshes. The layout is seeded, so
// the same seed always builds the same streets.

import { makeRng, range, rangeInt, pick } from './rng.js';

export const BLOCK = 60;
export const ROAD = 14;
export const PITCH = BLOCK + ROAD;
export const BLOCKS = 8;
export const HALF = (BLOCKS * PITCH) / 2;

export const DISTRICTS = [
  { name: 'Aldergate', tint: 0x8a6f4d, low: 14, high: 34 },
  { name: 'Breakwater', tint: 0x4d7a8a, low: 10, high: 26 },
  { name: 'Cinder Wharf', tint: 0x7a5a4d, low: 12, high: 30 },
  { name: 'Driftwood', tint: 0x6f8a5a, low: 8, high: 22 },
  { name: 'Ember Row', tint: 0x8a4d3d, low: 16, high: 40 },
  { name: 'Fairmont', tint: 0x9a8a6a, low: 18, high: 46 },
  { name: 'Gullwing', tint: 0x5a7a9a, low: 12, high: 28 },
  { name: 'Harbor Steps', tint: 0x4d6a7a, low: 10, high: 24 },
  { name: 'Ironmarket', tint: 0x6a6a6a, low: 14, high: 38 },
  { name: 'Jubilee', tint: 0x8a7a3d, low: 12, high: 32 },
  { name: 'Keystone', tint: 0x7a6a8a, low: 20, high: 52 },
  { name: 'Lantern Row', tint: 0x9a5a5a, low: 10, high: 26 },
  { name: 'Mainsail', tint: 0x3d7a6a, low: 12, high: 30 },
  { name: 'Northbank', tint: 0x5a5a7a, low: 16, high: 44 },
  { name: 'Orchid Row', tint: 0x8a5a7a, low: 10, high: 24 },
  { name: 'Pelican Court', tint: 0x6a8a7a, low: 14, high: 36 },
];

// Intersection (i, j) in world units. i and j run 0..8, streets included.
export function intersection(i, j) {
  return { x: -HALF + i * PITCH + ROAD / 2, z: -HALF + j * PITCH + ROAD / 2 };
}

export function nearestIntersection(x, z) {
  const i = Math.max(0, Math.min(BLOCKS, Math.round((x + HALF - ROAD / 2) / PITCH)));
  const j = Math.max(0, Math.min(BLOCKS, Math.round((z + HALF - ROAD / 2) / PITCH)));
  return { i, j, ...intersection(i, j) };
}

export function districtAt(x, z) {
  const col = Math.max(0, Math.min(3, Math.floor((x + HALF) / (PITCH * 2))));
  const row = Math.max(0, Math.min(3, Math.floor((z + HALF) / (PITCH * 2))));
  return DISTRICTS[row * 4 + col];
}

export function districtCenter(index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: -HALF + col * PITCH * 2 + PITCH,
    z: -HALF + row * PITCH * 2 + PITCH,
  };
}

// Build the whole city from a seed: one building list, one shop list.
export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  for (let bx = 0; bx < BLOCKS; bx += 1) {
    for (let bz = 0; bz < BLOCKS; bz += 1) {
      const district = districtAt(-HALF + bx * PITCH + PITCH / 2, -HALF + bz * PITCH + PITCH / 2);
      const count = rangeInt(rng, 1, 4);
      for (let k = 0; k < count; k += 1) {
        const w = range(rng, 16, 34);
        const d = range(rng, 16, 34);
        const x = -HALF + bx * PITCH + ROAD + w / 2 + rng() * (BLOCK - w);
        const z = -HALF + bz * PITCH + ROAD + d / 2 + rng() * (BLOCK - d);
        const h = range(rng, district.low, district.high);
        buildings.push({
          x, z, w, d, h,
          tint: district.tint,
          shade: 0.95 + rng() * 0.35,
          district: district.name,
        });
      }
    }
  }
  const shops = [
    { kind: 'weapons', name: 'Ironmarket Arms', ...intersection(2, 6) },
    { kind: 'health', name: 'Fairmont Clinic', ...intersection(6, 2) },
    { kind: 'paint', name: 'Lantern Row Customs', ...intersection(6, 6) },
  ];
  const safehouses = [
    { name: 'Driftwood Safehouse', ...intersection(1, 1) },
    { name: 'Northbank Safehouse', ...intersection(7, 1) },
  ];
  const garage = { name: 'Aldergate Garage', ...intersection(4, 4) };
  const start = { ...intersection(4, 7), heading: Math.PI };
  return { buildings, shops, safehouses, garage, start, seed };
}

// True when the circle at (x, z) with radius r overlaps any building box.
export function hitsBuilding(city, x, z, r) {
  for (const b of city.buildings) {
    const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
    if (dx * dx + dz * dz < r * r) return b;
  }
  return null;
}

// Push a circle out of whatever building it overlaps. Returns true on a hit.
export function resolveBuilding(city, body) {
  const b = hitsBuilding(city, body.x, body.z, body.radius);
  if (!b) return false;
  const dx = body.x - b.x;
  const dz = body.z - b.z;
  const px = b.w / 2 + body.radius - Math.abs(dx);
  const pz = b.d / 2 + body.radius - Math.abs(dz);
  if (px < pz) body.x = b.x + Math.sign(dx || 1) * (b.w / 2 + body.radius);
  else body.z = b.z + Math.sign(dz || 1) * (b.d / 2 + body.radius);
  return true;
}

// Line-of-sight between two ground points, sampled against building boxes.
export function hasLineOfSight(city, ax, az, bx, bz) {
  const steps = 12;
  for (let s = 1; s < steps; s += 1) {
    const x = ax + ((bx - ax) * s) / steps;
    const z = az + ((bz - az) * s) / steps;
    if (hitsBuilding(city, x, z, 1.5)) return false;
  }
  return true;
}

// A short route along the grid from one intersection to another.
export function routeBetween(a, b) {
  const points = [];
  let { i, j } = a;
  while (i !== b.i) {
    i += Math.sign(b.i - i);
    points.push(intersection(i, j));
  }
  while (j !== b.j) {
    j += Math.sign(b.j - j);
    points.push(intersection(i, j));
  }
  return points;
}

// A random intersection on the grid, for traffic starts and side jobs.
export function randomIntersection(rng) {
  return intersection(Math.floor(rng() * (BLOCKS + 1)), Math.floor(rng() * (BLOCKS + 1)));
}

// Clamp a ground position inside the city, with a margin for the bay.
export function clampToCity(x, z, margin = 6) {
  return {
    x: Math.max(-HALF - margin, Math.min(HALF + margin, x)),
    z: Math.max(-HALF - margin, Math.min(HALF + margin, z)),
  };
}
