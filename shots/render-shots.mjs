// Solano Heat — the Node screenshot painter. It stages the same four
// scenes the browser stages (same seed, same autopilot, same rules) and
// paints them with the same chase camera, in the same 1280x720 frame the
// player sees: sky, roads, towers, cars, cops, the helicopter and its
// spotlight, roadblocks, the mission beam and the HUD. Nothing is edited
// or borrowed — every pixel comes from the game's own state.
//
//   node shots/render-shots.mjs [out-dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRandom } from '../game/src/random.js';
import { buildCity } from '../game/src/city.js';
import { createSim } from '../game/src/sim.js';
import { createMissions } from '../game/src/missions.js';
import { stageShot } from '../game/src/shots.js';
import { chaseCamera, project, screenSize } from '../game/src/camera3d.js';
import { CITY } from '../game/src/config.js';
import { createCanvas, hexColor } from './canvas.mjs';
import { drawText } from './font.mjs';
import { encodePng } from './png.mjs';

const W = 1280;
const H = 720;
const SHOTS = ['chase', 'heli', 'roadblock', 'finale'];
const OUT_NAMES = { chase: '1-chase', heli: '2-heli', roadblock: '3-roadblock', finale: '4-finale' };

function blendColors(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function daylightOf(minutes) {
  if (minutes < 360 || minutes >= 1140) return 0;
  if (minutes < 480) return (minutes - 360) / 120;
  if (minutes < 1020) return 1;
  return 1 - (minutes - 1020) / 120;
}

function paintSky(canvas, day, dusk) {
  const top = day > 0.5
    ? blendColors(hexColor('#7fb2e5'), hexColor('#e8865a'), dusk)
    : blendColors(hexColor('#0d1026'), hexColor('#e8865a'), dusk);
  const bottom = day > 0.5
    ? blendColors(hexColor('#cfe5f5'), hexColor('#f2a56b'), dusk)
    : blendColors(hexColor('#1c2340'), hexColor('#8a4a5a'), dusk);
  const bands = 24;
  for (let i = 0; i < bands; i += 1) {
    canvas.fillRect(0, Math.floor((H * i) / bands), W, Math.ceil(H / bands) + 1, blendColors(top, bottom, i / bands));
  }
}

function paintShot(name) {
  const random = createRandom(7);
  const city = buildCity(random);
  const sim = createSim(random, city);
  const missions = createMissions(sim);
  stageShot(name, sim, missions);
  const state = sim.state;
  const canvas = createCanvas(W, H);
  const day = daylightOf(state.clockMinutes);
  const dusk = Math.max(0, 1 - Math.abs(day - 0.35) / 0.35);
  paintSky(canvas, day, dusk);

  const p = state.player;
  const cam = chaseCamera(p.x, p.z, p.angle, p.speed);
  const horizon = project(cam.eye, cam.target, {
    x: cam.eye.x + (cam.target.x - cam.eye.x) * 400,
    y: cam.eye.y,
    z: cam.eye.z + (cam.target.z - cam.eye.z) * 400,
  });
  const horizonY = horizon ? horizon.y : H * 0.42;

  // Ground from the horizon down, tinted by the light.
  const groundCol = blendColors(hexColor('#39543a'), hexColor('#2a2f33'), 1 - day);
  canvas.fillRect(0, Math.max(0, horizonY), W, H - Math.max(0, horizonY), groundCol);

  // Dusk sun glow low on the horizon.
  if (dusk > 0.3) {
    const sunX = W * 0.7;
    const sunY = horizonY - 36;
    for (let r = 84; r > 0; r -= 6) {
      canvas.fillCircle(sunX, sunY, r, [255, 170, 90, Math.round(10 + (84 - r) * 0.13)]);
    }
    canvas.fillCircle(sunX, sunY, 32, [255, 220, 160]);
  }

  const items = [];
  const P = (x, y, z) => project(cam.eye, cam.target, { x, y, z });

  // Roads near the player, as projected quads. A road is drawn in short
  // 20 m segments: one long quad always has an end behind the camera,
  // which projects to null and drops the whole road from the frame.
  const near = 190;
  const SEG = 20;
  for (const x of city.verticals) {
    if (Math.abs(x - p.x) > near) continue;
    for (let z0 = Math.max(0, p.z - near); z0 < Math.min(CITY.height, p.z + near); z0 += SEG) {
      const z1 = Math.min(CITY.height, p.z + near, z0 + SEG);
      const a = P(x - 7, 0.1, z0);
      const b = P(x + 7, 0.1, z0);
      const c = P(x + 7, 0.1, z1);
      const d = P(x - 7, 0.1, z1);
      if (a && b && c && d) items.push({ depth: (a.depth + c.depth) / 2, pts: [a, b, c, d], col: hexColor('#2b2f36') });
    }
  }
  for (const z of city.horizontals) {
    if (Math.abs(z - p.z) > near) continue;
    for (let x0 = Math.max(0, p.x - near); x0 < Math.min(CITY.width, p.x + near); x0 += SEG) {
      const x1 = Math.min(CITY.width, p.x + near, x0 + SEG);
      const a = P(x0, 0.1, z - 7);
      const b = P(x1, 0.1, z - 7);
      const c = P(x1, 0.1, z + 7);
      const d = P(x0, 0.1, z + 7);
      if (a && b && c && d) items.push({ depth: (a.depth + c.depth) / 2, pts: [a, b, c, d], col: hexColor('#2b2f36') });
    }
  }

  // A box (building or car) as its visible faces, far to near.
  function drawBox(cx, cz, angle, w, h, d, baseCol, topCol) {
    const hw = w / 2;
    const hd = d / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const corner = (lx, ly, lz) => ({
      x: cx + lx * cos + lz * sin,
      y: ly,
      z: cz - lx * sin + lz * cos,
    });
    const cs = [
      corner(-hw, 0, -hd), corner(hw, 0, -hd), corner(hw, 0, hd), corner(-hw, 0, hd),
      corner(-hw, h, -hd), corner(hw, h, -hd), corner(hw, h, hd), corner(-hw, h, hd),
    ];
    const ps = cs.map((c) => P(c.x, c.y, c.z));
    const faces = [
      { pts: [ps[4], ps[5], ps[6], ps[7]], col: topCol, n: [0, 1, 0] },
      { pts: [ps[1], ps[2], ps[6], ps[5]], col: baseCol, n: [1, 0, 0] },
      { pts: [ps[3], ps[0], ps[4], ps[7]], col: baseCol, n: [-1, 0, 0] },
      { pts: [ps[2], ps[3], ps[7], ps[6]], col: baseCol, n: [0, 0, 1] },
      { pts: [ps[0], ps[1], ps[5], ps[4]], col: baseCol, n: [0, 0, -1] },
    ];
    for (const f of faces) {
      // A face with a corner behind the camera is skipped on its own;
      // the rest of the box still draws instead of the whole building
      // vanishing when one corner falls off the frame.
      if (f.pts.some((q) => q === null)) continue;
      // Face normal rotated by the box yaw.
      const nx = f.n[0] * cos + f.n[2] * sin;
      const nz = -f.n[0] * sin + f.n[2] * cos;
      const toEye = { x: cam.eye.x - cx, y: cam.eye.y - h / 2, z: cam.eye.z - cz };
      const facing = nx * toEye.x + f.n[1] * toEye.y + nz * toEye.z;
      if (facing <= 0.5) continue;
      const depth = f.pts.reduce((s, q) => s + q.depth, 0) / 4;
      items.push({ depth, pts: f.pts, col: f.col });
    }
  }

  // Buildings, shaded by their stored light and the time of day.
  for (const b of city.buildings) {
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d > 230) continue;
    const shade = Math.round(118 * b.shade * (0.4 + day * 0.6));
    const top = Math.min(255, Math.round(148 * b.shade * (0.4 + day * 0.6)));
    drawBox(b.x, b.z, 0, b.w, b.h, b.d, [shade, Math.round(shade * 0.92), Math.round(shade * 0.85)], [top, top, Math.round(top * 0.95)]);
  }

  // Cars: the player's gold car, traffic, parked cars and cops.
  function drawCar(car, colorHex, isCop) {
    const col = hexColor(colorHex);
    const top = [Math.min(255, col[0] + 40), Math.min(255, col[1] + 40), Math.min(255, col[2] + 40)];
    drawBox(car.x, car.z, car.angle, 2, 1.1, 4.4, col, top);
    drawBox(car.x, car.z, car.angle, 1.7, 1.7, 2.2, [28, 39, 51], [40, 55, 70]);
    if (isCop) {
      const s = P(car.x, 2.1, car.z);
      if (s) canvas.fillCircle(s.x, s.y, Math.max(2, screenSize(s.depth, 0.5)), [255, 42, 42]);
    }
  }
  if (state.car) drawCar(state.car, '#e8b13c', false);
  for (const t of state.traffic) {
    if (Math.hypot(t.x - p.x, t.z - p.z) > 200) continue;
    drawCar(t, `#${t.color.toString(16).padStart(6, '0')}`, false);
  }
  for (const c of state.parked) {
    if (Math.hypot(c.x - p.x, c.z - p.z) > 200) continue;
    drawCar(c, `#${c.color.toString(16).padStart(6, '0')}`, false);
  }
  for (const cop of state.police) drawCar(cop, '#2a4fd0', true);

  // Pedestrians as small upright figures.
  for (const ped of state.peds) {
    const s = P(ped.x, 0, ped.z);
    const head = P(ped.x, 1.9, ped.z);
    if (!s || !head) continue;
    const h = Math.max(3, screenSize(s.depth, 1.9));
    const col = hexColor(`#${ped.shirt.toString(16).padStart(6, '0')}`);
    canvas.drawLine(s.x, s.y, head.x, head.y, col, Math.max(2, Math.round(h / 6)));
    canvas.fillCircle(head.x, head.y, Math.max(1.5, h / 12), [216, 168, 120]);
  }

  // Roadblocks: orange cones and a white bar.
  for (const rb of state.roadblocks) {
    for (let k = -1; k <= 1; k += 1) {
      const cx = rb.x + Math.cos(rb.angle) * k * 2.2;
      const cz = rb.z - Math.sin(rb.angle) * k * 2.2;
      const base = P(cx, 0, cz);
      const tip = P(cx, 1.6, cz);
      if (!base || !tip) continue;
      const w = Math.max(2, screenSize(base.depth, 0.6));
      canvas.fillPolygon(
        [{ x: base.x - w, y: base.y }, { x: base.x + w, y: base.y }, { x: tip.x, y: tip.y }],
        [232, 90, 46],
      );
    }
  }

  // The mission beam.
  if (state.marker) {
    const base = P(state.marker.x, 0, state.marker.z);
    const top = P(state.marker.x, 60, state.marker.z);
    if (base && top) {
      const w = Math.max(3, screenSize(base.depth, 1.2));
      canvas.fillPolygon(
        [{ x: base.x - w, y: base.y }, { x: base.x + w, y: base.y }, { x: top.x + w / 3, y: top.y }, { x: top.x - w / 3, y: top.y }],
        [255, 207, 61, 90],
      );
    }
  }

  // Helicopter: body, rotor and the spotlight cone on the player.
  if (state.heli.active) {
    const h = state.heli;
    const body = P(h.x, h.alt, h.z);
    const tail = P(h.x - Math.sin(h.angle) * 3, h.alt, h.z - Math.cos(h.angle) * 3);
    if (body) {
      const s = Math.max(4, screenSize(body.depth, 2.4));
      canvas.fillCircle(body.x, body.y, s, [28, 39, 51]);
      if (tail) canvas.drawLine(body.x, body.y, tail.x, tail.y, [28, 39, 51], Math.max(2, Math.round(s / 3)));
      canvas.drawLine(body.x - s * 2, body.y - s * 0.5, body.x + s * 2, body.y - s * 0.5, [200, 210, 220], 2);
      const pp = P(p.x, 0, p.z);
      if (pp) {
        canvas.fillPolygon(
          [{ x: body.x - s * 0.7, y: body.y }, { x: body.x + s * 0.7, y: body.y }, { x: pp.x + s, y: pp.y }, { x: pp.x - s, y: pp.y }],
          [255, 242, 200, 60],
        );
        canvas.fillCircle(pp.x, pp.y, s, [255, 242, 200, 90]);
      }
    }
  }

  // Paint far to near.
  items.sort((a, b) => b.depth - a.depth);
  for (const item of items) {
    canvas.fillPolygon(item.pts.map((q) => ({ x: q.x, y: q.y })), item.col);
  }

  // HUD: title, wanted stars, cash, objective, speed.
  const white = [242, 244, 247];
  const gold = [255, 207, 61];
  drawText(canvas, 'SOLANO HEAT', 24, 20, gold, 3);
  const stars = sim.wantedStars();
  drawText(canvas, `WANTED ${'*'.repeat(stars)}${'-'.repeat(5 - stars)}`, 24, 60, stars >= 4 ? [255, 90, 61] : white, 2);
  drawText(canvas, `$${state.cash}`, 24, 88, white, 2);
  const obj = missions.statusText();
  if (obj) drawText(canvas, obj.slice(0, 60), 24, H - 52, gold, 2);
  const kmh = Math.round(Math.abs(state.player.speed || 0) * 3.6);
  drawText(canvas, state.car ? `${kmh} KM/H` : 'ON FOOT', W - 264, H - 52, white, 2);
  drawText(canvas, state.district.toUpperCase(), W - 264, 20, white, 2);

  return { name, png: encodePng(canvas), state };
}

const outDir = process.argv[2] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });
for (const name of SHOTS) {
  const { png, state } = paintShot(name);
  const file = join(outDir, `${OUT_NAMES[name]}.png`);
  writeFileSync(file, png);
  console.log(`${file}: ${png.length} bytes, wanted ${state.wanted}, clock ${state.clockMinutes}, police ${state.police.length}, heli ${state.heli.active}`);
}
