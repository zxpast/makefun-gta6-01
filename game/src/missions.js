// Solano Heat — missions and the story. One job: the five-chapter story of Lucia
// Vega, plus the side jobs that pay between chapters. Each mission is a small
// state machine: an objective, a target point, and what happens when you arrive,
// shoot, or escape. The world calls update() every step and reads `objective`.
export const STORY = [
  {
    id: 'm1', chapter: 1, title: 'First Wheels',
    brief: 'Lucia needs wheels. Steal any car and bring it to the Marina.',
    intro: 'Lucia Vega, ex-mechanic, back in Port Solano with $250 and a grudge. The Salt Kings took her garage. First: wheels.',
    steps: [
      { kind: 'stealCar', text: 'Steal a car (walk up to one and press E)' },
      { kind: 'goto', x: 900, y: 3260, radius: 130, text: 'Drive to the Marina' },
    ],
    reward: 400,
  },
  {
    id: 'm2', chapter: 2, title: 'The Pickup',
    brief: 'Pick up the package at the Docks and bring it home. Keep it quiet.',
    intro: 'A friend of a friend needs a package moved. The Docks, midnight-ish, no questions.',
    steps: [
      { kind: 'goto', x: 2500, y: 3260, radius: 130, text: 'Reach the Docks pickup' },
      { kind: 'goto', x: 1250, y: 750, radius: 130, text: 'Bring the package to the Safehouse' },
    ],
    reward: 700,
    wantedOnPickup: 1,
  },
  {
    id: 'm3', chapter: 3, title: 'Getaway',
    brief: 'The cops made you at the Docks. Lose a 2-star wanted level, then reach the Safehouse.',
    intro: 'A patrol car spotted the handoff. Now the whole city is looking for Lucia.',
    steps: [
      { kind: 'wanted', stars: 2, text: 'Lose the heat (stay out of sight)' },
      { kind: 'goto', x: 1250, y: 750, radius: 130, text: 'Reach the Safehouse' },
    ],
    reward: 900,
    startWanted: 2,
  },
  {
    id: 'm4', chapter: 4, title: 'Payback',
    brief: 'The Salt Kings run the warehouse on Eastside. Take out 6 of their crew.',
    intro: 'The warehouse is where they chopped her garage cars. Time to return the favour.',
    steps: [
      { kind: 'goto', x: 2050, y: 2350, radius: 160, text: 'Reach the Salt Kings Warehouse' },
      { kind: 'eliminate', count: 6, text: 'Take out 6 Salt Kings crew' },
    ],
    reward: 1500,
  },
  {
    id: 'm5', chapter: 5, title: 'The Big Score',
    brief: 'Hit Solano Bank, grab the cash, and lose a 3-star wanted level at the Safehouse.',
    intro: 'One job to buy the garage back. The bank, the vault, the whole city chasing you.',
    steps: [
      { kind: 'goto', x: 2450, y: 1150, radius: 130, text: 'Reach Solano Bank' },
      { kind: 'wait', seconds: 6, text: 'Crack the vault (stay in the circle)' },
      { kind: 'escape', stars: 3, text: 'Escape the 3-star wanted level at the Safehouse' },
    ],
    reward: 5000,
  },
  {
    id: 'm6', chapter: 6, title: 'Midnight Run',
    brief: 'A buyer in North Hills wants the Docks package in 75 seconds. Drive fast — the clock is the boss.',
    intro: 'Midnight run. The package is hot, the buyer is impatient, and North Hills is a long way from the Docks.',
    steps: [
      { kind: 'goto', x: 2500, y: 3260, radius: 130, text: 'Pick up the package at the Docks' },
      { kind: 'timedGoto', x: 3600, y: 700, radius: 130, seconds: 75, text: 'Deliver to North Hills before the clock runs out' },
    ],
    reward: 1200,
  },
  {
    id: 'm7', chapter: 7, title: 'Silent Pickup',
    brief: 'A contact waits at Sunset Pier. Get there clean — any wanted star and the deal is off.',
    intro: 'The Pier at dawn. One quiet handoff, no sirens. The Salt Kings have eyes on the Boardwalk — stay invisible.',
    steps: [
      { kind: 'stealth', x: 300, y: 1500, radius: 140, text: 'Reach Sunset Pier with NO wanted stars' },
      { kind: 'stealth', x: 1250, y: 750, radius: 130, text: 'Bring the handoff home clean — no wanted stars' },
    ],
    reward: 1800,
  },
];

