// Solano Heat — the seven chapters and the four side jobs.
//
// Missions are plain data plus a small state machine. A mission is a list of
// steps; a step is one kind of work (walk somewhere, steal a car, drive to a
// marker before a clock runs out, arrive with no heat on you, stand in a zone,
// lose the police). The engine watches the world each step and advances the
// step when its condition is met, pays the reward at the end, and hands the
// next chapter over. Side jobs are the same shape, repeatable, and pay cash.
// Nothing here draws or touches the browser, so the whole of it runs in Node
// for tests: give it a world snapshot and it tells you what happened.
import { MARKERS } from './city.js';

export const CHAPTERS = [
  {
    id: 'first-ride',
    title: 'Chapter 1 — First Ride',
    briefing: 'Lucia is back in Port Solano with nothing but a debt. Steal the parked car by the safehouse and bring it to the Eastside garage.',
    reward: 300,
    steps: [
      { kind: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { kind: 'driveTo', marker: 'eastsideGarage', text: 'Drive the car to the Eastside garage' },
    ],
  },
  {
    id: 'courier',
    title: 'Chapter 2 — Courier',
    briefing: 'The Docks crew needs a package moved, no questions. Pick it up downtown and run it to the Marina.',
    reward: 450,
    steps: [
      { kind: 'goto', marker: 'downtownPickup', text: 'Pick up the package downtown' },
      { kind: 'driveTo', marker: 'marinaDrop', text: 'Deliver the package to the Marina' },
    ],
  },
  {
    id: 'gang-pickup',
    title: 'Chapter 3 — Gang Pickup',
    briefing: 'Marco is waiting on the Eastside and the Docks crew wants him home. Fetch him, then drive him to the Docks.',
    reward: 600,
    steps: [
      { kind: 'goto', marker: 'eastsideGarage', text: 'Pick up Marco on the Eastside' },
      { kind: 'driveTo', marker: 'docksPickup', text: 'Drive Marco to the Docks' },
    ],
  },
  {
    id: 'getaway',
    title: 'Chapter 4 — Getaway',
    briefing: 'The job went loud. Three stars and every cop in the city is coming. Lose them, then get to the safehouse.',
    reward: 800,
    heatOnStart: 3,
    steps: [
      { kind: 'loseHeat', text: 'Lose the police (get wanted down to zero stars)' },
      { kind: 'goto', marker: 'safehouse', text: 'Reach the safehouse' },
    ],
  },
  {
    id: 'turf',
    title: 'Chapter 5 — Turf Takeover',
    briefing: 'North Hills belongs to whoever stands on it. Hold all three turf spots, three seconds each, and the Hills are yours.',
    reward: 1000,
    steps: [
      { kind: 'wait', marker: 'turfWest', seconds: 3, text: 'Hold the Overlook turf (3s)' },
      { kind: 'wait', marker: 'turfNorth', seconds: 3, text: 'Hold the Hills turf (3s)' },
      { kind: 'wait', marker: 'turfEast', seconds: 3, text: 'Hold the Ridge turf (3s)' },
    ],
  },
  {
    id: 'midnight-run',
    title: 'Chapter 6 — Midnight Run',
    briefing: 'One crate, Docks to North Hills, seventy-five seconds, no excuses. Miss the window and you start the run again.',
    reward: 1200,
    steps: [
      { kind: 'goto', marker: 'docksPickup', text: 'Pick up the crate at the Docks' },
      { kind: 'timed', marker: 'northHillsDrop', seconds: 75, text: 'Deliver to North Hills — 75 seconds' },
    ],
  },
  {
    id: 'silent-pickup',
    title: 'Chapter 7 — Silent Pickup',
    briefing: 'The last job. A handoff on Sunset Pier, and it only happens clean: bring it home with zero stars, or the deal is off.',
    reward: 1800,
    steps: [
      { kind: 'goto', marker: 'sunsetPier', text: 'Reach Sunset Pier' },
      { kind: 'stealth', marker: 'safehouse', text: 'Bring the handoff home — zero wanted stars' },
    ],
  },
];

export const JOBS = {
  taxi: { title: 'Taxi fare', pay: 120, blurb: 'Pick up the fare and drop them off.' },
  courier: { title: 'Courier dash', pay: 150, blurb: 'A timed drop, 45 seconds.' },
  vigilante: { title: 'Vigilante', pay: 350, blurb: 'Ram the target car three times.' },
  repo: { title: 'Repo run', pay: 500, blurb: 'Steal any car, deliver it to the Eastside garage.' },
};

const STEP_RADIUS = 60;
const ZONE_RADIUS = 70;

export function createMissions() {
  return {
    chapter: 0,
    step: 0,
    stepTimer: 0,
    stepHeld: 0,
    spotted: false,
    completed: [],
    cash: 0,
    job: null,
    jobTimer: 0,
    jobHeld: 0,
    jobHits: 0,
    jobTarget: null,
  };
}

export function currentChapter(state) {
  return state.chapter < CHAPTERS.length ? CHAPTERS[state.chapter] : null;
}

export function currentStep(state) {
  const chapter = currentChapter(state);
  if (!chapter) return null;
  return chapter.steps[state.step] ?? null;
}

/** The marker the HUD and the minimap should point at, or null. */
export function stepMarker(state) {
  const step = currentStep(state);
  if (step && step.marker) return MARKERS[step.marker];
  if (state.job && state.job.marker) return MARKERS[state.job.marker];
  return null;
}

/** The objective line the HUD shows. */
export function objectiveText(state) {
  const chapter = currentChapter(state);
  const step = currentStep(state);
  if (chapter && step) return `${chapter.title}: ${step.text}`;
  if (state.job) return `${JOBS[state.job.kind].title}: ${state.job.text}`;
  if (!chapter) return 'All chapters complete — Port Solano is yours. Side jobs still pay.';
  return 'Press M for missions.';
}

function markerAt(state, name) {
  return MARKERS[name];
}

function near(x, y, marker, radius) {
  return Math.hypot(x - marker.x, y - marker.y) < radius;
}

/**
 * Advance one step of the story. `snap` is the world's snapshot:
 * { x, y, inCar, wanted }. Returns an array of event strings:
 * 'step' (a step finished), 'mission' (a chapter finished, reward paid),
 * 'timeout' (the timed step ran out — back to its pickup), 'spotted' (arrived
 * hot on a stealth step). The timer on a timed step arms when the step starts.
 */
export function updateMissions(state, snap, dt) {
  const events = [];
  const chapter = currentChapter(state);
  if (!chapter) return events;
  const step = chapter.steps[state.step];
  if (!step) return events;

  if (step.kind === 'goto') {
    if (near(snap.x, snap.y, markerAt(state, step.marker), STEP_RADIUS)) {
      state.step += 1;
      state.stepHeld = 0;
      events.push('step');
    }
  } else if (step.kind === 'steal') {
    if (snap.inCar) {
      state.step += 1;
      events.push('step');
    }
  } else if (step.kind === 'driveTo') {
    if (snap.inCar && near(snap.x, snap.y, markerAt(state, step.marker), STEP_RADIUS)) {
      state.step += 1;
      events.push('step');
    }
  } else if (step.kind === 'timed') {
    if (state.stepTimer <= 0 && !state.armed) {
      state.stepTimer = step.seconds;
      state.armed = true;
    }
    state.stepTimer -= dt;
    if (state.stepTimer <= 0) {
      // The window closed: back to the pickup step to run it again.
      state.step = 0;
      state.stepTimer = 0;
      state.armed = false;
      events.push('timeout');
    } else if (near(snap.x, snap.y, markerAt(state, step.marker), STEP_RADIUS)) {
      state.step += 1;
      state.stepTimer = 0;
      state.armed = false;
      events.push('step');
    }
  } else if (step.kind === 'stealth') {
    if (near(snap.x, snap.y, markerAt(state, step.marker), STEP_RADIUS)) {
      if (snap.wanted === 0) {
        state.step += 1;
        state.spotted = false;
        events.push('step');
      } else if (!state.spotted) {
        state.spotted = true;
        events.push('spotted');
      }
    }
  } else if (step.kind === 'wait') {
    if (near(snap.x, snap.y, markerAt(state, step.marker), ZONE_RADIUS)) {
      state.stepHeld += dt;
      if (state.stepHeld >= step.seconds) {
        state.step += 1;
        state.stepHeld = 0;
        events.push('step');
      }
    } else {
      state.stepHeld = 0;
    }
  } else if (step.kind === 'loseHeat') {
    if (snap.wanted === 0) {
      state.step += 1;
      events.push('step');
    }
  }

  if (state.step >= chapter.steps.length) {
    state.cash += chapter.reward;
    state.completed.push(chapter.id);
    state.chapter += 1;
    state.step = 0;
    state.stepTimer = 0;
    state.stepHeld = 0;
    state.armed = false;
    state.spotted = false;
    events.push('mission');
  }
  return events;
}

/** Start a side job. `spot` is where the job's first marker sits. */
export function startJob(state, kind, spot) {
  const job = { kind, text: JOBS[kind].blurb, marker: spot?.marker ?? null, x: spot?.x ?? 0, y: spot?.y ?? 0 };
  if (kind === 'taxi') {
    job.text = 'Pick up the fare';
    job.marker = null;
  } else if (kind === 'courier') {
    job.text = 'Deliver the parcel — 45 seconds';
    job.marker = 'marinaDrop';
    state.jobTimer = 45;
  } else if (kind === 'vigilante') {
    job.text = 'Ram the target car 3 times';
    job.marker = null;
  } else if (kind === 'repo') {
    job.text = 'Steal any car, deliver it to the Eastside garage';
    job.marker = 'eastsideGarage';
  }
  state.job = job;
  state.jobHeld = 0;
  state.jobHits = 0;
  return job;
}

export function cancelJob(state) {
  state.job = null;
  state.jobTimer = 0;
  state.jobHeld = 0;
  state.jobHits = 0;
  state.jobTarget = null;
}

/**
 * Advance the active side job. Returns 'jobDone' when it pays, 'jobFail' when
 * a timed job runs out. `snap` is the world snapshot; `rammed` is true on a
 * frame the player rammed the vigilante target.
 */
export function updateJob(state, snap, dt, rammed) {
  if (!state.job) return null;
  const job = state.job;
  if (job.kind === 'taxi') {
    if (!job.pickedUp) {
      if (near(snap.x, snap.y, { x: job.x, y: job.y }, STEP_RADIUS)) {
        job.pickedUp = true;
        job.text = 'Drop the fare at the Marina';
        job.marker = 'marinaDrop';
      }
    } else if (near(snap.x, snap.y, markerAt(state, 'marinaDrop'), STEP_RADIUS)) {
      state.cash += JOBS.taxi.pay;
      cancelJob(state);
      return 'jobDone';
    }
  } else if (job.kind === 'courier') {
    state.jobTimer -= dt;
    if (state.jobTimer <= 0) {
      cancelJob(state);
      return 'jobFail';
    }
    if (near(snap.x, snap.y, markerAt(state, 'marinaDrop'), STEP_RADIUS)) {
      state.cash += JOBS.courier.pay;
      cancelJob(state);
      return 'jobDone';
    }
  } else if (job.kind === 'vigilante') {
    if (rammed) state.jobHits += 1;
    if (state.jobHits >= 3) {
      state.cash += JOBS.vigilante.pay;
      cancelJob(state);
      return 'jobDone';
    }
  } else if (job.kind === 'repo') {
    if (snap.inCar && near(snap.x, snap.y, markerAt(state, 'eastsideGarage'), STEP_RADIUS)) {
      state.cash += JOBS.repo.pay;
      cancelJob(state);
      return 'jobDone';
    }
  }
  return null;
}
