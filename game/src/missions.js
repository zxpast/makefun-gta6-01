// Solano Heat — the story. Eight chapters for Lucia Vane plus four side
// jobs, all driven by one small objective engine. An objective is a plain
// object; update() checks it against the sim each step and moves on, pays
// out, or fails the chapter. Nothing here draws or plays sound.
import { ECONOMY } from './config.js';

function dist(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }

function chapterDefs(P) {
  return [
  {
    id: 'first-ride', title: 'Chapter 1 — First Ride', pay: 200,
    brief: 'Borrowed jacket, borrowed trouble. Steal a parked car and bring it to the Marina Safehouse.',
    objectives: [
      { type: 'steal', label: 'Steal any parked car (E)' },
      { type: 'drive', x: P.safehouse.x, z: P.safehouse.z, label: 'Drive to the Marina Safehouse', radius: 14 },
    ],
  },
  {
    id: 'courier', title: 'Chapter 2 — Courier', pay: 300,
    brief: 'The Docks crew has a package for Downtown. No questions, no stops.',
    objectives: [
      { type: 'goto', x: P.docks.x, z: P.docks.z, label: 'Pick up the package at the Docks', radius: 12 },
      { type: 'drive', x: P.downtown.x, z: P.downtown.z, label: 'Deliver it to Downtown Plaza', radius: 14 },
    ],
  },
  {
    id: 'gang-pickup', title: 'Chapter 3 — Gang Pickup', pay: 350,
    brief: 'Two friends of the family need a lift from Sunset Pier. The cops are already watching the Pier.',
    objectives: [
      { type: 'goto', x: P.pier.x, z: P.pier.z, label: 'Pick up the crew at Sunset Pier', radius: 12, wait: 2 },
      { type: 'drive', x: P.hospital.x, z: P.hospital.z, label: 'Drop them at Solano General', radius: 14 },
    ],
  },
  {
    id: 'getaway', title: 'Chapter 4 — Getaway', pay: 400,
    brief: 'A job went loud in Eastside. Get to the garage and lose the heat on the way.',
    objectives: [
      { type: 'drive', x: P.garage.x, z: P.garage.z, label: 'Reach the Eastside Garage', radius: 14 },
      { type: 'lose', label: 'Lose the cops — break line of sight' },
    ],
  },
  {
    id: 'turf', title: 'Chapter 5 — Turf Takeover', pay: 450,
    brief: 'The North Hills families want the Pier Market flying their colours. Take the market, then hold it.',
    objectives: [
      { type: 'goto', x: P.market.x, z: P.market.z, label: 'Take the Pier Market', radius: 12, wait: 3 },
      { type: 'drive', x: P.hills.x, z: P.hills.z, label: 'Report to North Hills', radius: 14 },
    ],
  },
  {
    id: 'midnight-run', title: 'Chapter 6 — Midnight Run', pay: 500,
    brief: 'Ninety seconds, Docks to North Hills, with a car that barely holds together. Drive like the rent is due.',
    objectives: [
      { type: 'timed', x: P.hills.x, z: P.hills.z, label: 'Reach North Hills in 90 seconds', seconds: 90, radius: 14 },
    ],
  },
  {
    id: 'silent-pickup', title: 'Chapter 7 — Silent Pickup', pay: 550,
    brief: 'A quiet handoff at the hospital. Arrive with any heat at all and the deal is off.',
    objectives: [
      { type: 'stealth', x: P.hospital.x, z: P.hospital.z, label: 'Reach Solano General with zero stars', radius: 12 },
    ],
  },
  {
    id: 'night-job', title: 'Chapter 8 — The Night Job', pay: 900,
    brief: 'One package, one helicopter overhead, roadblocks on every fast road. Get it to the Pier and do not stop.',
    objectives: [
      { type: 'goto', x: P.docks.x, z: P.docks.z, label: 'Collect the package at the Docks', radius: 12 },
      { type: 'drive', x: P.pier.x, z: P.pier.z, label: 'Run it to Sunset Pier — heli overhead', radius: 14 },
    ],
  },
  ];
}

