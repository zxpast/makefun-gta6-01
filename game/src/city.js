// Solano Heat — the city of Port Solano. One job: build the map once from a seed
// (roads, blocks, buildings, parks, beach, docks, landmarks) and answer the two
// questions the simulation asks all the time: is this point on a road, and does
// this circle hit a building?
import {
  AVENUES, BEACH_X, BLOCK, BUILDING_COLORS, NEON_SIGNS, ROAD_W, SEA_X,
  STREETS, WORLD_H, WORLD_W,
} from './config.js';
import { int, pick, range } from './random.js';

export function isOnRoad(x, y) {
  if (x < BEACH_X) return false;
  for (const a of AVENUES) if (Math.abs(x - a) < ROAD_W / 2) return true;
  for (const s of STREETS) if (Math.abs(y - s) < ROAD_W / 2) return true;
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const a of AVENUES) {
    const d = Math.abs(x - a);
    if (d < bestD) { bestD = d; best = { x: a, y }; }
  }
  for (const s of STREETS) {
    const d = Math.abs(y - s);
    if (d < bestD) { bestD = d; best = { x, y: s }; }
  }
  return best;
}

// Snap a point onto the nearest road centre line, used when spawning traffic.
export function snapToRoad(x, y) {
  const p = nearestRoadPoint(x, y);
  return p || { x, y };
}

export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const landmarks = [];
  // Landmarks the story and missions point at (fixed, named, original).
  landmarks.push({ name: 'Safehouse', kind: 'safehouse', x: 1250, y: 750, w: 120, h: 90 });
  landmarks.push({ name: 'Marina', kind: 'marina', x: 900, y: 3200, w: 200, h: 120 });
  landmarks.push({ name: 'The Docks', kind: 'docks', x: 2500, y: 3200, w: 260, h: 140 });
  landmarks.push({ name: 'Solano Bank', kind: 'bank', x: 2450, y: 1150, w: 150, h: 110 });
  landmarks.push({ name: 'Salt Kings Warehouse', kind: 'warehouse', x: 2050, y: 2350, w: 220, h: 160 });
  landmarks.push({ name: 'Sunset Pier', kind: 'pier', x: 180, y: 1500, w: 120, h: 300 });
  landmarks.push({ name: 'City Hospital', kind: 'hospital', x: 3650, y: 750, w: 170, h: 120 });
  landmarks.push({ name: 'Police HQ', kind: 'police', x: 2850, y: 350, w: 170, h: 120 });

  const blockXs = [BEACH_X + 40];
  for (const a of AVENUES) blockXs.push(a + ROAD_W / 2 + 8);
  const blockYs = [8];
  for (const s of STREETS) blockYs.push(s + ROAD_W / 2 + 8);

  for (let bi = 0; bi < blockXs.length; bi += 1) {
    for (let bj = 0; bj < blockYs.length; bj += 1) {
      const x0 = blockXs[bi];
      const y0 = blockYs[bj];
      const x1 = bi + 1 < blockXs.length ? blockXs[bi + 1] - ROAD_W - 16 : WORLD_W - 16;
      const y1 = bj + 1 < blockYs.length ? blockYs[bj + 1] - ROAD_W - 16 : WORLD_H - 16;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 60 || h < 60) continue;
      const roll = rng();
      // A few blocks are parks or car parks instead of buildings.
      if (roll < 0.12) {
        parks.push({ x: x0, y: y0, w, h, trees: int(rng, 4, 10) });
        continue;
      }
      if (roll < 0.2) continue; // empty lot / car park
      // Split a big block into 1-4 buildings.
      const cols = w > 240 ? 2 : 1;
      const rows = h > 240 ? 2 : 1;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const bw = w / cols - 18;
          const bh = h / rows - 18;
          const bx = x0 + (w / cols) * c + 9;
          const by = y0 + (h / rows) * r + 9;
          const b = {
            x: bx, y: by, w: bw, h: bh,
            color: pick(rng, BUILDING_COLORS),
            height: int(rng, 1, 5),
            sign: rng() < 0.22 ? pick(rng, NEON_SIGNS) : null,
            windows: int(rng, 2, 6),
          };
          // Never pave over a landmark.
          let clash = false;
          for (const lm of landmarks) {
            if (b.x < lm.x + lm.w && b.x + b.w > lm.x && b.y < lm.y + lm.h && b.y + b.h > lm.y) clash = true;
          }
          if (!clash) buildings.push(b);
        }
      }
    }
  }

  // Palm trees along the boardwalk.
  const palms = [];
  for (let y = 60; y < WORLD_H - 60; y += 90) palms.push({ x: BEACH_X - 24, y: y + range(rng, -20, 20) });

  function collideCircle(x, y, r) {
    // Returns a corrected position after pushing the circle out of buildings.
    let cx = x;
    let cy = y;
    const solids = buildings.concat(landmarks);
    for (const b of solids) {
      const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
      const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
      const dx = cx - nx;
      const dy = cy - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 === 0) { cy = b.y - r; continue; }
        const d = Math.sqrt(d2);
        cx = nx + (dx / d) * r;
        cy = ny + (dy / d) * r;
      }
    }
    // World edge and the sea keep you on land.
    cx = Math.max(SEA_X + 8, Math.min(WORLD_W - 8, cx));
    cy = Math.max(8, Math.min(WORLD_H - 8, cy));
    return { x: cx, y: cy };
  }

  function hitsBuilding(x, y, w, h) {
    for (const b of buildings) {
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return true;
    }
    for (const lm of landmarks) {
      if (x < lm.x + lm.w && x + w > lm.x && y < lm.y + lm.h && y + h > lm.y) return true;
    }
    return false;
  }

  return { buildings, parks, landmarks, palms, collideCircle, hitsBuilding };
}

// A random road point at least `minDist` from (x, y), for spawns and fleeing.
export function randomRoadPoint(rng, x, y, minDist) {
  for (let tries = 0; tries < 40; tries += 1) {
    const vertical = rng() < 0.5;
    const px = vertical ? pick(rng, AVENUES) + range(rng, -30, 30) : range(rng, BEACH_X + 60, WORLD_W - 60);
    const py = vertical ? range(rng, 60, WORLD_H - 60) : pick(rng, STREETS) + range(rng, -30, 30);
    if (Math.hypot(px - x, py - y) >= minDist) return { x: px, y: py };
  }
  return { x: 2400, y: 1500 };
}

export { BLOCK };
