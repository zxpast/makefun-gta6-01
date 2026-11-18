// The eight chapters and the four side jobs of Port Solano.
//
// A chapter is plain data: a list of steps, and a step is one kind of work
// (steal a car, reach a marker, deliver before a clock runs out, arrive
// clean, hold a zone, lose the police). The engine watches a world snapshot
// each step and advances when the condition is met, pays the reward at the
// end, and hands the next chapter over. Side jobs are the same shape,
// repeatable, and pay cash. Nothing here draws or touches the browser, so
// the whole of it runs in Node for tests.
import { MARKERS } from './city.js';

export const CHAPTERS = [
  {
    id: 'first-ride',
    title: 'Chapter 1 — First Ride',
    briefing: 'Lucia is back in Port Solano with nothing but a debt. Take the parked car by the safehouse and bring it to the Eastside Garage.',
    reward: 300,
    steps: [
      { kind: 'steal', text: 'Steal a car — walk up to one and press E' },
      { kind: 'driveTo', marker: 'eastsideGarage', text: 'Drive the car to the Eastside Garage' },
    ],
  },
  {
    id: 'courier',
    title: 'Chapter 2 — Courier',
    briefing: 'The Docks crew needs a package moved, no questions asked. Collect it downtown and run it to the Marina.',
    reward: 450,
    steps: [
      { kind: 'goto', marker: 'downtownPickup', text: 'Pick up the package downtown' },
      { kind: 'driveTo', marker: 'marinaDrop', text: 'Deliver the package to the Marina' },
    ],
  },
  {
    id: 'gang-pickup',
    title: 'Chapter 3 — Gang Pickup',
    briefing: 'Marco is waiting on the Eastside and the crew wants him home. Fetch him, then drive him down to the Docks.',
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
      { kind: 'loseHeat', text: 'Lose the police — get wanted down to zero stars' },
      { kind: 'goto', marker: 'safehouse', text: 'Reach the safehouse' },
    ],
  },
  {
    id: 'turf',
    title: 'Chapter 5 — Turf Takeover',
    briefing: 'North Hills belongs to whoever stands on it. Hold all three turf spots, four seconds each, and the Hills are yours.',
    reward: 1000,
    steps: [
      { kind: 'wait', marker: 'turfWest', seconds: 4, text: 'Hold the Overlook turf (4s)' },
      { kind: 'wait', marker: 'turfNorth', seconds: 4, text: 'Hold the Hills turf (4s)' },
      { kind: 'wait', marker: 'turfEast', seconds: 4, text: 'Hold the Ridge turf (4s)' },
    ],
  },
  {
    id: 'midnight-run',
    title: 'Chapter 6 — Midnight Run',
    briefing: 'One crate, Docks to North Hills, ninety seconds, no excuses. Miss the window and you run it again.',
    reward: 1200,
    steps: [
      { kind: 'goto', marker: 'docksPickup', text: 'Pick up the crate at the Docks' },
      { kind: 'timed', marker: 'northHillsDrop', seconds: 90, text: 'Deliver to North Hills — 90 seconds' },
    ],
  },
  {
    id: 'silent-pickup',
    title: 'Chapter 7 — Silent Pickup',
    briefing: 'The last quiet job. A handoff on Sunset Pier, and it only happens clean: bring it home with zero stars, or the deal is off.',
    reward: 1800,
    steps: [
      { kind: 'goto', marker: 'sunsetPier', text: 'Reach Sunset Pier' },
      { kind: 'stealth', marker: 'safehouse', text: 'Bring the handoff home — zero wanted stars' },
    ],
  },
  {
    id: 'night-job',
    title: 'Chapter 8 — The Night Job',
    briefing: 'The finale. One package, Pier End to the North Hills, the helicopter already overhead and roadblocks on every fast road. Use the NOS, break the line of sight, and do not stop.',
    reward: 2500,
    heatOnStart: 4,
    night: true,
    steps: [
      { kind: 'goto', marker: 'pierEnd', text: 'Pick up the package at Pier End' },
      { kind: 'timed', marker: 'northHillsDrop', seconds: 150, text: 'Deliver to North Hills — 150 seconds, heli overhead' },
    ],
  },
];

export const JOBS = {
  taxi: { title: 'Taxi Fare', pay: 120, blurb: 'Pick up the fare and drop them off.' },
  courier: { title: 'Courier Dash', pay: 150, blurb: 'A timed drop, 45 seconds.' },
  vigilante: { title: 'Vigilante', pay: 350, blurb: 'Ram the target car three times.' },
  repo: { title: 'Repo Run', pay: 500, blurb: 'Steal any car, deliver it to the Eastside Garage.' },
};