function sideJobDefs(P) {
  return [
  {
    id: 'taxi', title: 'Taxi Fare', pay: ECONOMY.taxiFare,
    brief: 'A fare is waiting at Downtown Plaza. Pick them up, drop them at the Pier.',
    objectives: [
      { type: 'goto', x: P.downtown.x, z: P.downtown.z, label: 'Pick up the fare at Downtown', radius: 12, wait: 1.5 },
      { type: 'drive', x: P.pier.x, z: P.pier.z, label: 'Drop the fare at Sunset Pier', radius: 14 },
    ],
  },
  {
    id: 'courier-job', title: 'Courier Drop', pay: ECONOMY.courierPay,
    brief: 'A parcel for the Marina, sixty seconds on the clock.',
    objectives: [
      { type: 'timed', x: P.safehouse.x, z: P.safehouse.z, label: 'Deliver to the Marina Safehouse in 60s', seconds: 60, radius: 14 },
    ],
  },
  {
    id: 'vigilante', title: 'Vigilante', pay: ECONOMY.vigilantePay,
    brief: 'A runner is tearing through Eastside in a blue coupe. Run him off the road.',
    objectives: [
      { type: 'chase', label: 'Catch the blue coupe in Eastside', seconds: 75 },
    ],
  },
  {
    id: 'repo', title: 'Repo Run', pay: ECONOMY.repoPay,
    brief: 'A marked sedan near the hospital missed three payments. Take it to the Eastside Garage.',
    objectives: [
      { type: 'repo', x: P.hospital.x, z: P.hospital.z, label: 'Take the marked sedan by the hospital', radius: 6 },
      { type: 'drive', x: P.garage.x, z: P.garage.z, label: 'Deliver it to the Eastside Garage', radius: 14 },
    ],
  },
  ];
}

