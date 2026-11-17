// Solano Heat — the rules of Port Solano.
//
// The world holds everything that moves and everything that is owed: the
// player on foot or in a car, the traffic, the pedestrians, the police, the
// wanted level, the clock, the missions and the side jobs, the cash. step()
// advances one fixed step and returns what happened as bit flags, so the caller
// (main.js) can react — banners, sounds, saves — without the world knowing
// about screens or sound. Nothing here draws or touches the browser, and the
// only chance in it comes from the seeded random stream it was built with, so
// the same seed always plays the same city.
import { ACTION_ENTER_CAR, ACTION_PUNCH } from './input.js';
import { CAR, CITY, CLOCK, ON_FOOT, POLICE, WANTED } from './config.js';
import { MARKERS, clampToCity, createCity, districtAt, hitsBuilding } from './city.js';
import {
  nearestCar,
  nearestPed,
  playerOnFoot,
  pointInCar,
  scarePeds,
  spawnPoliceCar,
  spawnTraffic,
  stepPed,
  stepPoliceCar,
  stepTrafficCar,
} from './entities.js';
import {
  CHAPTERS,
  cancelJob,
  createMissions,
  currentChapter,
  currentStep,
  objectiveText,
  startJob,
  stepMarker,
  updateJob,
  updateMissions,
} from './missions.js';

export const EVENT_STEP = 1;
export const EVENT_MISSION = 2;
export const EVENT_TIMEOUT = 4;
export const EVENT_SPOTTED = 8;
export const EVENT_JOB_DONE = 16;
export const EVENT_JOB_FAIL = 32;
export const EVENT_BUSTED = 64;
export const EVENT_WANTED_UP = 128;
export const EVENT_CRIME = 256;
export const EVENT_PUNCH = 512;

const POLICE_SPAWN_EVERY = 4;
const RAM_COOLDOWN = 1;