export const SIDE_JOBS = [
  { id: 'taxi', title: 'Taxi Fare', text: 'Pick up the fare and drop them off', pay: 150 },
  { id: 'delivery', title: 'Courier Run', text: 'Deliver the parcel across town', pay: 200 },
  { id: 'vigilante', title: 'Vigilante', text: 'Stop the getaway car', pay: 350 },
  { id: 'repo', title: 'Repo Run', text: 'Steal a car and deliver it to the Eastside garage', pay: 500 },
];

export function makeMissionState() {
  return {
    index: 0, // which story mission is active
    step: 0,
    active: false,
    done: false,
    stepProgress: 0,
    stepTimer: 0,
    eliminateCount: 0,
    message: '',
    messageTimer: 0,
    sideJob: null,
    sideStep: 0,
    sideTarget: null,
    completed: [], // ids of finished story missions
  };
}

export function currentMission(state) {
  return STORY[state.index] || null;
}

export function objectiveText(state) {
  if (state.sideJob) {
    const job = SIDE_JOBS.find((j) => j.id === state.sideJob);
    if (job) {
      if (job.id === 'repo' && state.sideStep === 0) return 'Repo Run: steal any car first';
      if (job.id === 'repo') return 'Repo Run: deliver the car to the Eastside garage';
      return `${job.title}: ${job.text}`;
    }
  }
  const m = currentMission(state);
  if (!m) return 'Story complete — free roam. Press M for a side job.';
  if (!state.active) return `Next: ${m.title} — press M to start`;
  const step = m.steps[state.step];
  return step ? `${m.title}: ${step.text}` : m.title;
}

export function startMission(state, player) {
  const m = currentMission(state);
  if (!m || state.active) return false;
  state.active = true;
  state.step = 0;
  state.stepProgress = 0;
  state.stepTimer = 0;
  state.eliminateCount = 0;
  state.message = m.intro;
  state.messageTimer = 6;
  if (m.startWanted) {
    player.wanted = Math.max(player.wanted, m.startWanted);
  }
  return true;
}

export function showMessage(state, text, seconds) {
  state.message = text;
  state.messageTimer = seconds || 4;
}

