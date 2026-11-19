// The chase camera, as pure math: the Three.js renderer and the Node screenshot painter
// both use this, so a screenshot shows exactly the frame the game renders.
import { CAMERA } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The camera eye and look target for a player at (x, z) facing `angle`, smoothed by dt. */
export function chaseCamera(player, prev, dt) {
  const backX = -Math.sin(player.angle);
  const backZ = -Math.cos(player.angle);
  const wantEye = {
    x: player.x + backX * CAMERA.distance,
    z: player.z + backZ * CAMERA.distance,
    y: CAMERA.height,
  };
  const wantTarget = {
    x: player.x + Math.sin(player.angle) * CAMERA.lookAhead,
    z: player.z + Math.cos(player.angle) * CAMERA.lookAhead,
    y: 1.2,
  };
  if (prev === null || dt <= 0) return { eye: wantEye, target: wantTarget };
  const k = Math.min(1, CAMERA.smooth * dt);
  return {
    eye: {
      x: prev.eye.x + (wantEye.x - prev.eye.x) * k,
      z: prev.eye.z + (wantEye.z - prev.eye.z) * k,
      y: prev.eye.y + (wantEye.y - prev.eye.y) * k,
    },
    target: {
      x: prev.target.x + (wantTarget.x - prev.target.x) * k,
      z: prev.target.z + (wantTarget.z - prev.target.z) * k,
      y: prev.target.y + (wantTarget.y - prev.target.y) * k,
    },
  };
}

/** The camera's forward direction on the ground, for the painter's spotlight cone. */
export function cameraForward(eye, target) {
  const dx = target.x - eye.x;
  const dz = target.z - eye.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/**
 * Project a world point to screen space (1280x720) with a perspective camera.
 * Returns {x, y, behind} — behind when the point sits behind the camera.
 */
export function project(point, eye, target, fovDeg) {
  const fwd = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
  const fwdLen = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
  fwd.x /= fwdLen;
  fwd.y /= fwdLen;
  fwd.z /= fwdLen;
  const right = { x: -fwd.z, y: 0, z: fwd.x };
  const rightLen = Math.hypot(right.x, right.z) || 1;
  right.x /= rightLen;
  right.z /= rightLen;
  // up = right × forward (the camera's own up, from the two axes above).
  const upX = right.y * fwd.z - right.z * fwd.y;
  const upY = right.z * fwd.x - right.x * fwd.z;
  const upZ = right.x * fwd.y - right.y * fwd.x;
  const dx = point.x - eye.x;
  const dy = (point.y ?? 0) - eye.y;
  const dz = point.z - eye.z;
  const cx = dx * right.x + dy * right.y + dz * right.z;
  const cy = dx * upX + dy * upY + dz * upZ;
  const cz = dx * fwd.x + dy * fwd.y + dz * fwd.z;
  if (cz < 0.5) return { x: 0, y: 0, behind: true };
  const f = (720 / 2) / Math.tan(((fovDeg * Math.PI) / 180 / 2));
  const scale = f / cz;
  return { x: 640 + cx * scale, y: 360 - cy * scale, behind: false };
}

/** A point's distance from the camera eye, for painter's-algorithm sorting. */
export function eyeDistance(point, eye) {
  return Math.hypot(point.x - eye.x, (point.y ?? 0) - eye.y, point.z - eye.z);
}

export { clamp };
