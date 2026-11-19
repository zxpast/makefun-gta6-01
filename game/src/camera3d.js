// Solano Heat — the chase camera. One piece of math serves both renders:
// the browser's Three.js camera and the Node screenshot painter take the
// same eye and target, so a screenshot frames exactly what the player sees.

/** Vertical field of view, in radians. */
export const CAMERA_FOV = (62 * Math.PI) / 180;

/** How fast the camera settles behind the player (per second). */
const SMOOTH = 5;

/** A 3D point. */
function point(x, y, z) {
  return { x, y, z };
}

function sub(a, b) {
  return point(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cross(a, b) {
  return point(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a) {
  const l = length(a) || 1;
  return point(a.x / l, a.y / l, a.z / l);
}

/**
 * The chase camera: it trails the player, smoothed, and looks a little
 * ahead of where they are going. `update` moves it; `eye` and `target`
 * are what both renderers point at.
 */
export function createCamera() {
  const eye = point(480, 6, 340);
  const target = point(480, 1, 360);

  return {
    eye,
    target,
    update(sim, dt) {
      const p = sim.state.player;
      const driving = !p.onFoot;
      const back = driving ? 9.5 : 6.5;
      const height = driving ? 4.6 : 3.1;
      const ahead = driving ? 13 : 9;
      const fx = Math.sin(p.angle);
      const fz = Math.cos(p.angle);
      const wantEye = point(p.x - fx * back, height, p.z - fz * back);
      const wantTarget = point(p.x + fx * ahead, 1.2, p.z + fz * ahead);
      const k = 1 - Math.exp(-SMOOTH * dt);
      eye.x += (wantEye.x - eye.x) * k;
      eye.y += (wantEye.y - eye.y) * k;
      eye.z += (wantEye.z - eye.z) * k;
      target.x += (wantTarget.x - target.x) * k;
      target.y += (wantTarget.y - target.y) * k;
      target.z += (wantTarget.z - target.z) * k;
    },
    /** Snap the camera to the player at once (scene starts). */
    snap(sim) {
      const p = sim.state.player;
      const driving = !p.onFoot;
      const back = driving ? 9.5 : 6.5;
      const height = driving ? 4.6 : 3.1;
      const ahead = driving ? 13 : 9;
      const fx = Math.sin(p.angle);
      const fz = Math.cos(p.angle);
      eye.x = p.x - fx * back;
      eye.y = height;
      eye.z = p.z - fz * back;
      target.x = p.x + fx * ahead;
      target.y = 1.2;
      target.z = p.z + fz * ahead;
    },
  };
}

/** The camera's forward direction, from its eye to its target. */
export function cameraForward(camera) {
  const dx = camera.target.x - camera.eye.x;
  const dy = camera.target.y - camera.eye.y;
  const dz = camera.target.z - camera.eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * Project a world point to screen pixels. Returns null when the point is
 * behind the camera. `width`/`height` are the frame's pixels.
 */
export function projectPoint(p, eye, target, width, height) {
  const forward = normalize(sub(target, eye));
  const right = normalize(cross(forward, point(0, 1, 0)));
  const up = cross(right, forward);
  const rel = sub(p, eye);
  const z = dot(rel, forward);
  if (z < 0.5) return null;
  const f = height / 2 / Math.tan(CAMERA_FOV / 2);
  const x = dot(rel, right);
  const y = dot(rel, up);
  return {
    x: width / 2 + (x / z) * f,
    y: height / 2 - (y / z) * f,
    depth: z,
    scale: f / z,
  };
}

/** Project a flat ground quad's corners; null when any corner is behind. */
export function projectQuad(corners, eye, target, width, height) {
  const out = [];
  for (const c of corners) {
    const s = projectPoint(c, eye, target, width, height);
    if (!s) return null;
    out.push(s);
  }
  return out;
}
