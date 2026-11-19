// The story. Eight chapters take Lucia Vane from her first stolen car to the Night
// Job, plus four repeatable side jobs. A chapter is a list of steps; each step is a
// place to reach, a thing to wait out, or a heat level to lose. The missions read the
// sim's state and never touch the DOM, so the autopilot and the tests drive them the
// same way a player does.
const WAYPOINT_RADIUS = 6;

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
      // A two-star chase: losable. Adding to whatever heat the player carries
      // would make the getaway unwinnable at five stars.
      sim.setWanted(2);
    },
    steps: [{ type: 'loseWanted', text: 'Lose the wanted level' }],
  },
  {
    name: 'Turf Takeover',
    brief: 'Three corners in the Docks fly the wrong flag. Drive through all three and take them back.',
    reward: 550,
    steps: [
      { type: 'goto', place: 'docks', text: 'Take the first corner' },
      { type: 'goto', x: 400, z: 140, text: 'Take the second corner' },
      { type: 'goto', x: 240, z: 280, text: 'Take the third corner' },
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
    timeLimit: 180,
    onStart(sim) {
      // Four stars and the helicopter overhead — the finale's fixed heat.
      sim.setWanted(4);
    },
    steps: [
      { type: 'goto', place: 'pier', text: 'Grab the package at Sunset Pier' },
      { type: 'goto', place: 'northHills', text: 'Deliver to North Hills', timed: 180 },
    ],
  },
];