// Advance one step; returns 'complete' when the mission finishes, else null.
export function updateMission(state, ctx, dt) {
  if (state.messageTimer > 0) state.messageTimer -= dt;
  const m = currentMission(state);
  if (!m || !state.active) return null;
  const step = m.steps[state.step];
  if (!step) return null;
  const px = ctx.player.x;
  const py = ctx.player.y;
  const dist = (x, y) => Math.hypot(px - x, py - y);

  if (step.kind === 'stealCar') {
    if (ctx.player.inCar) return advance(state);
  } else if (step.kind === 'goto') {
    if (dist(step.x, step.y) < step.radius) {
      if (m.wantedOnPickup && state.step === 0) {
        ctx.player.wanted = Math.max(ctx.player.wanted, m.wantedOnPickup);
        showMessage(state, 'Package grabbed — the cops noticed!', 4);
      }
      return advance(state);
    }
  } else if (step.kind === 'wanted') {
    if (ctx.player.wanted === 0) return advance(state);
  } else if (step.kind === 'eliminate') {
    if (state.eliminateCount >= step.count) return advance(state);
  } else if (step.kind === 'wait') {
    if (dist(step.x || 2450, step.y || 1150) < 130) {
      state.stepTimer += dt;
      if (state.stepTimer >= step.seconds) return advance(state);
    } else {
      state.stepTimer = 0;
    }
  } else if (step.kind === 'timedGoto') {
    // Countdown delivery: the clock starts on first entry into the step
    // (advance() resets stepTimer to 0) and running out sends Lucia back
    // to the pickup — a real fail-and-retry loop, not a free pass.
    if (state.stepTimer <= 0) state.stepTimer = step.seconds;
    state.stepTimer -= dt;
    if (dist(step.x, step.y) < step.radius) return advance(state);
    if (state.stepTimer <= 0) {
      state.stepTimer = 0;
      state.step = 0;
      showMessage(state, 'Too slow — the buyer walked. Back to the Docks!', 4);
      return 'step';
    }
  } else if (step.kind === 'stealth') {
    // Only counts while clean: arriving with any wanted star does not
    // complete the step — lose the heat and come back.
    if (dist(step.x, step.y) < step.radius) {
      if (ctx.player.wanted === 0) return advance(state);
      if (state.messageTimer <= 0) showMessage(state, 'Spotted! Lose the heat, then come back clean.', 3);
    }
  } else if (step.kind === 'escape') {
    if (ctx.player.wanted === 0 && dist(1250, 750) < 130) return advance(state);
  }
  return null;
}

function advance(state) {
  const m = currentMission(state);
  state.step += 1;
  state.stepTimer = 0;
  if (state.step >= m.steps.length) {
    state.completed.push(m.id);
    state.active = false;
    state.done = state.index >= STORY.length - 1;
    state.index += 1;
    return 'complete';
  }
  return 'step';
}

// The target point the minimap and the world arrow should point at.
export function missionTarget(state) {
  const m = currentMission(state);
  if (state.sideJob && state.sideTarget) return state.sideTarget;
  if (!m || !state.active) return null;
  const step = m.steps[state.step];
  if (!step) return null;
  if (step.kind === 'goto' || step.kind === 'wait' || step.kind === 'timedGoto' || step.kind === 'stealth') return { x: step.x || 2450, y: step.y || 1150, radius: step.radius || 130 };
  if (step.kind === 'escape') return { x: 1250, y: 750, radius: 130 };
  return null;
}

export function startSideJob(state, rng, player) {
  if (state.sideJob || (currentMission(state) && state.active)) return null;
  const job = SIDE_JOBS[Math.floor(rng() * SIDE_JOBS.length)];
  state.sideJob = job.id;
  state.sideStep = 0;
  if (job.id === 'repo') {
    // Phase 0: steal a car first — no destination marker until Lucia has one.
    state.sideTarget = null;
    showMessage(state, `Repo Run: steal any car, then deliver it — $${job.pay}`, 5);
    return job;
  }
  // Pick a destination far from the player, on a road.
  const dest = {
    x: 400 + Math.floor(rng() * 11) * 400,
    y: 300 + Math.floor(rng() * 8) * 400,
  };
  state.sideTarget = dest;
  showMessage(state, `${job.title}: ${job.text} — $${job.pay}`, 5);
  return job;
}

export function updateSideJob(state, ctx, dt) {
  if (!state.sideJob) return null;
  // Repo Run phase 0: wait until Lucia is in a car, then set the garage target.
  if (state.sideJob === 'repo' && state.sideStep === 0) {
    if (ctx.player.inCar) {
      state.sideStep = 1;
      state.sideTarget = { x: 3200, y: 3100 };
      showMessage(state, 'Repo target secured — deliver it to the Eastside garage', 4);
    }
    return null;
  }
  const target = state.sideTarget;
  if (!target) return null;
  const dist = Math.hypot(ctx.player.x - target.x, ctx.player.y - target.y);
  if (dist < 120) {
    const job = SIDE_JOBS.find((j) => j.id === state.sideJob);
    state.sideJob = null;
    state.sideTarget = null;
    return job;
  }
  return null;
}
