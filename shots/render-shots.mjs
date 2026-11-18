// The screenshot painter: the same staged game states the browser shows,
// painted in Node with the same chase camera.
//
// For each shot in shots.json it builds a fresh simulation from seed 7,
// stages the scene through game/src/shots.js (the autopilot steals a car
// and drives the road graph, exactly as the browser does), then projects
// the world with game/src/camera3d.js — the same camera the Three.js
// renderer uses — and paints it with the software canvas: sky and sun,
// roads and districts, buildings as shaded boxes, cars, police, the
// helicopter and its spotlight, roadblocks, the mission marker and the
// HUD with its minimap. Nothing is edited, composited or borrowed: every
// pixel comes from the game's own state.
//
//   node shots/render-shots.mjs
// writes screenshots/1-chase.png … 4-finale.png and prints their sizes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRandom } from '../game/src/random.js';
import { createSim } from '../game/src/sim.js';
import { stageShot } from '../game/src/shots.js';
import { cameraBasis, chaseCamera, isNight, project, projectClamped, skyColorFor } from '../game/src/camera3d.js';
import { CITY, PALETTE, WEAPONS, RADIO } from '../game/src/config.js';
import { createCanvas } from './canvas.mjs';
import { encodePng } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const W = 1280;
const H = 720;
const SEED = 7;

function shade(color, factor) {
  return [
    Math.min(255, Math.round(color[0] * factor)),
    Math.min(255, Math.round(color[1] * factor)),
    Math.min(255, Math.round(color[2] * factor)),
  ];
}