export const SIDE_JOBS = [
  { kind: 'taxi', name: 'Taxi Fare', text: 'Pick up the fare and drop them off', reward: 100 },
  { kind: 'courier', name: 'Courier Drop', text: 'Deliver the parcel, timed', reward: 120 },
  { kind: 'vigilante', name: 'Vigilante', text: 'Ram the target car 3 times', reward: 200 },
  { kind: 'repo', name: 'Repo Run', text: 'Steal the marked car, bring it to the garage', reward: 250 },
];

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

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
  let ramCount = 0;
  let ramCooldown = 0;
  let repoMark = null;
  let flee = null;

  function stepTarget(step) {
    if (step === null || step === undefined) return null;
    if (step.place !== undefined) {
      const p = places[step.place];
      return p === undefined ? null : { x: p.x, z: p.z };
    }
    if (typeof step.x === 'number') return { x: step.x, z: step.z };
    return null;
  }

  function chapter() {
    return current >= 0 ? CHAPTERS[current] : null;
  }

  function step() {
    const ch = chapter();
    return ch === null ? null : ch.steps[stepIndex] ?? null;
  }

  // Restore the list of finished chapters after a load (save.js keeps it next
  // to the sim snapshot; invalid or out-of-range entries are dropped).
  function restore(list) {
    if (!Array.isArray(list)) return;
    completed.length = 0;
    for (const n of list) {
      if (typeof n === 'number' && n >= 0 && n < CHAPTERS.length && !completed.includes(n)) {
        completed.push(n);
      }
    }
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
    sideJob = null;
    const ch = CHAPTERS[index];
    if (typeof ch.onStart === 'function') ch.onStart(sim);
    message = `${ch.name}: ${ch.steps[0].text}`;
    return true;
  }

  function nextChapter() {
    const next = completed.length;
    if (next >= CHAPTERS.length) return false;
    return startChapter(next);
  }

  function failChapter(reason) {
    failed = true;
    message = reason;
  }

  function completeChapter() {
    const ch = chapter();
    if (ch === null) return;
    sim.state.cash += ch.reward;
    completed.push(current);
    message = `${ch.name} complete. +$${ch.reward}.`;
    current = -1;
    done = true;
  }

  function advanceStep() {
    stepIndex += 1;
    stepTimer = 0;
    waitTimer = 0;
    const s = step();
    const ch = chapter();
    if (s === null) {
      completeChapter();
    } else {
      message = `${ch.name}: ${s.text}`;
    }
  }

  function startSideJob(kind) {
    const def = SIDE_JOBS.find((j) => j.kind === kind);
    if (def === undefined || sideJob !== null) return false;
    if (kind === 'taxi' || kind === 'courier') {
      const keys = ['downtown', 'northHills', 'eastside', 'pier', 'marina', 'docks'];
      const target = keys[Math.floor(Math.random() * keys.length)];
      sideJob = { kind, target, timer: kind === 'courier' ? 120 : -1, done: false };
    } else if (kind === 'vigilante') {
      const cars = sim.state.traffic.filter((c) => !c.wrecked);
      if (cars.length === 0) return false;
      sideJob = { kind, target: cars[0], rams: 0, done: false };
      ramCount = 0;
      ramCooldown = 0;
    } else if (kind === 'repo') {
      if (sim.city.parked.length === 0) return false;
      const mark = sim.city.parked[0];
      repoMark = { x: mark.x, z: mark.z, taken: false };
      sideJob = { kind, done: false };
    }
    message = `${def.name}: ${def.text}`;
    return true;
  }

  function completeSideJob() {
    if (sideJob === null) return;
    const def = SIDE_JOBS.find((j) => j.kind === sideJob.kind);
    sim.state.cash += def.reward;
    message = `${def.name} complete. +$${def.reward}.`;
    sideJob = null;
    repoMark = null;
  }

  function updateSideJob(dt) {
    if (sideJob === null) return;
    const p = sim.state.player;
    if (sideJob.kind === 'taxi' || sideJob.kind === 'courier') {
      if (sideJob.timer >= 0) {
        sideJob.timer -= dt;
        if (sideJob.timer <= 0) {
          message = `${sideJob.kind === 'taxi' ? 'Taxi Fare' : 'Courier Drop'} failed: too slow.`;
          sideJob = null;
          return;
        }
      }
      const place = places[sideJob.target];
      if (place !== undefined && dist(p.x, p.z, place.x, place.z) < WAYPOINT_RADIUS) completeSideJob();
    } else if (sideJob.kind === 'vigilante') {
      if (ramCooldown > 0) ramCooldown -= dt;
      const target = sideJob.target;
      if (target === undefined || target.wrecked) {
        sideJob = null;
        message = 'Vigilante failed: the target is gone.';
        return;
      }
      if (ramCooldown <= 0 && !p.onFoot && Math.abs(p.speed) > 5 && dist(p.x, p.z, target.x, target.z) < 5) {
        ramCount += 1;
        ramCooldown = 1;
        sideJob.rams = ramCount;
        if (ramCount >= 3) completeSideJob();
      }
    } else if (sideJob.kind === 'repo') {
      if (repoMark !== null && !repoMark.taken) {
        if (!p.onFoot && dist(p.x, p.z, repoMark.x, repoMark.z) < 6) repoMark.taken = true;
      }
      if (repoMark !== null && repoMark.taken && sim.nearPlace('garage', WAYPOINT_RADIUS + 4)) completeSideJob();
    }
  }

  function fleeTarget() {
    // The map corner farthest from the player — picked ONCE and kept until the
    // player reaches it. Re-picking every frame flips between two far corners
    // and the player ping-pongs on one road forever, never losing the cops.
    if (flee === null || Math.hypot(flee.x - sim.state.player.x, flee.z - sim.state.player.z) < 20) {
      const corners = [[-400, -280], [400, -280], [-400, 280], [400, 280]];
      let best = corners[0];
      let bestD = -1;
      for (const [x, z] of corners) {
        const d = (x - sim.state.player.x) ** 2 + (z - sim.state.player.z) ** 2;
        if (d > bestD) {
          bestD = d;
          best = [x, z];
        }
      }
      flee = { x: best[0], z: best[1] };
    }
    return flee;
  }

  /** The point the autopilot should drive toward right now, or null. */
  function target() {
    if (sideJob !== null) {
      if (sideJob.kind === 'taxi' || sideJob.kind === 'courier') {
        const place = places[sideJob.target];
        return place === undefined ? null : { x: place.x, z: place.z };
      }
      if (sideJob.kind === 'vigilante') {
        return sideJob.target === undefined ? null : { x: sideJob.target.x, z: sideJob.target.z };
      }
      if (sideJob.kind === 'repo') {
        if (repoMark !== null && !repoMark.taken) return { x: repoMark.x, z: repoMark.z };
        return { x: places.garage.x, z: places.garage.z };
      }
    }
    const s = step();
    if (s === null) return null;
    if (s.type === 'loseWanted') return fleeTarget();
    if (s.type === 'goto' && s.stealth === true && sim.state.wanted > 0) {
      // A stealth delivery with heat on: lose the heat first, then go in clean.
      return fleeTarget();
    }
    if (s.type === 'steal') {
      const parked = sim.city.parked[0];
      return parked === undefined ? null : { x: parked.x, z: parked.z };
    }
    return stepTarget(s);
  }

  function update(dt) {
    updateSideJob(dt);
    const ch = chapter();
    if (ch === null) return;
    if (failed || done) return;
    if (ch.timeLimit !== undefined) {
      chapterTimer += dt;
      if (chapterTimer > ch.timeLimit) {
        failChapter(`${ch.name} failed: out of time.`);
        return;
      }
    }
    const s = step();
    if (s === null) return;
    const p = sim.state.player;
    if (s.type === 'steal') {
      if (!p.onFoot) advanceStep();
      return;
    }
    if (s.type === 'goto') {
      if (s.timed !== undefined) {
        stepTimer += dt;
        if (stepTimer > s.timed) {
          failChapter(`${ch.name} failed: out of time.`);
          return;
        }
      }
      const t = stepTarget(s);
      if (t !== null && dist(p.x, p.z, t.x, t.z) < WAYPOINT_RADIUS) {
        if (s.stealth === true && sim.state.wanted > 0) {
          failChapter(`${ch.name} failed: arrived hot — the deal is off.`);
          return;
        }
        advanceStep();
      }
      return;
    }
    if (s.type === 'wait') {
      const t = stepTarget(s);
      if (t !== null && dist(p.x, p.z, t.x, t.z) < WAYPOINT_RADIUS + 4) {
        waitTimer += dt;
        if (waitTimer >= (s.seconds ?? 5)) advanceStep();
      } else {
        waitTimer = 0;
      }
      return;
    }
    if (s.type === 'loseWanted') {
      if (sim.state.wanted === 0) advanceStep();
    }
  }

  function objective() {
    if (sideJob !== null) {
      const def = SIDE_JOBS.find((j) => j.kind === sideJob.kind);
      return def === undefined ? '' : def.text;
    }
    const s = step();
    if (s === null) return completed.length >= CHAPTERS.length ? 'All chapters complete.' : 'Pick a mission (M).';
    return s.text;
  }

  return {
    get current() {
      return current;
    },
    get stepIndex() {
      return stepIndex;
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
    get completed() {
      return completed;
    },
    get sideJob() {
      return sideJob;
    },
    startChapter,
    restore,
    nextChapter,
    startSideJob,
    update,
    target,
    objective,
  };
}
