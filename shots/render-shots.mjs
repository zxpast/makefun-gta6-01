// The screenshot painter: renders each staged shot into a 1280x720 PNG with the same
// chase camera and sim state the Three.js renderer uses. Pure Node, no WebGL —
// a painter's-algorithm projection of the city's boxes, roads and cars.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from './canvas.mjs';
import { encodePng } from './png.mjs';
import { stageShot, SHOT_NAMES } from '../game/src/shots.js';
import { project } from '../game/src/camera3d.js';
import { COLORS, WORLD, HELI } from '../game/src/config.js';

const W = 1280;
const H = 720;
const FOV = 60;

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function shade(rgb, factor) {
  return [Math.round(rgb[0] * factor), Math.round(rgb[1] * factor), Math.round(rgb[2] * factor)];
}

function lerp(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function makePainter(canvas, eye, target, daylight) {
  const night = 1 - daylight;
  const nightFactor = 0.45 + daylight * 0.55;

  function proj(point) {
    return project(point, eye, target, FOV);
  }

  function drawQuad(p1, p2, p3, p4, color, alpha = 1) {
    const s1 = proj(p1);
    const s2 = proj(p2);
    const s3 = proj(p3);
    const s4 = proj(p4);
    if (s1.behind || s2.behind || s3.behind || s4.behind) return false;
    canvas.fillPolygon(
      [{ x: s1.x, y: s1.y }, { x: s2.x, y: s2.y }, { x: s3.x, y: s3.y }, { x: s4.x, y: s4.y }],
      shade(color, nightFactor),
      alpha,
    );
    return true;
  }

  /** Draw a box (centre x/z, height h, footprint w×d) with its camera-facing faces. */
  function drawBox(cx, cz, y0, w, h, d, color) {
    const rgb = hexRgb(color);
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y1 = y0 + h;
    const corners = {
      a: { x: x0, y: y0, z: z0 }, b: { x: x1, y: y0, z: z0 }, c: { x: x1, y: y0, z: z1 }, d: { x: x0, y: y0, z: z1 },
      e: { x: x0, y: y1, z: z0 }, f: { x: x1, y: y1, z: z0 }, g: { x: x1, y: y1, z: z1 }, h: { x: x0, y: y1, z: z1 },
    };
    const faces = [
      { pts: [corners.e, corners.f, corners.g, corners.h], n: [0, 1, 0], s: 1.0, c: [corners.e, corners.f, corners.g, corners.h] },
      { pts: [corners.a, corners.b, corners.f, corners.e], n: [0, 0, -1], s: 0.72, c: [corners.a, corners.b, corners.f, corners.e] },
      { pts: [corners.c, corners.d, corners.h, corners.g], n: [0, 0, 1], s: 0.72, c: [corners.c, corners.d, corners.h, corners.g] },
      { pts: [corners.b, corners.c, corners.g, corners.f], n: [1, 0, 0], s: 0.6, c: [corners.b, corners.c, corners.g, corners.f] },
      { pts: [corners.d, corners.a, corners.e, corners.h], n: [-1, 0, 0], s: 0.6, c: [corners.d, corners.a, corners.e, corners.h] },
    ];
    const visible = [];
    for (const face of faces) {
      const centre = { x: 0, y: 0, z: 0 };
      for (const p of face.pts) {
        centre.x += p.x / 4;
        centre.y += p.y / 4;
        centre.z += p.z / 4;
      }
      const toEye = [eye.x - centre.x, eye.y - centre.y, eye.z - centre.z];
      const dot = face.n[0] * toEye[0] + face.n[1] * toEye[1] + face.n[2] * toEye[2];
      if (dot <= 0) continue;
      const depth = Math.hypot(toEye[0], toEye[1], toEye[2]);
      visible.push({ face, depth });
    }
    visible.sort((a, b) => b.depth - a.depth);
    for (const { face } of visible) {
      const projected = face.pts.map((p) => proj(p));
      if (projected.some((s) => s.behind)) continue;
      canvas.fillPolygon(
        projected.map((s) => ({ x: s.x, y: s.y })),
        shade(rgb, nightFactor * face.s),
      );
    }
  }

  return { proj, drawQuad, drawBox, night };
}

function paintShot(name) {
  const { sim, missions, camera } = stageShot(name);
  const { eye, target } = camera;
  const canvas = new Canvas(W, H);
  const daylight = sim.daylight();
  const { drawQuad, drawBox } = makePainter(canvas, eye, target, daylight);

  // Sky: a vertical gradient between the day/dusk/night palettes.
  const skyTop = daylight > 0.6
    ? lerp(hexRgb(COLORS.skyDay), hexRgb(COLORS.skyDusk), (1 - daylight) / 0.4)
    : lerp(hexRgb(COLORS.skyDusk), hexRgb(COLORS.skyNight), (0.6 - daylight) / 0.5);
  const skyBottom = daylight > 0.6
    ? lerp(hexRgb(COLORS.skyDay), hexRgb('#f59e0b'), (1 - daylight) / 0.4 * 0.5)
    : lerp(hexRgb('#f59e0b'), hexRgb(COLORS.skyNight), (0.6 - daylight) / 0.5);
  for (let y = 0; y < H; y += 1) {
    const t = y / H;
    canvas.fillRect(0, y, W, 1, lerp(skyTop, skyBottom, t));
  }

  // Horizon: where a point far ahead at eye height projects.
  const horizonPoint = project({ x: eye.x + (target.x - eye.x) * 100, y: eye.y, z: eye.z + (target.z - eye.z) * 100 }, eye, target, FOV);
  const horizonY = horizonPoint.behind ? H * 0.42 : Math.max(0, Math.min(H, horizonPoint.y));
  canvas.fillRect(0, horizonY, W, H - horizonY, shade(hexRgb(COLORS.grass), 0.45 + daylight * 0.55));

  // Sun or moon disc, placed on its arc from the clock hour — dawn in the east,
  // noon high, dusk in the west; at night the moon rides the same arc after dark.
  const { hour, minute } = sim.hourMinute();
  const isDay = daylight > 0.3;
  const arcT = isDay
    ? Math.max(0, Math.min(1, (hour + minute / 60 - 6) / 12))
    : Math.max(0, Math.min(1, (((hour - 18 + 24) % 24) + minute / 60) / 12));
  const arcAngle = arcT * Math.PI;
  const sunPos = isDay
    ? { x: Math.round(W / 2 + Math.cos(arcAngle) * 420), y: Math.round(380 - Math.sin(arcAngle) * 300), r: 34, c: '#fde68a' }
    : { x: Math.round(W / 2 + Math.cos(arcAngle) * 420), y: Math.round(380 - Math.sin(arcAngle) * 300), r: 26, c: '#e2e8f0' };
  canvas.fillCircle(sunPos.x, sunPos.y, sunPos.r, sunPos.c);

  const city = sim.city;
  const state = sim.state;

  // Roads, in 20 m segments so a strip crossing the camera plane does not vanish whole.
  for (const x of city.roadsX) {
    for (let z = -WORLD.depth / 2; z < WORLD.depth / 2; z += 20) {
      drawQuad(
        { x: x - 7, y: 0.02, z }, { x: x + 7, y: 0.02, z },
        { x: x + 7, y: 0.02, z: z + 20 }, { x: x - 7, y: 0.02, z: z + 20 },
        hexRgb(COLORS.road),
      );
    }
    for (let z = -WORLD.depth / 2 + 4; z < WORLD.depth / 2; z += 24) {
      drawQuad(
        { x: x - 0.3, y: 0.04, z }, { x: x + 0.3, y: 0.04, z },
        { x: x + 0.3, y: 0.04, z: z + 8 }, { x: x - 0.3, y: 0.04, z: z + 8 },
        hexRgb(COLORS.roadLine),
      );
    }
  }
  for (const z of city.roadsZ) {
    for (let x = -WORLD.width / 2; x < WORLD.width / 2; x += 20) {
      drawQuad(
        { x, y: 0.02, z: z - 7 }, { x: x + 20, y: 0.02, z: z - 7 },
        { x: x + 20, y: 0.02, z: z + 7 }, { x, y: 0.02, z: z + 7 },
        hexRgb(COLORS.road),
      );
    }
    for (let x = -WORLD.width / 2 + 4; x < WORLD.width / 2; x += 24) {
      drawQuad(
        { x, y: 0.04, z: z - 0.3 }, { x: x + 8, y: 0.04, z: z - 0.3 },
        { x: x + 8, y: 0.04, z: z + 0.3 }, { x, y: 0.04, z: z + 0.3 },
        hexRgb(COLORS.roadLine),
      );
    }
  }

  // Buildings, far to near.
  const buildings = [...city.buildings].sort((a, b) => {
    const da = Math.hypot(a.x - eye.x, a.z - eye.z);
    const db = Math.hypot(b.x - eye.x, b.z - eye.z);
    return db - da;
  });
  for (const b of buildings) drawBox(b.x, b.z, 0, b.w, b.h, b.d, b.color);

  // Cars, far to near: parked, traffic, police, roadblocks, then the player.
  const cars = [];
  for (const c of city.parked) cars.push({ x: c.x, z: c.z, color: c.color, police: false });
  for (const c of state.traffic) if (!c.wrecked) cars.push({ x: c.x, z: c.z, color: c.color, police: false });
  for (const c of state.police) cars.push({ x: c.x, z: c.z, color: COLORS.policeCar, police: true });
  for (const c of state.roadblocks) cars.push({ x: c.x, z: c.z, color: COLORS.policeCar, police: true });
  cars.sort((a, b) => Math.hypot(b.x - eye.x, b.z - eye.z) - Math.hypot(a.x - eye.x, a.z - eye.z));
  for (const c of cars) {
    drawBox(c.x, c.z, 0, 2, 0.7, 4.4, c.color);
    drawBox(c.x, c.z, 0.7, 1.7, 0.6, 2.2, '#1c2733');
    if (c.police) drawBox(c.x, c.z, 1.3, 1.4, 0.25, 0.5, '#2244ff');
  }
  if (state.car !== null) {
    drawBox(state.car.x, state.car.z, 0, 2, 0.7, 4.4, COLORS.playerCar);
    drawBox(state.car.x, state.car.z, 0.7, 1.7, 0.6, 2.2, '#1c2733');
  }

  // Pedestrians.
  for (const ped of state.peds) {
    const y0 = ped.down >= 0 ? 0 : 0;
    const h = ped.down >= 0 ? 0.7 : 1.8;
    drawBox(ped.x, ped.z, y0, 0.7, h, 0.7, '#d8d8d8');
  }

  // The helicopter and its spotlight cone onto the player.
  if (state.heli.active) {
    const hx = state.heli.x;
    const hz = state.heli.z;
    drawBox(hx, hz, HELI.altitude - 0.7, 3.2, 1.4, 6, COLORS.heliBody);
    const rotor = project({ x: hx + 4.5, y: HELI.altitude + 0.3, z: hz }, eye, target, FOV);
    const rotor2 = project({ x: hx - 4.5, y: HELI.altitude + 0.3, z: hz }, eye, target, FOV);
    if (!rotor.behind && !rotor2.behind) {
      canvas.drawLine(rotor.x, rotor.y, rotor2.x, rotor2.y, '#111111', 3);
    }
    const top = project({ x: hx, y: HELI.altitude - 1, z: hz }, eye, target, FOV);
    const ground = project({ x: state.player.x, y: 0, z: state.player.z }, eye, target, FOV);
    if (!top.behind && !ground.behind) {
      const spread = HELI.spotlight / 2;
      const left = project({ x: state.player.x - spread, y: 0, z: state.player.z }, eye, target, FOV);
      const right = project({ x: state.player.x + spread, y: 0, z: state.player.z }, eye, target, FOV);
      if (!left.behind && !right.behind) {
        canvas.fillPolygon(
          [{ x: top.x, y: top.y }, { x: left.x, y: left.y }, { x: right.x, y: right.y }],
          '#fff2b0',
          0.22,
        );
      }
    }
  }

  // The mission marker: a bobbing cyan diamond over the current target.
  const targetPos = missions.target();
  if (targetPos !== null) {
    const my = 5 + Math.sin(state.elapsed * 3) * 0.8;
    const top = project({ x: targetPos.x, y: my + 1.6, z: targetPos.z }, eye, target, FOV);
    const mid = project({ x: targetPos.x, y: my, z: targetPos.z }, eye, target, FOV);
    const bot = project({ x: targetPos.x, y: my - 1.6, z: targetPos.z }, eye, target, FOV);
    if (!top.behind && !mid.behind && !bot.behind) {
      canvas.fillPolygon(
        [{ x: top.x, y: top.y }, { x: mid.x + 14, y: mid.y }, { x: bot.x, y: bot.y }, { x: mid.x - 14, y: mid.y }],
        COLORS.neonCyan,
      );
    }
  }

  // HUD: cash, clock, stars, objective.
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  canvas.drawText(18, 20, `$${Math.floor(state.cash)}`, 3, '#ffffff');
  canvas.drawText(18, 52, clock, 3, '#ffffff');
  canvas.drawText(18, 84, `CH ${missions.completed.length + 1}/8`, 2, '#ffffff');
  const starText = '*'.repeat(state.wanted) + '-'.repeat(5 - state.wanted);
  canvas.drawText(W / 2 - 60, 20, starText, 3, '#f59e0b');
  canvas.drawText(18, H - 44, `> ${missions.objective()}`, 2, '#fbbf24');
  canvas.drawText(18, H - 20, missions.message.slice(0, 60), 2, '#ffffff');

  return canvas.pixels;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

const names = process.argv.slice(2);
const shots = names.length > 0 ? names : SHOT_NAMES;
const labels = { chase: '1-chase', heli: '2-heli', roadblock: '3-roadblock', finale: '4-finale' };
for (const name of shots) {
  const pixels = paintShot(name);
  const png = encodePng(W, H, pixels);
  const file = join(outDir, `${labels[name]}.png`);
  writeFileSync(file, png);
  console.log(`${file}: ${png.length} bytes`);
}
