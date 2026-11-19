// The story of Solano Heat: seven days, twelve jobs, one vault. Missions
// run as a saw-tooth — each new system arrives in a low-stakes job and gets
// tested under pressure in the next one — and the days count down to the
// Tidehouse Job. A mission is data from sim.js plus a small state machine
// here: idle, running, done, failed. Side jobs fill the gaps between them.

import { MISSIONS, SIDE_JOBS, missionById, rewardFor, targetPoint } from './sim.js';
import { routeBetween, nearestIntersection, HALF, PITCH, ROAD } from './city.js';

export function makeMissions() {
  return {
    current: null,
    timer: 0,
    side: null,
    sideTimer: 0,
    completed: [],
    day: 1,
    menuOpen: false,
    menuIndex: 0,
  };
}

export function startMission(state, id, player) {
  const mission = missionById(id);
  if (!mission) return false;
  const target = targetPoint(mission);
  state.current = {
    ...mission,
    target,
    route: routeBetween(
      nearestIntersection(player.x, player.z),
      { i: mission.target.i, j: mission.target.j },
    ),
    waypoint: 0,
    startedAt: 0,
  };
  state.timer = 0;
  state.day = mission.day;
  return true;
}

export function missionTarget(state) {
  return state.current ? state.current.target : null;
}

// Drive the active mission one step. Returns 'complete', 'failed' or null.
export function stepMission(state, player, dt, police) {
  if (!state.current) return null;
  state.timer += dt;
  const m = state.current;
  const dx = m.target.x - player.x;
  const dz = m.target.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (m.kind === 'chase' || m.kind === 'finale') {
    // Chase jobs end when the player arrives hot: wanted high, heat on.
    if (dist < 10) return finishMission(state, player);
  } else if (dist < 9) {
    return finishMission(state, player);
  }
  if (state.timer > m.par * 3) return failMission(state, 'Out of time.');
  if (player.damage > 100 && Math.abs(player.speed) < 1) return failMission(state, 'The car gave up.');
  return null;
}

function finishMission(state, player) {
  const m = state.current;
  const reward = rewardFor(m, state.timer);
  state.completed.push(m.id);
  state.current = null;
  state.timer = 0;
  return { outcome: 'complete', mission: m, reward };
}

function failMission(state, reason) {
  const m = state.current;
  state.current = null;
  state.timer = 0;
  return { outcome: 'failed', mission: m, reason };
}

export function nextMissionId(state) {
  const done = new Set(state.completed);
  for (const m of MISSIONS) if (!done.has(m.id)) return m.id;
  return null;
}

export function startSideJob(state, id, player) {
  const job = SIDE_JOBS.find((j) => j.id === id);
  if (!job) return false;
  const spot = nearestIntersection(player.x, player.z);
  state.side = {
    ...job,
    target: { i: Math.min(8, spot.i + 3), j: Math.min(8, spot.j + 2) },
  };
  state.sideTimer = 0;
  return true;
}

export function stepSideJob(state, player, dt) {
  if (!state.side) return null;
  state.sideTimer += dt;
  const t = state.side.target;
  const px = -HALF + t.i * PITCH + ROAD / 2;
  const pz = -HALF + t.j * PITCH + ROAD / 2;
  if (Math.hypot(px - player.x, pz - player.z) < 9) {
    const job = state.side;
    state.side = null;
    return { outcome: 'complete', job, reward: { cash: job.cash, respect: job.respect } };
  }
  if (state.sideTimer > 120) {
    state.side = null;
    return { outcome: 'failed', reason: 'The fare gave up.' };
  }
  return null;
}

export function storyDone(state) {
  return state.completed.includes(12);
}

export function daysLeft(state) {
  return Math.max(0, 7 - state.day);
}
