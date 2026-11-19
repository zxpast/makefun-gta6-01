// Solano Heat — the Node screenshot painter. It stages the same four
// scenes the browser stages (game/src/shots.js, seed 7) and paints them
// with the same chase camera (game/src/camera3d.js), so each screenshot is
// a frame of the game's own rules: same city, same cars, same cops, same
// helicopter, same clock. The browser renders with Three.js; this paints
// the same state with a software renderer, because this machine has no
// WebGL. Nothing is edited, composited or borrowed.
//
//   node shots/render-shots.mjs
// Reads shots.json beside the repo root and writes screenshots/<name>.png.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim } from '../game/src/sim.js';
import { createMissions } from '../game/src/missions.js';
import { stageShot } from '../game/src/shots.js';
import { cameraForward, createCamera, projectPoint } from '../game/src/camera3d.js';
import { PALETTE, RADIO, WEAPONS, WORLD } from '../game/src/config.js';
import { Canvas, drawText, hexToRgb, lerpColor, shade, textWidth } from './canvas.mjs';
import { encodePng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1280;
const HEIGHT = 720;
const ROAD_HALF = 5;

const scenes = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

/** Project a world point to [x, y] screen pixels; null when behind the camera. */
function point(camera, x, y, z) {
  const p = projectPoint({ x, y, z }, camera.eye, camera.target, WIDTH, HEIGHT);
  return p === null ? null : [p.x, p.y];
}

/** Draw one axis-aligned box standing on the ground, seen from `camera`. */
function drawBox(canvas, camera, cx, cz, w, h, d, angle, color, roof = null) {
  const hw = w / 2;
  const hd = d / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [];
  for (const [sx, sy, sz] of [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [-hw, h, -hd], [hw, h, -hd], [hw, h, hd], [-hw, h, hd],
  ]) {
    corners.push({ x: cx + sx * cos + sz * sin, y: sy, z: cz - sx * sin + sz * cos });
  }
  const eye = camera.eye;
  const faces = [
    { idx: [4, 5, 6, 7], normal: [0, 1, 0], factor: 1.15 }, // roof
    { idx: [1, 2, 6, 5], normal: [cos, 0, -sin], factor: 0.72 }, // +x side
    { idx: [3, 0, 4, 7], normal: [-cos, 0, sin], factor: 0.72 }, // -x side
    { idx: [2, 3, 7, 6], normal: [sin, 0, cos], factor: 0.55 }, // +z side
    { idx: [0, 1, 5, 4], normal: [-sin, 0, -cos], factor: 0.55 }, // -z side
  ];
  const drawn = [];
  for (const face of faces) {
    const centre = { x: 0, y: 0, z: 0 };
    for (const i of face.idx) {
      centre.x += corners[i].x / 4;
      centre.y += corners[i].y / 4;
      centre.z += corners[i].z / 4;
    }
    const toEye = [eye.x - centre.x, eye.y - centre.y, eye.z - centre.z];
    if (face.normal[0] * toEye[0] + face.normal[1] * toEye[1] + face.normal[2] * toEye[2] <= 0) continue;
    const projected = face.idx.map((i) => point(camera, corners[i].x, corners[i].y, corners[i].z));
    if (projected.some((p) => p === null)) continue;
    const depth = Math.hypot(centre.x - eye.x, centre.y - eye.y, centre.z - eye.z);
    drawn.push({ projected, depth, face });
  }
  drawn.sort((a, b) => b.depth - a.depth);
  for (const { projected, face } of drawn) {
    const fill = face.idx[0] === 4 && roof ? roof : color;
    canvas.fillPolygon(projected, shade(fill, face.factor));
  }
}

/** A flat quad on the ground (a road segment). */
function drawGroundQuad(canvas, camera, x0, z0, x1, z1, color) {
  const projected = [
    point(camera, x0, 0.02, z0),
    point(camera, x1, 0.02, z0),
    point(camera, x1, 0.02, z1),
    point(camera, x0, 0.02, z1),
  ];
  if (projected.some((p) => p === null)) return;
  canvas.fillPolygon(projected, color);
}

function drawStar(canvas, cx, cy, r, filled, color) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad]);
  }
  if (filled) canvas.fillPolygon(pts, color);
  else canvas.strokePolygon(pts, color);
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function renderScene(name, seed) {
  const sim = createSim(seed);
  const missions = createMissions(sim);
  stageShot(name, sim, missions);
  const camera = createCamera();
  camera.snap(sim);
  const s = sim.state;
  const daylight = sim.daylight();
  const canvas = new Canvas(WIDTH, HEIGHT);

  // Sky: bands from the zenith to the horizon, coloured by the time of day.
  const top = lerpColor('#0b1026', '#3d7ac8', daylight);
  const horizon = lerpColor('#1a2440', daylight > 0.45 ? '#ffd76a' : '#ff8c42', Math.min(1, daylight * 1.4));
  const forward = cameraForward(camera);
  const far = point(camera, camera.eye.x + forward.x * 900, camera.eye.y, camera.eye.z + forward.z * 900);
  const horizonY = Math.round(far ? far[1] : HEIGHT * 0.42);
  canvas.vband(0, horizonY, top, horizon);
  // The sun, low and bright toward evening.
  if (daylight > 0.05) {
    canvas.circle(WIDTH * 0.74, HEIGHT * 0.15, 44, daylight > 0.45 ? '#ffd76a' : '#ff8c42', 0.25);
    canvas.circle(WIDTH * 0.74, HEIGHT * 0.15, 30, daylight > 0.45 ? '#ffd76a' : '#ff8c42');
  }
  // Ground from the horizon down.
  canvas.fillRect(0, horizonY, WIDTH, HEIGHT - horizonY, PALETTE.sidewalk);

  // Roads, in 20 m segments so they vanish at the horizon instead of
  // stretching through it.
  for (const x of sim.city.avenues) {
    for (let z = 0; z < WORLD.height; z += 20) {
      drawGroundQuad(canvas, camera, x - ROAD_HALF, z, x + ROAD_HALF, Math.min(z + 20, WORLD.height), PALETTE.road);
    }
  }
  for (const z of sim.city.streets) {
    for (let x = 0; x < WORLD.width; x += 20) {
      drawGroundQuad(canvas, camera, x, z - ROAD_HALF, Math.min(x + 20, WORLD.width), z + ROAD_HALF, PALETTE.road);
    }
  }

  // Everything standing, far to near: buildings, parked cars, traffic,
  // pedestrians, police, roadblocks, the helicopter, the player.
  const drawables = [];
  for (const b of sim.city.buildings) {
    const base = shade(PALETTE.building, b.shade);
    const lit = hexToRgb(PALETTE.buildingLit);
    const color = b.lit ? [base[0] + (lit[0] - base[0]) * 0.25, base[1] + (lit[1] - base[1]) * 0.25, base[2] + (lit[2] - base[2]) * 0.25] : base;
    drawables.push({ depth: Math.hypot((b.x0 + b.x1) / 2 - camera.eye.x, (b.z0 + b.z1) / 2 - camera.eye.z), draw: () => drawBox(canvas, camera, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.x1 - b.x0, b.h, b.z1 - b.z0, 0, color) });
  }
  for (const car of s.parkedCars) {
    if (car.stolen) continue;
    drawables.push({ depth: Math.hypot(car.x - camera.eye.x, car.z - camera.eye.z), draw: () => drawBox(canvas, camera, car.x, car.z, 4.4, 1.35, 2.0, car.angle, car.color) });
  }
  for (const car of s.traffic) {
    drawables.push({ depth: Math.hypot(car.x - camera.eye.x, car.z - camera.eye.z), draw: () => drawBox(canvas, camera, car.x, car.z, 4.4, 1.35, 2.0, car.angle, car.color) });
  }
  for (const ped of s.peds) {
    if (ped.down > 0) continue;
    drawables.push({ depth: Math.hypot(ped.x - camera.eye.x, ped.z - camera.eye.z), draw: () => drawBox(canvas, camera, ped.x, ped.z, 0.5, 1.8, 0.5, ped.angle, PALETTE.ped) });
  }
  for (const cop of s.police) {
    drawables.push({
      depth: Math.hypot(cop.x - camera.eye.x, cop.z - camera.eye.z),
      draw: () => {
        drawBox(canvas, camera, cop.x, cop.z, 4.4, 1.5, 2.0, cop.angle, '#e8e8e8');
        const roof = point(camera, cop.x, 1.55, cop.z);
        if (roof) {
          canvas.circle(roof[0] - 5, roof[1], 3, '#ff3b30');
          canvas.circle(roof[0] + 5, roof[1], 3, '#2f7bff');
        }
      },
    });
  }
  for (const rb of s.roadblocks) {
    drawables.push({ depth: Math.hypot(rb.x - camera.eye.x, rb.z - camera.eye.z), draw: () => drawBox(canvas, camera, rb.x, rb.z, 8, 1.1, 0.6, rb.angle + Math.PI / 2, '#e8e8e8', '#ff5a3c') });
  }
  if (s.heli.active) {
    drawables.push({
      depth: Math.hypot(s.heli.x - camera.eye.x, s.heli.z - camera.eye.z),
      draw: () => {
        drawBox(canvas, camera, s.heli.x, s.heli.z, 5.5, 2.2, 2.4, s.heli.angle, PALETTE.heli);
        const rotorA = point(camera, s.heli.x - Math.cos(s.heli.angle) * 6, 36.6, s.heli.z + Math.sin(s.heli.angle) * 6);
        const rotorB = point(camera, s.heli.x + Math.cos(s.heli.angle) * 6, 36.6, s.heli.z - Math.sin(s.heli.angle) * 6);
        if (rotorA && rotorB) canvas.line(rotorA[0], rotorA[1], rotorB[0], rotorB[1], '#c8ccd2');
        // The spotlight cone down to the player.
        const heliScreen = point(camera, s.heli.x, 35, s.heli.z);
        const target = point(camera, s.player.x, 0.1, s.player.z);
        if (heliScreen && target) {
          canvas.fillPolygon([[heliScreen[0], heliScreen[1]], [target[0] - 42, target[1]], [target[0] + 42, target[1]]], PALETTE.spotlight, 0.16);
          canvas.circle(target[0], target[1], 26, PALETTE.spotlight, 0.2);
        }
      },
    });
  }
  drawables.push({
    depth: 0,
    draw: () => {
      if (s.player.onFoot) {
        drawBox(canvas, camera, s.player.x, s.player.z, 0.5, 1.8, 0.5, s.player.angle, PALETTE.player);
      } else {
        const carColor = s.player.car >= 0 ? s.parkedCars[s.player.car].color : PALETTE.playerCar;
        drawBox(canvas, camera, s.player.x, s.player.z, 4.4, 1.5, 2.0, s.player.angle, carColor);
      }
    },
  });
  drawables.sort((a, b) => b.depth - a.depth);
  for (const item of drawables) item.draw();

  // The mission marker, a bobbing green diamond over the waypoint.
  const wp = missions.waypoint();
  if (wp) {
    const m = point(camera, wp.x, 3.2, wp.z);
    if (m) {
      canvas.fillPolygon([[m[0], m[1] - 16], [m[0] + 11, m[1]], [m[0], m[1] + 16], [m[0] - 11, m[1]]], PALETTE.marker);
      canvas.strokePolygon([[m[0], m[1] - 16], [m[0] + 11, m[1]], [m[0], m[1] + 16], [m[0] - 11, m[1]]], '#0d1526');
    }
  }

  // HUD, as the game draws it: cash and wanted stars top left, clock and
  // district top right, objective bottom left, speed bottom right.
  const cash = `$${Math.floor(s.cash)}`;
  drawText(canvas, cash, 18, 16, 3, '#f2c94c');
  let starX = 18 + textWidth(cash, 3) + 24;
  for (let i = 0; i < 5; i += 1) {
    drawStar(canvas, starX + 13, 30, 11, i < s.wanted, '#ffd76a');
    starX += 28;
  }
  const clock = `${clockText(s.clockMinutes)} ${sim.district()}`;
  drawText(canvas, clock, WIDTH - 18 - textWidth(clock, 2), 18, 2, '#cfd6e2');
  const objective = missions.objective();
  if (objective) drawText(canvas, objective, 18, HEIGHT - 44, 2, '#eef1f5');
  const speedText = s.player.onFoot ? 'ON FOOT' : `${Math.round(Math.abs(s.player.speed) * 3.6)} KM/H`;
  drawText(canvas, speedText, WIDTH - 18 - textWidth(speedText, 2), HEIGHT - 44, 2, '#eef1f5');
  // Station and weapon names come from the config, as the game reads them;
  // the painter's text is upper-cased by the font, so no case is kept here.
  const radio = RADIO[s.radio].name;
  const weapon = WEAPONS[s.player.weapon].name;
  drawText(canvas, `${weapon}  ${radio}`, WIDTH - 18 - textWidth(`${weapon}  ${radio}`, 2), HEIGHT - 72, 2, '#9aa3b2');

  // The minimap, bottom right: roads, the player, the waypoint, the cops.
  const mapX = WIDTH - 208;
  const mapY = HEIGHT - 168;
  const scaleX = 190 / WORLD.width;
  const scaleZ = 150 / WORLD.height;
  canvas.fillRect(mapX, mapY, 190, 150, '#10141c', 0.85);
  canvas.strokePolygon([[mapX, mapY], [mapX + 190, mapY], [mapX + 190, mapY + 150], [mapX, mapY + 150]], '#ffffff33');
  for (const x of sim.city.avenues) canvas.line(mapX + x * scaleX, mapY, mapX + x * scaleX, mapY + 150, '#ffffff22');
  for (const z of sim.city.streets) canvas.line(mapX, mapY + z * scaleZ, mapX + 190, mapY + z * scaleZ, '#ffffff22');
  if (wp) canvas.circle(mapX + wp.x * scaleX, mapY + wp.z * scaleZ, 4, PALETTE.marker);
  for (const cop of s.police) canvas.circle(mapX + cop.x * scaleX, mapY + cop.z * scaleZ, 3, '#2f7bff');
  canvas.circle(mapX + s.player.x * scaleX, mapY + s.player.z * scaleZ, 4, '#f2c94c');

  return encodePng(WIDTH, HEIGHT, canvas.pixels);
}

for (const scene of scenes) {
  const query = new URLSearchParams(scene.query.replace(/^\?/, ''));
  const seed = Number.parseInt(query.get('seed') ?? '7', 10);
  const name = query.get('shot') ?? scene.name.replace(/\.png$/, '');
  const png = renderScene(name, seed);
  writeFileSync(join(root, 'screenshots', scene.name), png);
  console.log(`${scene.name}: ${png.length} bytes — ${scene.label ?? name}`);
}