const STEP_RADIUS = 9;
const ZONE_RADIUS = 11;

export function createMissions() {
  return {
    chapter: 0,
    step: 0,
    stepTimer: 0,
    stepHeld: 0,
    armed: false,
    spotted: false,
    completed: [],
    cash: 0,
    job: null,
    jobTimer: 0,
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

export function stepMarker(state) {
  const step = currentStep(state);
  if (step && step.marker) return MARKERS[step.marker];
  if (state.job && state.job.marker) return MARKERS[state.job.marker];
  return null;
}

export function objectiveText(state) {
  const chapter = currentChapter(state);
  const step = currentStep(state);
  if (chapter && step) return `${chapter.title}: ${step.text}`;
  if (state.job) return `${JOBS[state.job.kind].title}: ${state.job.text}`;
  if (!chapter) return 'All chapters complete — Port Solano is yours. Side jobs still pay.';
  return 'Press M for missions.';
}

function near(x, z, marker, radius) {
  return Math.hypot(x - marker.x, z - marker.z) < radius;
}

// Advance one step of the story. `snap` is { x, z, inCar, wanted }.
// Returns event strings: 'step', 'mission', 'timeout', 'spotted'.
export function updateMissions(state, snap, dt) {
  const events = [];
  const chapter = currentChapter(state);
  if (!chapter) return events;
  const step = chapter.steps[state.step];
  if (!step) return events;

  if (step.kind === 'goto') {
    if (near(snap.x, snap.z, MARKERS[step.marker], STEP_RADIUS)) {
      state.step += 1;
      events.push('step');
    }
  } else if (step.kind === 'steal') {
    if (snap.inCar) {
      state.step += 1;
      events.push('step');
    }
  } else if (step.kind === 'driveTo') {
    if (snap.inCar && near(snap.x, snap.z, MARKERS[step.marker], STEP_RADIUS)) {
      state.step += 1;
      events.push('step');
    }
  } else if (step.kind === 'timed') {
    if (!state.armed) {
      state.stepTimer = step.seconds;
      state.armed = true;
    }
    state.stepTimer -= dt;
    if (state.stepTimer <= 0) {
      state.step = 0;
      state.stepTimer = 0;
      state.armed = false;
      events.push('timeout');
    } else if (near(snap.x, snap.z, MARKERS[step.marker], STEP_RADIUS)) {
      state.step += 1;
      state.stepTimer = 0;
      state.armed = false;
      events.push('step');
    }
  } else if (step.kind === 'stealth') {
    if (near(snap.x, snap.z, MARKERS[step.marker], STEP_RADIUS)) {
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
    if (near(snap.x, snap.z, MARKERS[step.marker], ZONE_RADIUS)) {
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

export function startJob(state, kind, spot) {
  const job = { kind, text: JOBS[kind].blurb, marker: spot?.marker ?? null, x: spot?.x ?? 0, z: spot?.z ?? 0 };
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
    job.text = 'Steal any car, deliver it to the Eastside Garage';
    job.marker = 'eastsideGarage';
  }
  state.job = job;
  state.jobHits = 0;
  return job;
}

export function cancelJob(state) {
  state.job = null;
  state.jobTimer = 0;
  state.jobHits = 0;
  state.jobTarget = null;
}

// Advance the active side job. Returns 'jobDone', 'jobFail', or null.
// `rammed` is true on a frame the player rammed the vigilante target.
export function updateJob(state, snap, dt, rammed) {
  if (!state.job) return null;
  const job = state.job;
  if (job.kind === 'taxi') {
    if (!job.pickedUp) {
      if (near(snap.x, snap.z, { x: job.x, z: job.z }, STEP_RADIUS)) {
        job.pickedUp = true;
        job.text = 'Drop the fare at the Marina';
        job.marker = 'marinaDrop';
      }
    } else if (near(snap.x, snap.z, MARKERS.marinaDrop, STEP_RADIUS)) {
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
    if (near(snap.x, snap.z, MARKERS.marinaDrop, STEP_RADIUS)) {
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
    if (snap.inCar && near(snap.x, snap.z, MARKERS.eastsideGarage, STEP_RADIUS)) {
      state.cash += JOBS.repo.pay;
      cancelJob(state);
      return 'jobDone';
    }
  }
  return null;
}