function paintShot(name) {
  const sim = createSim(createRandom(SEED), { seed: SEED });
  stageShot(name, sim);
  const state = sim.state;
  const p = state.player;
  const canvas = createCanvas(W, H);
  const cam = chaseCamera(p.x, p.z, p.angle, null, 1);
  const basis = cameraBasis(cam);
  const items = [];

  function proj(x, y, z) {
    return project(cam, basis, x, y, z, W, H);
  }

  function depthOf(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    return dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2];
  }

  // --- Sky: a vertical gradient, a sun or a moon, stars at night. ---
  const sky = skyColorFor(state.clock);
  const night = isNight(state.clock);
  const horizonSky = shade(sky, 1.25);
  for (let band = 0; band < 24; band += 1) {
    const t = band / 24;
    canvas.fillRect(0, (H * t) / 2 + (H * t) / 2, W, H / 24 + 1, [
      Math.round(sky[0] + (horizonSky[0] - sky[0]) * t),
      Math.round(sky[1] + (horizonSky[1] - sky[1]) * t),
      Math.round(sky[2] + (horizonSky[2] - sky[2]) * t),
    ]);
  }
  if (night) {
    const rnd = createRandom(42);
    for (let i = 0; i < 90; i += 1) {
      canvas.fillCircle(rnd() * W, rnd() * H * 0.4, 1.4, [255, 255, 255]);
    }
    const moon = proj(p.x + 180, 190, p.z - 260);
    if (moon) canvas.fillCircle(moon.x, moon.y, 26, [235, 238, 245]);
  } else {
    const sun = proj(p.x + 150, 150, p.z - 320);
    if (sun) {
      canvas.fillCircle(sun.x, sun.y, 46, [255, 217, 138], 60);
      canvas.fillCircle(sun.x, sun.y, 30, [255, 217, 138]);
    }
  }

  // Where the ground plane meets the sky, from the camera's point of view.
  const farAhead = proj(p.x + Math.cos(p.angle) * 420, 0, p.z + Math.sin(p.angle) * 420);
  const horizonY = farAhead ? farAhead.y : H * 0.42;
  canvas.fillRect(0, horizonY, W, H - horizonY, shade(PALETTE.ground, 0.9));

  // --- Ground quads: districts, roads, dashes, water, pier. Far first. ---
  function groundQuad(x0, z0, x1, z1, color) {
    // Ground quads run under the camera, so they use the clamped
    // projection: a corner behind the camera stretches instead of
    // dropping the whole quad.
    const corners = [
      projectClamped(cam, basis, x0, 0, z0), projectClamped(cam, basis, x1, 0, z0),
      projectClamped(cam, basis, x1, 0, z1), projectClamped(cam, basis, x0, 0, z1),
    ];
    if (corners.some((c) => c === null)) return;
    const depth = Math.max(...corners.map((c) => c.depth));
    items.push({
      depth,
      draw() {
        canvas.fillPolygon(corners.map((c) => ({ x: c.x, y: c.y })), color);
      },
    });
  }
  for (const d of state.city.districts) {
    groundQuad(d.x, d.z, d.x + d.w, d.z + d.h, shade([0x2e, 0x2e, 0x32], 1));
  }
  for (const rx of state.city.roads.vertical) {
    groundQuad(rx - state.city.halfRoad, 0, rx + state.city.halfRoad, CITY.height, PALETTE.road);
  }
  for (const rz of state.city.roads.horizontal) {
    groundQuad(0, rz - state.city.halfRoad, CITY.width, rz + state.city.halfRoad, PALETTE.road);
  }
  for (const rx of state.city.roads.vertical) {
    for (let z = 20; z < CITY.height; z += 24) {
      groundQuad(rx - 0.4, z, rx + 0.4, z + 10, PALETTE.lane);
    }
  }
  for (const rz of state.city.roads.horizontal) {
    for (let x = 20; x < CITY.width; x += 24) {
      groundQuad(x, rz - 0.4, x + 10, rz + 0.4, PALETTE.lane);
    }
  }
  groundQuad(state.city.water.x, state.city.water.z, state.city.water.x + state.city.water.w, state.city.water.z + state.city.water.h, PALETTE.water);

  // --- Boxes: buildings, cars, roadblocks, the helicopter. ---
  // A box is drawn as its visible faces, far faces first, each face shaded
  // by which way it points: top bright, sun-facing sides warm, the rest dark.
  function drawBox(cx, cy, cz, w, h, d, angle, color, opts) {
    const hw = w / 2;
    const hd = d / 2;
    const cos = Math.cos(angle || 0);
    const sin = Math.sin(angle || 0);
    function local(lx, ly, lz) {
      const wx = cx + lx * cos - lz * sin;
      const wz = cz + lx * sin + lz * cos;
      return proj(wx, cy + ly, wz);
    }
    const corners = {
      b000: local(-hw, 0, -hd), b100: local(hw, 0, -hd), b110: local(hw, 0, hd), b010: local(-hw, 0, hd),
      t000: local(-hw, h, -hd), t100: local(hw, h, -hd), t110: local(hw, h, hd), t010: local(-hw, h, hd),
    };
    if (Object.values(corners).some((c) => c === null)) return;
    const faces = [
      { pts: [corners.t000, corners.t100, corners.t110, corners.t010], shade: 1.18, normal: [0, 1, 0] },
      { pts: [corners.b010, corners.b110, corners.t110, corners.t010], shade: 0.82, normal: [0, 0, 1] },
      { pts: [corners.b100, corners.b000, corners.t000, corners.t100], shade: 0.68, normal: [0, 0, -1] },
      { pts: [corners.b110, corners.b100, corners.t100, corners.t110], shade: 0.92, normal: [1, 0, 0] },
      { pts: [corners.b000, corners.b010, corners.t010, corners.t000], shade: 0.75, normal: [-1, 0, 0] },
    ];
    const centreDepth = depthOf(cx, cy + h / 2, cz);
    for (const face of faces) {
      // A face shows when its outward normal points toward the camera.
      const fc = face.pts.reduce((acc, pt) => ({ x: acc.x + pt.x / 4, y: acc.y + pt.y / 4, depth: acc.depth + pt.depth / 4 }), { x: 0, y: 0, depth: 0 });
      const toCam = [cam.x - cx, cam.y - cy, cam.z - cz];
      const n = face.normal;
      // Rotate the normal by the box angle for the side faces.
      const rn = [
        n[0] * cos - n[2] * sin,
        n[1],
        n[0] * sin + n[2] * cos,
      ];
      if (rn[0] * toCam[0] + rn[1] * toCam[1] + rn[2] * toCam[2] <= 0) continue;
      const faceColor = shade(color, face.shade);
      items.push({
        depth: centreDepth + (fc.depth - centreDepth) * 0.5,
        draw() {
          canvas.fillPolygon(face.pts.map((pt) => ({ x: pt.x, y: pt.y })), faceColor);
        },
      });
    }
    if (opts && opts.neon && night) {
      const strip = proj(cx, Math.min(h * 0.8, 24), cz - d / 2 - 0.4);
      if (strip) {
        items.push({
          depth: centreDepth,
          draw() { canvas.fillCircle(strip.x, strip.y, 5, PALETTE.neonPink); },
        });
      }
    }
  }

  const playerPos = { x: p.x, z: p.z };
  function nearPlayer(x, z, range) {
    return Math.hypot(x - playerPos.x, z - playerPos.z) < range;
  }

  for (const b of state.city.buildings) {
    const cx = b.x + b.w / 2;
    const cz = b.z + b.h / 2;
    if (!nearPlayer(cx, cz, 280)) continue;
    const base = b.shade === 'a' ? PALETTE.buildingA : b.shade === 'b' ? PALETTE.buildingB : PALETTE.buildingC;
    drawBox(cx, 0, cz, b.w, b.height, b.h, 0, base, { neon: b.neon });
    if (night) {
      // A few lit windows on the face toward the camera.
      for (let wy = 0; wy < 2; wy += 1) {
        for (let wx = 0; wx < 3; wx += 1) {
          const lx = b.x + ((wx + 1) * b.w) / 4;
          const lz = b.z + b.h + 0.3;
          const pt = proj(lx, 4 + wy * 7, lz);
          if (pt && (wx + wy) % 2 === 0) {
            items.push({ depth: pt.depth, draw() { canvas.fillCircle(pt.x, pt.y, 2.5, PALETTE.windowLit); } });
          }
        }
      }
    }
  }

  function drawCar(car, color, isPlayer) {
    const top = isPlayer ? 1.5 : 1.1;
    drawBox(car.x, 0, car.z, 4.4, 1.0, 2.0, car.angle, color);
    drawBox(car.x - Math.cos(car.angle) * 0.3, 1.0, car.z - Math.sin(car.angle) * 0.3, 2.1, 0.65, 1.7, car.angle, [0x14, 0x16, 0x1f]);
    void top;
  }

  for (const car of state.cars) {
    if (car.playerDriven || !nearPlayer(car.x, car.z, 230)) continue;
    const color = car.kind === 'taxi' ? PALETTE.taxiCar : car.kind === 'fast' ? [0xc7, 0x4a, 0x3a] : PALETTE.trafficCar;
    drawCar(car, color, false);
  }
  if (p.inCar) drawCar(p.inCar, PALETTE.playerCar, true);
  else {
    const pt = proj(p.x, 1.1, p.z);
    if (pt) items.push({ depth: pt.depth, draw() { canvas.fillCircle(pt.x, pt.y, 7, PALETTE.player); } });
  }
  for (const cop of state.police) {
    if (cop.disabled > 0) continue;
    drawCar(cop, PALETTE.copCar, false);
    const light = proj(cop.x, 2.1, cop.z);
    if (light) {
      const red = Math.floor(cop.siren / 0.45) % 2 === 0;
      items.push({ depth: light.depth, draw() { canvas.fillCircle(light.x, light.y, 5, red ? PALETTE.copRed : PALETTE.copBlue); } });
    }
  }
  for (const ped of state.peds) {
    if (!nearPlayer(ped.x, ped.z, 120)) continue;
    const pt = proj(ped.x, ped.down > 0 ? 0.4 : 1.0, ped.z);
    if (pt) items.push({ depth: pt.depth, draw() { canvas.fillCircle(pt.x, pt.y, 3.5, [0xc9, 0x8a, 0x7a]); } });
  }

  // The helicopter: body, rotor and a translucent spotlight cone to the player.
  if (state.heli.active) {
    const h = state.heli;
    const heliPt = proj(h.x, h.y, h.z);
    const groundPt = proj(p.x, 0, p.z);
    if (heliPt && groundPt) {
      items.push({
        depth: heliPt.depth,
        draw() {
          canvas.fillPolygon([
            { x: heliPt.x - 26, y: heliPt.y + 8 }, { x: heliPt.x + 26, y: heliPt.y + 8 },
            { x: groundPt.x + 22, y: groundPt.y }, { x: groundPt.x - 22, y: groundPt.y },
          ], [0xff, 0xf2, 0xb0], 36);
        },
      });
    }
    drawBox(h.x, h.y - 1, h.z, 5.2, 1.6, 2.4, h.angle, [0x22, 0x24, 0x2e]);
    const rotorA = proj(h.x - Math.cos(h.rotor) * 5, h.y + 1.2, h.z - Math.sin(h.rotor) * 5);
    const rotorB = proj(h.x + Math.cos(h.rotor) * 5, h.y + 1.2, h.z + Math.sin(h.rotor) * 5);
    if (rotorA && rotorB) {
      items.push({ depth: rotorA.depth, draw() { canvas.line(rotorA.x, rotorA.y, rotorB.x, rotorB.y, [0x88, 0x88, 0x88], 2); } });
    }
  }

  for (const block of state.roadblocks) {
    drawBox(block.x, 0, block.z, 7, 1.4, 1.2, block.angle, [0xd8, 0xd8, 0xd8]);
  }

  // The mission marker: a ring on the road and a beam of light.
  const marker = sim.marker();
  if (marker) {
    const mPt = proj(marker.x, 0, marker.z);
    const mTop = proj(marker.x, 60, marker.z);
    if (mPt && mTop) {
      const radius = Math.max(6, (6 * 360) / Math.max(1, mPt.depth));
      items.push({
        depth: mPt.depth,
        draw() {
          canvas.fillCircle(mPt.x, mPt.y, radius, PALETTE.marker, 90);
          canvas.fillCircle(mPt.x, mPt.y, radius * 0.55, PALETTE.marker, 160);
          canvas.line(mPt.x, mPt.y, mTop.x, mTop.y, PALETTE.marker, 2);
        },
      });
    }
  }

  // Painter's algorithm: far items first, near items over them.
  items.sort((a, b) => b.depth - a.depth);
  for (const item of items) item.draw();

  // --- HUD: top bar, objective, timer, speed, minimap. ---
  canvas.fillRect(0, 0, W, 64, [0x0c, 0x0a, 0x12], 190);
  canvas.text(`$${state.missions.cash}`, 20, 16, 3, [0xf2, 0xc9, 0x4c]);
  canvas.text(`HEALTH ${Math.ceil(state.player.health)}`, 20, 44, 2, [0xa8, 0x9f, 0x92]);
  const stars = '*'.repeat(state.wanted) + '-'.repeat(5 - state.wanted);
  canvas.text(stars, W - 300, 14, 3, state.wanted > 0 ? [0xe5, 0x53, 0x4b] : [0xa8, 0x9f, 0x92]);
  const clockMinutes = Math.floor(((state.clock * 24) % 24) * 60);
  canvas.text(`${String(Math.floor(clockMinutes / 60)).padStart(2, '0')}:${String(clockMinutes % 60).padStart(2, '0')}`, W - 300, 42, 2, [0xf2, 0xed, 0xe4]);
  const objective = sim.objective();
  canvas.fillRect(16, 74, Math.min(900, 40 + objective.length * 11), 30, [0x0c, 0x0a, 0x12], 200);
  canvas.text(objective.slice(0, 72), 28, 80, 2, [0xf2, 0xed, 0xe4]);
  const step = sim.currentStepInfo();
  let timer = '';
  if (step && step.kind === 'timed') timer = `DELIVERY - ${Math.ceil(state.missions.stepTimer)}S LEFT`;
  else if (state.heli.active) timer = 'HELICOPTER OVERHEAD';
  if (timer) {
    canvas.fillRect(W / 2 - 180, 112, 360, 26, [0x0c, 0x0a, 0x12], 200);
    canvas.text(timer, W / 2 - 160, 117, 2, [0xf2, 0xc9, 0x4c]);
  }
  const car = state.player.inCar;
  canvas.fillRect(16, H - 96, 260, 82, [0x0c, 0x0a, 0x12], 180);
  canvas.text(car ? `${Math.round(Math.abs(car.speed) * 3.6)} KM/H` : 'ON FOOT', 28, H - 86, 3, [0xf2, 0xed, 0xe4]);
  canvas.text(state.garage.nos ? `NOS ${Math.round(state.nos)}%` : 'NOS -', 28, H - 58, 2, [0x6f, 0xce, 0x7e]);
  const weapon = WEAPONS[state.weapon];
  canvas.text(`${weapon.name.toUpperCase()} [${weapon.ammo < 0 ? 'INF' : state.ammo[weapon.id]}]`, 28, H - 38, 2, [0xf2, 0xed, 0xe4]);
  canvas.text(`♪ ${RADIO[state.radio].name}`, 28, H - 20, 2, [0xa8, 0x9f, 0x92]);

  // Minimap: roads, marker, police, helicopter, player.
  const mapW = 220;
  const mapH = 148;
  const mapX = W - mapW - 16;
  const mapY = H - mapH - 14;
  canvas.fillRect(mapX - 6, mapY - 6, mapW + 12, mapH + 12, [0x0c, 0x0a, 0x12], 200);
  canvas.fillRect(mapX, mapY, mapW, mapH, [0x14, 0x10, 0x1c]);
  const sx = mapW / CITY.width;
  const sy = mapH / CITY.height;
  for (const rx of state.city.roads.vertical) {
    canvas.line(mapX + rx * sx, mapY, mapX + rx * sx, mapY + mapH, [0xd8, 0xc9, 0x7a], 1);
  }
  for (const rz of state.city.roads.horizontal) {
    canvas.line(mapX, mapY + rz * sy, mapX + mapW, mapY + rz * sy, [0xd8, 0xc9, 0x7a], 1);
  }
  if (marker) canvas.fillCircle(mapX + marker.x * sx, mapY + marker.z * sy, 5, PALETTE.marker);
  for (const cop of state.police) {
    canvas.fillRect(mapX + cop.x * sx - 2, mapY + cop.z * sy - 2, 4, 4, [0xe5, 0x53, 0x4b]);
  }
  if (state.heli.active) {
    canvas.fillCircle(mapX + state.heli.x * sx, mapY + state.heli.z * sy, 4, [0xff, 0xf2, 0xb0]);
  }
  canvas.fillCircle(mapX + p.x * sx, mapY + p.z * sy, 4, PALETTE.player);

  if (state.banner) {
    canvas.fillRect(W / 2 - 260, 170, 520, 54, [0xf2, 0xc9, 0x4c]);
    canvas.text(state.banner.text, W / 2 - 240, 182, 3, [0x1a, 0x14, 0x20]);
  }

  return canvas;
}

const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
mkdirSync(join(root, 'screenshots'), { recursive: true });
for (const shot of shots) {
  const name = shot.query.match(/shot=([a-z]+)/)?.[1] || 'chase';
  const canvas = paintShot(name);
  const png = encodePng(canvas.width, canvas.height, canvas.data);
  const outPath = join(root, 'screenshots', shot.name);
  writeFileSync(outPath, png);
  console.log(`${shot.name}: ${name} — ${png.length} bytes${png.length > 262144 ? ' OVER 256 KiB!' : ''}`);
}
console.log('Done. Screenshots are renders of the staged game states, seed 7.');