export function createWorld(random) {
  const city = createCity(random);
  const traffic = spawnTraffic(city, random);
  const missions = createMissions();
  const player = playerOnFoot();

  const state = {
    city,
    random,
    player,
    cars: traffic.cars,
    peds: traffic.peds,
    police: traffic.police,
    wanted: 0,
    wantedTimer: 0,
    policeTimer: 0,
    clockMinutes: CLOCK.startHour * 60 + CLOCK.startMinute,
    elapsed: 0,
    missions,
    banner: null,
    bannerTimer: 0,
    flash: 0,
    tutorialTimer: 15,
    particles: [],
    ramCooldown: 0,
    heatChapter: '',
    farePed: null,
    targetCar: null,
    demo: false,
  };

  function reset() {
    state.player.x = MARKERS.safehouse.x;
    state.player.y = MARKERS.safehouse.y;
    state.player.angle = -Math.PI / 2;
    state.player.inCar = null;
    state.player.health = 100;
    state.player.punchTimer = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.police = [];
    state.clockMinutes = CLOCK.startHour * 60 + CLOCK.startMinute;
    state.elapsed = 0;
    state.banner = null;
    state.bannerTimer = 0;
    state.flash = 0;
    state.tutorialTimer = 15;
    state.particles = [];
    state.heatChapter = '';
    state.farePed = null;
    state.targetCar = null;
    const fresh = spawnTraffic(city, random);
    state.cars = fresh.cars;
    state.peds = fresh.peds;
  }

  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    if (state.wanted > before) {
      state.flash = 0.6;
      return true;
    }
    return false;
  }

  function showBanner(text, sub, seconds) {
    state.banner = { text, sub: sub || '', timer: seconds || 3 };
    state.bannerTimer = seconds || 3;
  }

  function bustPlayer(events) {
    const fine = Math.min(state.missions.cash, POLICE.bustFine);
    state.missions.cash -= fine;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.police = [];
    if (state.player.inCar) {
      state.player.inCar.speed = 0;
      state.player.inCar = null;
    }
    state.player.x = MARKERS.hospital.x;
    state.player.y = MARKERS.hospital.y;
    state.player.health = 100;
    showBanner('BUSTED', `The police took $${fine}. You wake up at the hospital.`, 3.5);
    return events | EVENT_BUSTED;
  }

  function enterNearestCar(events) {
    const car = nearestCar(state.cars, state.player.x, state.player.y, CAR.stealRange);
    if (!car) return events;
    if (!car.parked && Math.abs(car.speed) > 50) return events;
    const stolen = car.parked === true;
    car.parked = false;
    car.playerDriven = true;
    state.player.inCar = car;
    state.player.x = car.x;
    state.player.y = car.y;
    if (stolen && addWanted(WANTED.stealCar)) events |= EVENT_WANTED_UP | EVENT_CRIME;
    return events;
  }

  function exitCar() {
    const car = state.player.inCar;
    if (!car) return;
    car.speed = 0;
    const side = car.angle + Math.PI / 2;
    state.player.x = car.x + Math.cos(side) * 40;
    state.player.y = car.y + Math.sin(side) * 40;
    state.player.inCar = null;
  }

  function punch(events) {
    if (state.player.punchTimer > 0) return events;
    state.player.punchTimer = ON_FOOT.punchCooldown;
    const ped = nearestPed(state.peds, state.player.x, state.player.y, ON_FOOT.punchReach);
    if (!ped) return events | EVENT_PUNCH;
    ped.fleeing = 3;
    ped.down = 1.2;
    scarePeds(state.peds, state.player.x, state.player.y, 220);
    if (addWanted(WANTED.punch)) events |= EVENT_WANTED_UP | EVENT_CRIME;
    return events | EVENT_PUNCH;
  }

  function stepOnFoot(move, running, dt) {
    const speed = running ? ON_FOOT.run : ON_FOOT.walk;
    const nx = state.player.x + move.x * speed * dt;
    const ny = state.player.y + move.y * speed * dt;
    const r = ON_FOOT.radius;
    if (!hitsBuilding(state.city, nx - r, state.player.y - r, r * 2, r * 2)) state.player.x = nx;
    if (!hitsBuilding(state.city, state.player.x - r, ny - r, r * 2, r * 2)) state.player.y = ny;
    const held = clampToCity(state.player.x, state.player.y, r + 4);
    state.player.x = held.x;
    state.player.y = held.y;
    if (move.x !== 0 || move.y !== 0) state.player.angle = Math.atan2(move.y, move.x);
  }

  function stepDriving(move, dt) {
    const car = state.player.inCar;
    const forward = -move.y;
    if (forward > 0) car.speed += CAR.accel * dt;
    else if (forward < 0) car.speed -= CAR.brake * dt;
    else car.speed -= car.speed * 0.9 * dt;
    if (car.speed > 0) car.speed = Math.min(car.speed, car.topSpeed);
    else car.speed = Math.max(car.speed, -CAR.reverseTop);
    const steerAuthority = Math.max(0.3, Math.min(1, Math.abs(car.speed) / 220));
    const turn = move.x * CAR.steer * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
    car.angle += turn;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (hitsBuilding(state.city, nx - 20, ny - 20, 40, 40)) {
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    const held = clampToCity(car.x, car.y, 30);
    car.x = held.x;
    car.y = held.y;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = car.angle;
    if (Math.abs(turn) > 0.02 && Math.abs(car.speed) > 260) {
      state.particles.push({ x: car.x, y: car.y, life: 0.5, kind: 'skid' });
    }
  }

  function stepCarCollisions(events) {
    const mine = state.player.inCar;
    if (!mine) return { events, rammed: false };
    for (const other of state.cars) {
      if (other === mine || other.playerDriven) continue;
      const d = Math.hypot(other.x - mine.x, other.y - mine.y);
      if (d < 46 && d > 0.01) {
        const push = (46 - d) / 2;
        const nx = (other.x - mine.x) / d;
        const ny = (other.y - mine.y) / d;
        other.x += nx * push;
        other.y += ny * push;
        if (Math.abs(mine.speed) > 260) {
          other.speed = mine.speed * 0.5;
          other.parked = false;
        }
        mine.speed *= 0.6;
      }
    }
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.x - mine.x, ped.y - mine.y);
      if (d < 34) {
        if (Math.abs(mine.speed) > 60) {
          ped.down = 2.5;
          ped.fleeing = 3;
          scarePeds(state.peds, ped.x, ped.y, 200);
          if (addWanted(WANTED.hitPed)) events |= EVENT_WANTED_UP | EVENT_CRIME;
        } else {
          ped.fleeing = 1.5;
        }
      }
    }
    if (state.targetCar) {
      const target = state.targetCar;
      const d = Math.hypot(target.x - mine.x, target.y - mine.y);
      if (d < 50 && Math.abs(mine.speed) > 150 && state.ramCooldown <= 0) {
        state.ramCooldown = RAM_COOLDOWN;
        target.speed = 320;
        target.angle += 0.6;
        return { events: events | EVENT_CRIME, rammed: true };
      }
    }
    return { events, rammed: false };
  }

  function stepWanted(dt, events) {
    // The heat fades when no police car can see the player.
    let seen = false;
    for (const cop of state.police) {
      if (Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 520) { seen = true; break; }
    }
    if (state.wanted > 0 && !seen) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
    // More stars, more cars: one fresh unit every few seconds up to the cap.
    const wantCars = Math.min(POLICE.maxCars, Math.max(0, state.wanted - 1));
    if (state.wanted >= POLICE.spawnAtWanted && state.police.length < wantCars) {
      state.policeTimer -= dt;
      if (state.policeTimer <= 0) {
        state.policeTimer = POLICE_SPAWN_EVERY;
        state.police.push(spawnPoliceCar(state.city, state.random, state.player));
      }
    }
    for (let i = state.police.length - 1; i >= 0; i -= 1) {
      const cop = state.police[i];
      if (cop.ramTimer > 0) cop.ramTimer -= dt;
      const touched = stepPoliceCar(cop, state.player, dt);
      if (touched && cop.ramTimer <= 0) {
        // One ram per second per car, and the cop is shoved back off the
        // player — otherwise a glued cop deals damage every single step and
        // melts 100 health in under a second.
        cop.ramTimer = 1.0;
        const dx = cop.x - state.player.x;
        const dy = cop.y - state.player.y;
        const d = Math.hypot(dx, dy) || 1;
        cop.x += (dx / d) * 40;
        cop.y += (dy / d) * 40;
        if (state.player.inCar) {
          state.player.health -= POLICE.ramDamage;
          cop.speed *= 0.4;
          if (state.player.health <= 0) return bustPlayer(events);
        } else {
          return bustPlayer(events);
        }
      }
    }
    if (state.wanted === 0 && state.police.length > 0) state.police = [];
    return events;
  }

  /**
   * One fixed step. `input` is { move: {x, y}, running, actions } (see input.js
   * for the ACTION_* flags). With `demo` set, the city lives on its own behind
   * the title screen: traffic drives, nobody commits a crime. Returns a bit
   * mask of EVENT_* flags for the caller to react to.
   */
  function step(dt, input) {
    let events = 0;
    state.elapsed += dt;
    // One game minute passes every real second.
    state.clockMinutes += dt;
    if (state.clockMinutes >= 1440) state.clockMinutes -= 1440;
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) state.banner = null;
    }
    if (state.flash > 0) state.flash -= dt;
    if (state.tutorialTimer > 0) state.tutorialTimer -= dt;
    if (state.ramCooldown > 0) state.ramCooldown -= dt;
    if (state.player.punchTimer > 0) state.player.punchTimer -= dt;
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      state.particles[i].life -= dt;
      if (state.particles[i].life <= 0) state.particles.splice(i, 1);
    }

    const actions = input ? input.actions : 0;
    if (!state.demo && actions !== undefined) {
      if (actions & ACTION_ENTER_CAR) events = enterNearestCar(events);
      if (actions & ACTION_PUNCH) events = punch(events);
    }

    if (state.player.inCar) stepDriving(input ? input.move : { x: 0, y: 0 }, dt);
    else if (input) stepOnFoot(input.move, input.running, dt);

    for (const car of state.cars) {
      if (car.playerDriven) continue;
      stepTrafficCar(state.city, car, dt, state.random);
    }
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      stepPed(state.city, ped, dt, state.player, state.random);
    }

    const collision = stepCarCollisions(events);
    events = collision.events;
    events = stepWanted(dt, events);

    // The getaway chapter starts loud: three stars the moment it opens.
    const chapter = currentChapter(state.missions);
    if (chapter && chapter.heatOnStart && state.heatChapter !== chapter.id) {
      state.heatChapter = chapter.id;
      state.wanted = chapter.heatOnStart;
      state.flash = 0.6;
      events |= EVENT_WANTED_UP;
    }

    const snap = { x: state.player.x, y: state.player.y, inCar: !!state.player.inCar, wanted: state.wanted };
    if (!state.demo) {
      const missionEvents = updateMissions(state.missions, snap, dt);
    for (const name of missionEvents) {
      if (name === 'step') events |= EVENT_STEP;
      else if (name === 'mission') {
        events |= EVENT_MISSION;
        const done = CHAPTERS[state.missions.chapter - 1];
        showBanner('MISSION COMPLETE', done ? `+$${done.reward} — ${done.title}` : '', 3.5);
      } else if (name === 'timeout') {
        events |= EVENT_TIMEOUT;
        showBanner('TOO SLOW', 'The window closed — back to the Docks pickup.', 3);
      } else if (name === 'spotted') {
        events |= EVENT_SPOTTED;
        showBanner('SPOTTED', 'You arrived hot — lose the heat, then come back clean.', 3);
      }
    }
    const jobResult = updateJob(state.missions, snap, dt, collision.rammed);
    if (jobResult === 'jobDone') {
      events |= EVENT_JOB_DONE;
      showBanner('JOB DONE', 'Paid in full.', 3);
    } else if (jobResult === 'jobFail') {
      events |= EVENT_JOB_FAIL;
      showBanner('JOB FAILED', 'The clock ran out.', 3);
    }
    }

    if (state.wanted === 0 && state.player.health < 100) {
      state.player.health = Math.min(100, state.player.health + 2 * dt);
    }
    return events;
  }

  /** Start a side job from the menu. Returns the job or null. */
  function beginJob(kind) {
    cancelJob(state.missions);
    if (kind === 'taxi') {
      const spot = { x: state.player.x + 160, y: state.player.y };
      const fare = { x: spot.x, y: spot.y, angle: 0, speed: 0, wait: 9999, fleeing: 0, color: '#f2c94c', fare: true };
      state.peds.push(fare);
      state.farePed = fare;
      return startJob(state.missions, 'taxi', { x: spot.x, y: spot.y });
    }
    if (kind === 'vigilante') {
      const target = spawnPoliceCar(state.city, state.random, state.player);
      target.kind = 'target';
      target.topSpeed = 480;
      state.cars.push(target);
      state.targetCar = target;
      const job = startJob(state.missions, 'vigilante', null);
      state.missions.jobTarget = target;
      return job;
    }
    return startJob(state.missions, kind, null);
  }

  function snapshot() {
    return { x: state.player.x, y: state.player.y, inCar: !!state.player.inCar, wanted: state.wanted };
  }

  function district() {
    return districtAt(state.player.x, state.player.y);
  }

  function saveData() {
    return {
      cash: state.missions.cash,
      chapter: state.missions.chapter,
      completed: state.missions.completed.slice(),
      bestCash: Math.max(state.missions.cash, state.bestCash || 0),
    };
  }

  function applySave(save) {
    if (!save) return;
    state.missions.cash = save.cash;
    state.missions.chapter = Math.min(save.chapter, CHAPTERS.length);
    state.missions.completed = save.completed.slice();
    state.bestCash = save.bestCash;
  }

  reset();
  return {
    state, reset, step, snapshot, district, saveData, applySave, beginJob,
    marker: () => stepMarker(state.missions),
    objective: () => objectiveText(state.missions),
    chapter: () => currentChapter(state.missions),
    currentStepInfo: () => currentStep(state.missions),
  };
}
