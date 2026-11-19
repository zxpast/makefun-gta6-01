// Solano Heat — the story. Eight chapters take Lucia Vane from her first
// stolen car to the Night Job, plus four repeatable side jobs. A chapter is
// a list of steps; each step is a place to reach, a thing to wait out, or a
// heat level to lose. The missions read the sim's state and never touch the
// DOM, so the autopilot and the tests drive them the same way a player does.

import { WAYPOINT_RADIUS } from './config.js';

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** The eight chapters, in story order. */
export const CHAPTERS = [
  {
    name: 'First Ride',
    brief: 'Lucia is broke and the Docks crew needs a driver. Steal a car and bring it to Downtown.',
    reward: 300,
    steps: [
      { type: 'steal', text: 'Steal a car (E)' },
      { type: 'goto', place: 'downtown', text: 'Drive to Downtown' },
    ],
  },
  {
    name: 'Courier',
    brief: 'A package waits at the Marina. Pick it up and run it to North Hills before the clock runs out.',
    reward: 400,
    steps: [
      { type: 'goto', place: 'marina', text: 'Pick up the package at the Marina' },
      { type: 'goto', place: 'northHills', text: 'Deliver to North Hills', timed: 150 },
    ],
  },
  {
    name: 'Gang Pickup',
    brief: 'The Pier dealers never sleep. Collect the crew at Sunset Pier and drop them in Eastside.',
    reward: 450,
    steps: [
      { type: 'goto', place: 'pier', text: 'Collect the crew at Sunset Pier' },
      { type: 'wait', place: 'pier', seconds: 5, text: 'Wait for the crew (5s)' },
      { type: 'goto', place: 'eastside', text: 'Drop them in Eastside' },
    ],
  },
  {
    name: 'Getaway',
    brief: 'The job went loud and the heat is on. Lose the cops — all of them — and go quiet.',
    reward: 500,
    onStart(sim) {
      sim.state.wanted = 2;
    },
    steps: [{ type: 'loseWanted', text: 'Lose the wanted level' }],
  },
  {
    name: 'Turf Takeover',
    brief: 'Three corners in the Docks fly the wrong flag. Drive through all three and take them back.',
    reward: 550,
    steps: [
      { type: 'goto', place: 'docks', text: 'Take the first corner' },
      { type: 'goto', x: 320, z: 520, text: 'Take the second corner' },
      { type: 'goto', x: 520, z: 440, text: 'Take the third corner' },
    ],
  },
  {
    name: 'Midnight Run',
    brief: 'Docks to North Hills in ninety seconds. The whole city is watching the clock.',
    reward: 700,
    timeLimit: 90,
    steps: [{ type: 'goto', place: 'northHills', text: 'Reach North Hills in 90s' }],
  },
  {
    name: 'Silent Pickup',
    brief: 'Bring the handoff home with zero wanted stars. Arrive hot and the deal is off.',
    reward: 650,
    steps: [
      { type: 'goto', place: 'downtown', text: 'Pick up the handoff in Downtown' },
      { type: 'goto', place: 'safehouse', text: 'Deliver to the Safehouse — stay clean', stealth: true },
    ],
  },
  {
    name: 'The Night Job',
    brief: 'One package, a helicopter overhead, roadblocks on every fast road, and a clock that does not stop.',
    reward: 1200,
    onStart(sim) {
      sim.state.wanted = 4;
    },
    steps: [
      { type: 'goto', place: 'pier', text: 'Grab the package at Sunset Pier' },
      { type: 'goto', place: 'northHills', text: 'Deliver to North Hills', timed: 150 },
    ],
  },
];

/** The four side jobs, repeatable for cash. */
export const SIDE_JOBS = [
  { kind: 'taxi', name: 'Taxi Fare', text: 'Pick up the fare and drop them off', reward: 100 },
  { kind: 'courier', name: 'Courier Drop', text: 'Deliver the parcel, timed', reward: 120 },
  { kind: 'vigilante', name: 'Vigilante', text: 'Ram the target car 3 times', reward: 200 },
  { kind: 'repo', name: 'Repo Run', text: 'Steal the marked car, bring it to the garage', reward: 250 },
];