export function createMissions(sim) {
  const CHAPTERS = chapterDefs(sim.city.places);
  const SIDE_JOBS = sideJobDefs(sim.city.places);
  const state = {
    chapterIndex: 0, stepIndex: 0, timer: 0, waitLeft: 0,
    active: null, // { kind: 'chapter'|'side', def }
    completed: [], failed: null, targetCar: null,
  };

  function currentDef() {
    return state.active ? state.active.def : null;
  }

  function objective() {
    if (!state.active) return null;
    return state.active.def.objectives[state.stepIndex];
  }

  function startChapter(index) {
    const def = CHAPTERS[index];
    if (!def) return false;
    state.active = { kind: 'chapter', def };
    state.stepIndex = 0;
    state.timer = 0;
    state.waitLeft = 0;
    state.failed = null;
    sim.state.mission = { id: def.id, title: def.title, step: 0, steps: def.objectives.length };
    applyObjective();
    return true;
  }

  function startSideJob(id) {
    const def = SIDE_JOBS.find((j) => j.id === id);
    if (!def || state.active) return false;
    state.active = { kind: 'side', def };
    state.stepIndex = 0;
    state.timer = 0;
    state.waitLeft = 0;
    state.failed = null;
    sim.state.sideJob = { id: def.id, title: def.title, step: 0, steps: def.objectives.length };
    if (def.id === 'vigilante') spawnTargetCar();
    if (def.id === 'repo') markRepoCar();
    applyObjective();
    return true;
  }

  function spawnTargetCar() {
    const car = {
      x: 700, z: 340, angle: Math.PI / 2, speed: 12, dir: 1, vertical: false,
      color: 0x2e6fc2, model: 'coupe', target: true,
    };
    sim.state.traffic.push(car);
    state.targetCar = car;
  }

  function markRepoCar() {
    const near = sim.state.parked.reduce((best, c) => {
      const d = dist(c.x, c.z, 430, 190);
      return !best || d < best.d ? { car: c, d } : best;
    }, null);
    if (near) near.car.marked = true;
  }

  function applyObjective() {
    const obj = objective();
    if (!obj) return;
    state.timer = obj.seconds ?? 0;
    state.waitLeft = 0;
    if (obj.x !== undefined) sim.setMarker({ x: obj.x, z: obj.z, label: obj.label });
    else if (obj.type === 'chase' && state.targetCar) {
      sim.setMarker({ x: state.targetCar.x, z: state.targetCar.z, label: obj.label });
    } else sim.clearMarker();
  }

  function advance() {
    state.stepIndex += 1;
    const def = currentDef();
    if (state.active.kind === 'chapter') sim.state.mission.step = state.stepIndex;
    else sim.state.sideJob.step = state.stepIndex;
    if (state.stepIndex >= def.objectives.length) {
      finish(true);
      return;
    }
    applyObjective();
  }

  function finish(won) {
    const def = currentDef();
    const kind = state.active.kind;
    if (won) {
      sim.earn(def.pay, `${def.title} complete`);
      state.completed.push(def.id);
      if (kind === 'chapter') {
        sim.state.mission = null;
        state.chapterIndex = Math.min(CHAPTERS.length, state.chapterIndex + 1);
      } else {
        sim.state.sideJob = null;
      }
      if (state.targetCar) {
        const at = sim.state.traffic.indexOf(state.targetCar);
        if (at >= 0) sim.state.traffic.splice(at, 1);
        state.targetCar = null;
      }
      sim.clearMarker();
      state.active = null;
    } else {
      state.failed = def.title;
      sim.state.mission = kind === 'chapter' ? { id: def.id, title: `${def.title} — FAILED`, step: state.stepIndex, steps: def.objectives.length } : sim.state.mission;
      if (kind === 'side') sim.state.sideJob = null;
      sim.clearMarker();
      state.active = null;
    }
  }

  function fail(reason) {
    const def = currentDef();
    if (!def) return;
    state.failed = reason;
    if (state.active.kind === 'side') {
      sim.state.sideJob = null;
      if (state.targetCar) {
        const at = sim.state.traffic.indexOf(state.targetCar);
        if (at >= 0) sim.state.traffic.splice(at, 1);
        state.targetCar = null;
      }
    }
    sim.clearMarker();
    state.active = null;
  }

  function update(dt) {
    if (!state.active) return;
    const obj = objective();
    if (!obj) return;
    const s = sim.state;
    const p = s.player;
    if (obj.seconds !== undefined && obj.type !== 'chase') {
      state.timer -= dt;
      if (state.timer <= 0) {
        fail(`${currentDef().title} — out of time`);
        return;
      }
    }
    if (obj.type === 'chase') {
      state.timer -= dt;
      const t = state.targetCar;
      if (!t) { fail('Target lost'); return; }
      sim.setMarker({ x: t.x, z: t.z, label: obj.label });
      // The runner flees along the roads at a steady clip.
      t.speed = 13;
      t.x += Math.sin(t.angle) * t.speed * dt;
      t.z += Math.cos(t.angle) * t.speed * dt;
      if (t.x < 480) { t.angle = Math.PI / 2; }
      if (t.x > 940) { t.angle = -Math.PI / 2; }
      if (dist(p.x, p.z, t.x, t.z) < 5) {
        advance();
        return;
      }
      if (state.timer <= 0) { fail('The runner got away'); return; }
      return;
    }
    if (obj.type === 'steal') {
      if (!p.onFoot) { advance(); }
      return;
    }
    if (obj.type === 'repo') {
      const marked = s.parked.find((c) => c.marked);
      if (!p.onFoot && !marked) { advance(); }
      return;
    }
    if (obj.type === 'lose') {
      if (sim.wantedStars() === 0) { advance(); }
      return;
    }
    if (obj.type === 'goto' || obj.type === 'drive' || obj.type === 'timed' || obj.type === 'stealth') {
      if (obj.type === 'drive' && p.onFoot) return;
      const d = dist(p.x, p.z, obj.x, obj.z);
      if (d <= (obj.radius ?? 12)) {
        if (obj.type === 'stealth' && sim.wantedStars() > 0) {
          fail('Arrived hot — the deal is off');
          return;
        }
        if (obj.wait) {
          if (state.waitLeft <= 0) state.waitLeft = obj.wait;
          state.waitLeft -= dt;
          if (state.waitLeft <= 0) advance();
          return;
        }
        advance();
      }
      return;
    }
  }

  function statusText() {
    if (!state.active) {
      if (state.chapterIndex >= CHAPTERS.length) return 'All chapters complete — free roam, Port Solano is yours.';
      return `Next: ${CHAPTERS[state.chapterIndex].title} — press M to start`;
    }
    const obj = objective();
    if (!obj) return '';
    let text = `${currentDef().title} — ${obj.label}`;
    if (obj.seconds !== undefined) text += ` (${Math.max(0, Math.ceil(state.timer))}s)`;
    return text;
  }

  return {
    state, chapters: CHAPTERS, sideJobs: SIDE_JOBS, places: sim.city.places,
    startChapter, startSideJob, update, statusText, objective, currentDef,
    nextChapter() {
      if (state.active) return false;
      return startChapter(state.chapterIndex);
    },
  };
}
