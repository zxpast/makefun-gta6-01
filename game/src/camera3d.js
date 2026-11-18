// Chase camera and perspective projection, shared by the Three.js renderer
// in the browser and the software painter that draws the screenshots, so
// both show the same view of the same world: the camera sits behind and
// above the player, looks a little ahead of them, and the world is
// projected with a 62-degree vertical field of view.
// Pure maths — no THREE, no DOM — so Node can import it too.
import { clamp, lerp } from './random.js';

export const FOV_DEG = 62;
export const CAM_DISTANCE = 13;
export const CAM_HEIGHT = 5.2;
export const CAM_LOOKAHEAD = 9;

// The camera for a player at (px, pz) facing `angle`, smoothed toward the
// previous camera so it does not snap when the player turns hard.
export function chaseCamera(px, pz, angle, prev, dt) {
  const bx = px - Math.cos(angle) * CAM_DISTANCE;
  const bz = pz - Math.sin(angle) * CAM_DISTANCE;
  const smooth = prev ? Math.min(1, dt * 5) : 1;
  const cx = prev ? lerp(prev.x, bx, smooth) : bx;
  const cz = prev ? lerp(prev.z, bz, smooth) : bz;
  const cy = CAM_HEIGHT;
  const lx = px + Math.cos(angle) * CAM_LOOKAHEAD;
  const lz = pz + Math.sin(angle) * CAM_LOOKAHEAD;
  return { x: cx, y: cy, z: cz, lx, ly: 1.2, lz };
}

// Build a view basis from a camera: forward, right and up unit vectors.
export function cameraBasis(cam) {
  const fx = cam.lx - cam.x;
  const fy = cam.ly - cam.y;
  const fz = cam.lz - cam.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f = [fx / fl, fy / fl, fz / fl];
  // Right = forward x world-up (0,1,0), then true up = right x forward.
  let r = [f[2], 0, -f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  return { f, r, u };
}

// Project a world point to screen space. Returns {x, y, depth} in pixels
// for a view of width w and height h, or null when behind the camera.
export function project(cam, basis, px, py, pz, w, h) {
  const dx = px - cam.x;
  const dy = py - cam.y;
  const dz = pz - cam.z;
  const cx = dx * basis.r[0] + dy * basis.r[1] + dz * basis.r[2];
  const cy = dx * basis.u[0] + dy * basis.u[1] + dz * basis.u[2];
  const cz = dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2];
  if (cz < 0.5) return null;
  const f = (h / 2) / Math.tan((FOV_DEG * Math.PI) / 360);
  return { x: w / 2 + (cx * f) / cz, y: h / 2 - (cy * f) / cz, depth: cz };
}

export function skyColorFor(clock) {
  // clock: 0 dawn, 0.5 noon, 0.75 sunset, 1 night. Blend day/dusk/night.
  const day = [135, 181, 224];
  const dusk = [242, 125, 74];
  const night = [14, 12, 34];
  let a;
  let b;
  let t;
  if (clock < 0.6) { a = day; b = dusk; t = clamp(clock / 0.6, 0, 1); }
  else if (clock < 0.85) { a = dusk; b = night; t = clamp((clock - 0.6) / 0.25, 0, 1); }
  else { a = night; b = night; t = 0; }
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function isNight(clock) {
  return clock > 0.82 || clock < 0.08;
}