export function createMissions(sim) {
  const places = sim.city.places;
  let current = -1;
  let stepIndex = 0;
  let stepTimer = 0;
  let chapterTimer = 0;
  let waitTimer = 0;
  let failed = false;
  let done = false;
  let message = '';
  const completed = [];
  let sideJob = null;

  /** The coordinates a step points at, or null when it has none. */
  function stepTarget(step) {
    if (!step) return null;
    if (step.place) {
      const p = places[step.place];
      return p ? { x: p.x, z: p.z } : null;
    }
    if (typeof step.x === 'number') return { x: step.x, z: step.z };
    return null;
  }

  function chapter() {
    return current >= 0 ? CHAPTERS[current] : null;
  }

  function step() {
    const ch = chapter();
    return ch ? ch.steps[stepIndex] : null;
  }

  function startChapter(index) {
    if (index < 0 || index >= CHAPTERS.length) return false;
    current = index;
    stepIndex = 0;
    stepTimer = 0;
    chapterTimer = 0;
    waitTimer = 0;
    failed = false;
    done = false;
    message = CHAPTERS[index].brief;
    const ch = CHAPTERS[index];
    if (ch.onStart) ch.onStart(sim);
    const first = ch.steps[0];
    if (first && first.timed) stepTimer = first.timed;
    return true;
  }

  function completeChapter() {
    const ch = chapter();
    if (!ch) return;
    sim.state.cash += ch.reward;
    completed.push(current);
    message = `${ch.name} complete. +$${ch.reward}.`;
    done = true;
    current = -1;
    stepIndex = 0;
  }

  function failChapter(reason) {
    message = reason;
    failed = true;
    current = -1;
    stepIndex = 0;
  }

  function advanceStep() {
    stepIndex += 1;
    stepTimer = 0;
    waitTimer = 0;
    const next = step();
    if (next && next.timed) stepTimer = next.timed;
    if (!next) completeChapter();
  }

  /** Start a side job. Its target is picked from the city by kind. */
  function startSideJob(kind) {
    const def = SIDE_JOBS.find((j) => j.kind === kind);
    if (!def || sideJob) return false;
    if (kind === 'taxi') {
      const a = places.pier;
      const b = places.downtown;
      sideJob = { ...def, phase: 'pickup', ax: a.x, az: a.z, bx: b.x, bz: b.z, timer: 0 };
    } else if (kind === 'courier') {
      sideJob = { ...def, phase: 'deliver', ax: places.marina.x, az: places.marina.z, bx: places.eastside.x, bz: places.eastside.z, timer: 120 };
    } else if (kind === 'vigilante') {
      const target = sim.state.traffic[0];
      sideJob = { ...def, phase: 'hunt', hits: 0, target, timer: 0 };
    } else {
      const car = sim.state.parkedCars.find((c) => c.parked);
      sideJob = { ...def, phase: 'steal', car, bx: places.garage.x, bz: places.garage.z, timer: 0 };
    }
    message = def.text;
    return true;
  }

  function finishSideJob() {
    if (!sideJob) return;
    sim.state.cash += sideJob.reward;
    message = `${sideJob.name} done. +$${sideJob.reward}.`;
    sideJob = null;
  }

  function updateSideJob(dt) {
    if (!sideJob) return;
    const p = sim.state.player;
    if (sideJob.timer > 0) {
      sideJob.timer -= dt;
      if (sideJob.timer <= 0) {
        message = 'Too slow — the job is gone.';
        sideJob = null;
        return;
      }
    }
    if (sideJob.kind === 'taxi') {
      const target = sideJob.phase === 'pickup' ? { x: sideJob.ax, z: sideJob.az } : { x: sideJob.bx, z: sideJob.bz };
      if (dist(p.x, p.z, target.x, target.z) < WAYPOINT_RADIUS) {
        if (sideJob.phase === 'pickup') sideJob.phase = 'dropoff';
        else finishSideJob();
      }
    } else if (sideJob.kind === 'courier') {
      if (dist(p.x, p.z, sideJob.bx, sideJob.bz) < WAYPOINT_RADIUS) finishSideJob();
    } else if (sideJob.kind === 'vigilante') {
      const t = sideJob.target;
      if (t && !p.onFoot && dist(p.x, p.z, t.x, t.z) < 4 && Math.abs(p.speed) > 5) {
        sideJob.hits += 1;
        t.stopped = 2;
        if (sideJob.hits >= 3) finishSideJob();
      }
    } else if (sideJob.kind === 'repo') {
      const car = sideJob.car;
      if (car && !car.parked && p.car === car.id && dist(p.x, p.z, sideJob.bx, sideJob.bz) < WAYPOINT_RADIUS) {
        finishSideJob();
      }
    }
  }

  function update(dt) {
    const ch = chapter();
    if (ch) {
      if (ch.timeLimit) {
        chapterTimer += dt;
        if (chapterTimer > ch.timeLimit) {
          failChapter('Too slow — the run is blown.');
          return;
        }
      }
      const s = step();
      if (!s) return;
      if (s.timed) {
        stepTimer -= dt;
        if (stepTimer <= 0) {
          failChapter('Out of time.');
          return;
        }
      }
      const p = sim.state.player;
      if (s.type === 'steal') {
        if (!p.onFoot) advanceStep();
      } else if (s.type === 'goto') {
        const t = stepTarget(s);
        if (t && dist(p.x, p.z, t.x, t.z) < WAYPOINT_RADIUS) {
          if (s.stealth && sim.state.wanted > 0) {
            failChapter('Arrived hot — the deal is off.');
            return;
          }
          advanceStep();
        }
      } else if (s.type === 'wait') {
        const t = stepTarget(s);
        if (t && dist(p.x, p.z, t.x, t.z) < WAYPOINT_RADIUS) {
          waitTimer += dt;
          if (waitTimer >= s.seconds) advanceStep();
        } else {
          waitTimer = 0;
        }
      } else if (s.type === 'loseWanted') {
        if (sim.state.wanted === 0) advanceStep();
      }
    }
    updateSideJob(dt);
  }

  return {
    chapters: CHAPTERS,
    sideJobs: SIDE_JOBS,
    completed,
    get current() {
      return current;
    },
    get failed() {
      return failed;
    },
    get done() {
      return done;
    },
    get message() {
      return message;
    },
    get sideJob() {
      return sideJob;
    },
    chapter,
    step,
    stepTarget,
    startChapter,
    startSideJob,
    update,
    /** The current objective text, for the HUD. */
    objective() {
      const s = step();
      if (s) return s.text;
      if (sideJob) return sideJob.text;
      if (current < 0 && completed.length < CHAPTERS.length) return 'Press M for the next job';
      if (completed.length >= CHAPTERS.length) return 'All chapters done — free roam';
      return '';
    },
    /** The waypoint the HUD and the autopilot aim at, or null. */
    waypoint() {
      const s = step();
      if (s) return stepTarget(s);
      if (sideJob) {
        if (sideJob.kind === 'taxi') {
          return sideJob.phase === 'pickup' ? { x: sideJob.ax, z: sideJob.az } : { x: sideJob.bx, z: sideJob.bz };
        }
        if (sideJob.kind === 'courier') return { x: sideJob.bx, z: sideJob.bz };
        if (sideJob.kind === 'vigilante' && sideJob.target) return { x: sideJob.target.x, z: sideJob.target.z };
        if (sideJob.kind === 'repo') return { x: sideJob.bx, z: sideJob.bz };
      }
      return null;
    },
    /** Seconds left on the active timer, or null. */
    timeLeft() {
      const ch = chapter();
      if (ch && ch.timeLimit) return Math.max(0, ch.timeLimit - chapterTimer);
      const s = step();
      if (s && s.timed) return Math.max(0, stepTimer);
      if (sideJob && sideJob.timer > 0) return Math.max(0, sideJob.timer);
      return null;
    },
    /** Clear the fail/done flags after the player reads them. */
    acknowledge() {
      failed = false;
      done = false;
      message = '';
    },
  };
}
