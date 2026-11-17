// Solano Heat — the city of Port Solano.
//
// The city is a fixed grid: roads run north-south and east-west every roadGap
// pixels, and the blocks between them hold buildings placed by the seeded
// random stream, so the same seed always builds the same city. Districts are
// named rectangles from config; this module answers where things are: which
// district a point is in, the nearest road, whether a point is on a road, and
// the mission markers (Docks pickup, North Hills drop, Sunset Pier, Eastside
// garage, the safehouse). Nothing here draws or touches the browser.
import { CITY, DISTRICTS } from './config.js';

export const MARKERS = {
  docksPickup: { x: 320, y: 2080, label: 'Docks pickup' },
  northHillsDrop: { x: 2000, y: 280, label: 'North Hills drop' },
  sunsetPier: { x: 320, y: 960, label: 'Sunset Pier' },
  eastsideGarage: { x: 2880, y: 1120, label: 'Eastside garage' },
  safehouse: { x: 1280, y: 1280, label: 'Safehouse' },
  marinaDrop: { x: 1600, y: 2080, label: 'Marina drop' },
  downtownPickup: { x: 1440, y: 1200, label: 'Downtown pickup' },
  turfNorth: { x: 1760, y: 280, label: 'Turf: Hills' },
  turfEast: { x: 2320, y: 280, label: 'Turf: Ridge' },
  turfWest: { x: 1440, y: 280, label: 'Turf: Overlook' },
  hospital: { x: 1760, y: 1440, label: 'Hospital' },
};

function roadLines() {
  const vertical = [];
  const horizontal = [];
  for (let x = CITY.roadGap; x < CITY.width; x += CITY.roadGap) vertical.push(x);
  for (let y = CITY.roadGap; y < CITY.height; y += CITY.roadGap) horizontal.push(y);
  return { vertical, horizontal };
}

export function createCity(random) {
  const roads = roadLines();
  const buildings = [];
  const halfRoad = CITY.roadWidth / 2;

  // One or two buildings per block, kept off the roads and the sidewalks.
  for (let bx = 0; bx < CITY.width / CITY.roadGap; bx += 1) {
    for (let by = 0; by < CITY.height / CITY.roadGap; by += 1) {
      const blockX = bx * CITY.roadGap + halfRoad + 14;
      const blockY = by * CITY.roadGap + halfRoad + 14;
      const blockW = CITY.roadGap - CITY.roadWidth - 28;
      const blockH = CITY.roadGap - CITY.roadWidth - 28;
      if (blockW <= 40 || blockH <= 40) continue;
      const count = 1 + random.int(2);
      for (let n = 0; n < count; n += 1) {
        const w = 60 + random.range(0, blockW - 70);
        const h = 60 + random.range(0, blockH - 70);
        const x = blockX + random.range(0, Math.max(1, blockW - w));
        const y = blockY + random.range(0, Math.max(1, blockH - h));
        buildings.push({
          x, y, w, h,
          shade: random.pick(['a', 'b', 'c']),
          roof: random.pick([0, 1, 2]),
        });
      }
    }
  }

  // A park in Downtown and a stretch of water along the south edge.
  const parks = [{ x: 1760, y: 1120, w: 200, h: 160 }];
  const water = { x: 0, y: CITY.height - 80, w: CITY.width, h: 80 };

  return { roads, buildings, parks, water, halfRoad, districts: DISTRICTS };
}

export function districtAt(x, y) {
  for (const district of DISTRICTS) {
    if (x >= district.x && x < district.x + district.w && y >= district.y && y < district.y + district.h) {
      return district.name;
    }
  }
  return 'Port Solano';
}

/** True when the point is on asphalt (within half a road width of a road line). */
export function onRoad(city, x, y) {
  const half = city.halfRoad;
  for (const rx of city.roads.vertical) if (Math.abs(x - rx) <= half) return true;
  for (const ry of city.roads.horizontal) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** The nearest point on a road centre line to (x, y), for snapping cars to roads. */
export function nearestRoadPoint(city, x, y) {
  let bestX = x;
  let bestD = Infinity;
  for (const rx of city.roads.vertical) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; bestX = rx; }
  }
  let bestY = y;
  let bestDy = Infinity;
  for (const ry of city.roads.horizontal) {
    const d = Math.abs(y - ry);
    if (d < bestDy) { bestDy = d; bestY = ry; }
  }
  return bestD <= bestDy ? { x: bestX, y } : { x, y: bestY };
}

/** True when the rectangle overlaps any building (walls are solid). */
export function hitsBuilding(city, x, y, w, h) {
  for (const b of city.buildings) {
    if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return b;
  }
  return null;
}

export function clampToCity(x, y, margin) {
  return {
    x: Math.min(CITY.width - margin, Math.max(margin, x)),
    y: Math.min(CITY.height - margin, Math.max(margin, y)),
  };
}
