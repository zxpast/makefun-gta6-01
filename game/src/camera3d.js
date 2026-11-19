// Solano Heat — the chase camera, as pure math. The browser renderer and
// the Node screenshot painter both use this, so a screenshot frames exactly
// what the player sees. No DOM, no Three.js in here.
export const VIEW = { distance: 13, height: 5.2, lookAhead: 7, fov: 62 };

/** Camera eye + target for a car (or on-foot player) at (x, z, angle). */
export function chaseCamera(x, z, angle, speed = 0) {
  const back = VIEW.distance + Math.min(4, Math.abs(speed) * 0.08);
  const eye = {
    x: x - Math.sin(angle) * back,
    y: VIEW.height + Math.min(1.5, Math.abs(speed) * 0.02),
    z: z - Math.cos(angle) * back,
  };
  const target = {
    x: x + Math.sin(angle) * VIEW.lookAhead,
    y: 1.4,
    z: z + Math.cos(angle) * VIEW.lookAhead,
  };
  return { eye, target };
}

function unit(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function crossProduct(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Project a world point to screen pixels (1280x720). Returns null when the
 * point is behind the camera. The same math the Three.js camera uses:
 * forward from eye to target, right = forward x up, up = right x forward.
 */
export function project(eye, target, point, width = 1280, height = 720) {
  const fwd = unit({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
  const right = unit(crossProduct(fwd, { x: 0, y: 1, z: 0 }));
  const up = crossProduct(right, fwd);
  const rel = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z };
  const depth = rel.x * fwd.x + rel.y * fwd.y + rel.z * fwd.z;
  if (depth < 0.5) return null;
  const focal = (height / 2) / Math.tan((VIEW.fov * Math.PI) / 360);
  const sx = (rel.x * right.x + rel.y * right.y + rel.z * right.z) / depth;
  const sy = (rel.x * up.x + rel.y * up.y + rel.z * up.z) / depth;
  return {
    x: width / 2 + sx * focal,
    y: height / 2 - sy * focal,
    depth,
    scale: focal / depth,
  };
}

/** Screen-space size of a world length at a given depth. */
export function screenSize(depth, worldLength, height = 720) {
  const focal = (height / 2) / Math.tan((VIEW.fov * Math.PI) / 360);
  return (worldLength * focal) / Math.max(0.5, depth);
}
