// Port Solano — the rules, with no drawing and no browser in them.
//
// The simulation holds everything that moves and everything that is owed:
// Lucia on foot or in a car, traffic, pedestrians, police, the helicopter,
// roadblocks, the wanted level, weapons, the garage, the radio station, the
// clock, the missions and the side jobs, the cash. step() advances one
// fixed step and returns what happened as bit flags, so the caller (the
// browser loop, the autopilot, the screenshot painter) can react without
// the simulation knowing about screens or sound. The only chance in it
// comes from the seeded random stream it was built with.
import { CAR, CITY, CLOCK, GARAGE, HELI, NOS, PLAYER, POLICE, ROADBLOCK, TRAFFIC, WANTED, WEAPONS } from './config.js';
import { MARKERS, clampToCity, createCity, districtNameAt, hitsBuilding, lineBlocked, nearestRoadPoint, onRoad } from './city.js';
import { CHAPTERS, cancelJob, createMissions, currentChapter, currentStep, objectiveText, startJob, stepMarker, updateJob, updateMissions } from './missions.js';
import { angleDelta, clamp, pick, range } from './random.js';

export const EVENT_STEP = 1;
export const EVENT_MISSION = 2;
export const EVENT_TIMEOUT = 4;
export const EVENT_SPOTTED = 8;
export const EVENT_JOB_DONE = 16;
export const EVENT_JOB_FAIL = 32;
export const EVENT_BUSTED = 64;
export const EVENT_WANTED_UP = 128;
export const EVENT_CRIME = 256;
export const EVENT_SHOT = 512;
export const EVENT_HELI = 1024;

export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_SHOOT = 4;

let nextId = 1;

function makeCar(x, z, angle, kind) {
  return {
    id: nextId,
    kind,
    x, z, angle,
    speed: 0,
    topSpeed: kind === 'fast' ? CAR.fastTopSpeed : CAR.topSpeed,
    parked: false,
    playerDriven: false,
    turnIn: 0,
    cruise: TRAFFIC.cruise,
    hp: 40,
    disabled: 0,
    ramTimer: 0,
    siren: 0,
    lastSeen: 0,
    searching: false,
    targetX: x,
    targetZ: z,
  };
}

function makePed(x, z, random) {
  return {
    id: nextId,
    x, z,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 1.0, 1.8),
    wait: range(random, 0, 3),
    fleeing: 0,
    down: 0,
    color: pick(random, ['#c98a7a', '#8ac79a', '#c7b28a', '#9a8ac7', '#7ac7c2']),
  };
}

export function createSim(random, opts) {
  const city = createCity(random);
  const state = {
    city,
    random,
    player: {
      x: MARKERS.safehouse.x, z: MARKERS.safehouse.z, angle: -Math.PI / 2,
      health: PLAYER.health, maxHealth: PLAYER.health,
      inCar: null, punchTimer: 0, shootTimer: 0,
    },
    cars: [],
    peds: [],
    police: [],
    heli: { x: 0, z: 0, y: HELI.hoverHeight, angle: 0, rotor: 0, active: false },
    roadblocks: [],
    wanted: 0,
    wantedTimer: 0,
    policeTimer: 0,
    clock: CLOCK.start,
    elapsed: 0,
    missions: createMissions(),
    garage: { armor: false, speed: false, nos: false },
    nos: 0,
    weapon: 0,
    ammo: { smg: 0, shotgun: 0 },
    radio: 0,
    banner: null,
    bannerTimer: 0,
    flash: 0,
    tutorialTimer: 18,
    particles: [],
    shots: [],
    ramCooldown: 0,
    heatChapter: '',
    farePed: null,
    targetCar: null,
    demo: !!(opts && opts.demo),
    seed: (opts && opts.seed) || 0,
  };

  function spawnTraffic() {
    const cars = [];
    const peds = [];
    for (let n = 0; n < TRAFFIC.cars; n += 1) {
      const p = nearestRoadPoint(city, range(random, 60, CITY.width - 60), range(random, 60, CITY.height - 60));
      const car = makeCar(p.x, p.z, pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), pick(random, ['sedan', 'sedan', 'taxi', 'fast']));
      car.speed = car.cruise + range(random, -TRAFFIC.cruiseJitter, TRAFFIC.cruiseJitter);
      cars.push(car);
    }
    // Parked cars worth stealing, on the roads near the places that
    // matter — on asphalt, never inside a block.
    const spots = [
      { x: 160, z: 406, angle: -Math.PI / 2 },
      { x: 720, z: 566, angle: Math.PI / 2 },
      { x: 160, z: 86, angle: -Math.PI / 2 },
      { x: 800, z: 126, angle: Math.PI / 2 },
      { x: 80, z: 446, angle: -Math.PI / 2 },
      { x: 480, z: 566, angle: 0 },
      { x: 400, z: 126, angle: Math.PI },
      { x: 560, z: 566, angle: 0 },
    ];
    for (const spot of spots) {
      const car = makeCar(spot.x, spot.z, spot.angle, pick(random, ['sedan', 'fast', 'taxi']));
      car.parked = true;
      cars.push(car);
    }
    for (let n = 0; n < TRAFFIC.peds; n += 1) {
      peds.push(makePed(range(random, 40, CITY.width - 40), range(random, 40, CITY.height - 40), random));
    }
    state.cars = cars;
    state.peds = peds;
    state.police = [];
  }

  function reset() {
    state.player.x = MARKERS.safehouse.x;
    state.player.z = MARKERS.safehouse.z;
    state.player.angle = -Math.PI / 2;
    state.player.health = state.player.maxHealth;
    state.player.inCar = null;
    state.player.punchTimer = 0;
    state.player.shootTimer = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.policeTimer = 0;
    state.clock = CLOCK.start;
    state.elapsed = 0;
    state.banner = null;
    state.bannerTimer = 0;
    state.flash = 0;
    state.tutorialTimer = 18;
    state.particles = [];
    state.shots = [];
    state.roadblocks = [];
    state.heli.active = false;
    state.heatChapter = '';
    state.farePed = null;
    state.targetCar = null;
    state.missions = createMissions();
    spawnTraffic();
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
    state.banner = { text, sub: sub || '' };
    state.bannerTimer = seconds || 3;
  }

  function bustPlayer(events) {
    const fine = Math.min(state.missions.cash, POLICE.bustFine);
    state.missions.cash -= fine;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.police = [];
    state.roadblocks = [];
    state.heli.active = false;
    if (state.player.inCar) {
      state.player.inCar.speed = 0;
      state.player.inCar.playerDriven = false;
      state.player.inCar = null;
    }
    state.player.x = MARKERS.hospital.x;
    state.player.z = MARKERS.hospital.z;
    state.player.health = state.player.maxHealth;
    showBanner('BUSTED', `The police took $${fine}. You wake up at the hospital.`, 3.5);
    return events | EVENT_BUSTED;
  }

  function nearestCar(x, z, rangeM) {
    let best = null;
    let bestD = rangeM;
    for (const car of state.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterNearestCar(events) {
    const car = nearestCar(state.player.x, state.player.z, CAR.stealRange);
    if (!car) return events;
    if (!car.parked && Math.abs(car.speed) > 4) return events;
    const stolen = car.parked === true;
    car.parked = false;
    car.playerDriven = true;
    state.player.inCar = car;
    state.player.x = car.x;
    state.player.z = car.z;
    if (stolen && addWanted(WANTED.stealCar)) events |= EVENT_WANTED_UP | EVENT_CRIME;
    return events;
  }

  function exitCar() {
    const car = state.player.inCar;
    if (!car) return;
    car.speed = 0;
    car.playerDriven = false;
    const side = car.angle + Math.PI / 2;
    state.player.x = car.x + Math.cos(side) * 3;
    state.player.z = car.z + Math.sin(side) * 3;
    state.player.inCar = null;
  }

  function punch(events) {
    if (state.player.punchTimer > 0) return events;
    state.player.punchTimer = PLAYER.punchCooldown;
    let hit = null;
    let bestD = PLAYER.punchReach;
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.x - state.player.x, ped.z - state.player.z);
      if (d < bestD) { bestD = d; hit = ped; }
    }
    if (!hit) return events;
    hit.fleeing = 3;
    hit.down = 1.2;
    scarePeds(state.player.x, state.player.z, 30);
    if (addWanted(WANTED.punch || 1)) events |= EVENT_WANTED_UP | EVENT_CRIME;
    return events;
  }

  function scarePeds(x, z, rangeM) {
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - x, ped.z - z) < rangeM) ped.fleeing = 2.5;
    }
  }

  function shoot(events) {
    if (state.player.shootTimer > 0) return events;
    const weapon = WEAPONS[state.weapon];
    if (weapon.ammo >= 0 && state.ammo[weapon.id] <= 0) {
      state.weapon = 0;
      return events;
    }
    state.player.shootTimer = weapon.rate;
    if (weapon.ammo >= 0) state.ammo[weapon.id] -= 1;
    const originX = state.player.x;
    const originZ = state.player.z;
    const aim = state.player.angle;
    const spread = weapon.pellets ? 0.5 : 0.32;
    state.shots.push({ x: originX, z: originZ, angle: aim, life: 0.12, kind: weapon.id });
    let hitAnything = false;
    const pellets = weapon.pellets || 1;
    for (let p = 0; p < pellets; p += 1) {
      const aimP = aim + (pellets > 1 ? (p / (pellets - 1) - 0.5) * 0.5 : 0);
      // Police cars first, then pedestrians, inside the cone.
      let target = null;
      let bestD = weapon.range;
      for (const cop of state.police) {
        if (cop.disabled > 0) continue;
        const d = Math.hypot(cop.x - originX, cop.z - originZ);
        if (d > bestD) continue;
        const want = Math.atan2(cop.z - originZ, cop.x - originX);
        if (Math.abs(angleDelta(aimP, want)) < spread) { bestD = d; target = { kind: 'cop', ref: cop }; }
      }
      if (!target) {
        for (const ped of state.peds) {
          if (ped.down > 0) continue;
          const d = Math.hypot(ped.x - originX, ped.z - originZ);
          if (d > bestD) continue;
          const want = Math.atan2(ped.z - originZ, ped.x - originX);
          if (Math.abs(angleDelta(aimP, want)) < spread) { bestD = d; target = { kind: 'ped', ref: ped }; }
        }
      }
      if (target) {
        hitAnything = true;
        if (target.kind === 'cop') {
          target.ref.hp -= weapon.damage;
          if (target.ref.hp <= 0 && target.ref.disabled <= 0) {
            target.ref.disabled = 999;
            target.ref.speed = 0;
            state.missions.cash += 50;
          }
        } else {
          target.ref.down = 2.5;
          target.ref.fleeing = 3;
          scarePeds(target.ref.x, target.ref.z, 25);
        }
      }
    }
    if (hitAnything && addWanted(WANTED.shoot)) events |= EVENT_WANTED_UP | EVENT_CRIME;
    return events | EVENT_SHOT;
  }

  function stepOnFoot(move, running, dt) {
    const speed = running ? PLAYER.run : PLAYER.walk;
    const nx = state.player.x + move.x * speed * dt;
    const nz = state.player.z + move.z * speed * dt;
    const r = PLAYER.radius;
    if (!hitsBuilding(state.city, nx - r, state.player.z - r, r * 2, r * 2)) state.player.x = nx;
    if (!hitsBuilding(state.city, state.player.x - r, nz - r, r * 2, r * 2)) state.player.z = nz;
    const held = clampToCity(state.player.x, state.player.z, r + 1);
    state.player.x = held.x;
    state.player.z = held.z;
    if (move.x !== 0 || move.z !== 0) state.player.angle = Math.atan2(move.z, move.x);
  }

  function carTopSpeed(car) {
    let top = car.topSpeed;
    if (car.playerDriven && state.garage.speed) top += GARAGE.speedBonus;
    return top;
  }

  function stepDriving(move, dt, nosHeld) {
    const car = state.player.inCar;
    const forward = -move.z;
    const onRoadNow = onRoad(state.city, car.x, car.z);
    const grip = onRoadNow ? 1 : CAR.offroadFactor;
    const boosting = nosHeld && state.garage.nos && state.nos > 0 && forward > 0;
    if (boosting) state.nos = Math.max(0, state.nos - NOS.drain * dt);
    const top = carTopSpeed(car) * (boosting ? NOS.boost : 1) * grip;
    if (forward > 0) car.speed += CAR.accel * (boosting ? 1.4 : 1) * dt;
    else if (forward < 0) car.speed -= CAR.brake * dt;
    else car.speed -= car.speed * 0.9 * dt;
    if (car.speed > 0) car.speed = Math.min(car.speed, top);
    else car.speed = Math.max(car.speed, -CAR.reverseTop);
    const authority = clamp(Math.abs(car.speed) / 14, 0.3, 1);
    const turn = move.x * CAR.steer * authority * dt * (car.speed < 0 ? -1 : 1);
    car.angle += turn;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const nz = car.z + Math.sin(car.angle) * car.speed * dt;
    const impact = Math.abs(car.speed);
    if (hitsBuilding(state.city, nx - 1.6, nz - 1.6, 3.2, 3.2)) {
      car.speed *= -0.25;
      if (impact > 24) {
        state.player.health -= 4;
        state.particles.push({ x: car.x, z: car.z, life: 0.4, kind: 'spark' });
      }
    } else {
      car.x = nx;
      car.z = nz;
    }
    const held = clampToCity(car.x, car.z, 3);
    car.x = held.x;
    car.z = held.z;
    state.player.x = car.x;
    state.player.z = car.z;
    state.player.angle = car.angle;
    if (Math.abs(turn) > 0.02 && Math.abs(car.speed) > 18) {
      state.particles.push({ x: car.x, z: car.z, life: 0.4, kind: 'skid' });
    }
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.playerDriven || car.parked) continue;
      car.turnIn -= dt;
      const aheadX = car.x + Math.cos(car.angle) * car.speed * dt;
      const aheadZ = car.z + Math.sin(car.angle) * car.speed * dt;
      const nearCrossing = Math.min(
        ...state.city.roads.vertical.map((rx) => Math.abs(aheadX - rx)),
        ...state.city.roads.horizontal.map((rz) => Math.abs(aheadZ - rz)),
      ) < 3;
      if (nearCrossing && car.turnIn <= 0 && state.random() < 0.35) {
        car.angle += pick(state.random, [-Math.PI / 2, Math.PI / 2]);
        car.turnIn = 2 + state.random() * 3;
      }
      if (hitsBuilding(state.city, aheadX - 1.4, aheadZ - 1.4, 2.8, 2.8)) {
        car.angle += Math.PI / 2;
      } else {
        car.x = aheadX;
        car.z = aheadZ;
      }
      const held = clampToCity(car.x, car.z, 4);
      car.x = held.x;
      car.z = held.z;
    }
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      if (ped.fleeing > 0) {
        ped.fleeing -= dt;
        const away = Math.atan2(ped.z - state.player.z, ped.x - state.player.x);
        ped.angle = away;
        ped.x += Math.cos(away) * 3.2 * dt;
        ped.z += Math.sin(away) * 3.2 * dt;
      } else {
        ped.wait -= dt;
        if (ped.wait <= 0) {
          ped.angle = range(state.random, 0, Math.PI * 2);
          ped.wait = 1 + state.random() * 3;
        }
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.z += Math.sin(ped.angle) * ped.speed * dt;
      }
      const held = clampToCity(ped.x, ped.z, 2);
      ped.x = held.x;
      ped.z = held.z;
      if (hitsBuilding(state.city, ped.x - 0.4, ped.z - 0.4, 0.8, 0.8)) ped.angle += Math.PI;
    }
  }

  function stepCarCollisions(events) {
    const mine = state.player.inCar;
    if (!mine) return { events, rammed: false };
    for (const other of state.cars) {
      if (other === mine || other.playerDriven) continue;
      const d = Math.hypot(other.x - mine.x, other.z - mine.z);
      if (d < 4.2 && d > 0.01) {
        const push = (4.2 - d) / 2;
        const nx = (other.x - mine.x) / d;
        const nz = (other.z - mine.z) / d;
        other.x += nx * push;
        other.z += nz * push;
        if (Math.abs(mine.speed) > 16) {
          other.speed = mine.speed * 0.5;
          other.parked = false;
        }
        mine.speed *= 0.6;
      }
    }
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.x - mine.x, ped.z - mine.z);
      if (d < 2.6) {
        if (Math.abs(mine.speed) > 4) {
          ped.down = 2.5;
          ped.fleeing = 3;
          scarePeds(ped.x, ped.z, 25);
          if (addWanted(WANTED.hitPed)) events |= EVENT_WANTED_UP | EVENT_CRIME;
        } else {
          ped.fleeing = 1.5;
        }
      }
    }
    if (state.targetCar) {
      const target = state.targetCar;
      const d = Math.hypot(target.x - mine.x, target.z - mine.z);
      if (d < 4.5 && Math.abs(mine.speed) > 10 && state.ramCooldown <= 0) {
        state.ramCooldown = 1;
        target.speed = 20;
        target.angle += 0.6;
        return { events: events | EVENT_CRIME, rammed: true };
      }
    }
    return { events, rammed: false };
  }

  function spawnPoliceCar() {
    const edge = pick(state.random, ['n', 's', 'e', 'w']);
    let x = state.player.x;
    let z = state.player.z;
    if (edge === 'n') z = Math.max(20, state.player.z - 120);
    else if (edge === 's') z = Math.min(CITY.height - 20, state.player.z + 120);
    else if (edge === 'e') x = Math.min(CITY.width - 20, state.player.x + 120);
    else x = Math.max(20, state.player.x - 120);
    const p = nearestRoadPoint(state.city, x, z);
    const car = makeCar(p.x, p.z, Math.atan2(state.player.z - p.z, state.player.x - p.x), 'cop');
    car.topSpeed = POLICE.chaseSpeed;
    return car;
  }

  function copSees(cop) {
    const d = Math.hypot(cop.x - state.player.x, cop.z - state.player.z);
    if (d > POLICE.sightRange) return false;
    return !lineBlocked(state.city, cop.x, cop.z, state.player.x, state.player.z);
  }

  function stepPolice(dt, events) {
    let anySees = false;
    for (const cop of state.police) {
      if (cop.disabled > 0) continue;
      const sees = copSees(cop);
      if (sees) {
        anySees = true;
        cop.lastSeen = 0;
        cop.searching = false;
        cop.targetX = state.player.x;
        cop.targetZ = state.player.z;
      } else {
        cop.lastSeen += dt;
        if (cop.lastSeen > POLICE.loseSightSeconds) cop.searching = true;
      }
    }
    if (state.wanted > 0 && !anySees) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
    const wantCars = Math.min(POLICE.maxCars, Math.max(0, state.wanted - 1));
    if (state.wanted >= 2 && state.police.length < wantCars) {
      state.policeTimer -= dt;
      if (state.policeTimer <= 0) {
        state.policeTimer = POLICE.spawnEvery;
        state.police.push(spawnPoliceCar());
      }
    }
    for (const cop of state.police) {
      if (cop.disabled > 0) continue;
      if (cop.ramTimer > 0) cop.ramTimer -= dt;
      const wantAngle = Math.atan2(cop.targetZ - cop.z, cop.targetX - cop.x);
      const diff = angleDelta(cop.angle, wantAngle);
      cop.angle += clamp(diff, -3.2 * dt, 3.2 * dt);
      const top = cop.searching ? POLICE.chaseSpeed * 0.6 : POLICE.chaseSpeed;
      cop.speed = Math.min(top, cop.speed + 26 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.z += Math.sin(cop.angle) * cop.speed * dt;
      cop.siren += dt;
      const held = clampToCity(cop.x, cop.z, 4);
      cop.x = held.x;
      cop.z = held.z;
      const touch = Math.hypot(state.player.x - cop.x, state.player.z - cop.z);
      if (touch < 4.6 && cop.ramTimer <= 0) {
        cop.ramTimer = 1.0;
        const dx = cop.x - state.player.x;
        const dz = cop.z - state.player.z;
        const d = Math.hypot(dx, dz) || 1;
        cop.x += (dx / d) * 4;
        cop.z += (dz / d) * 4;
        if (state.player.inCar) {
          state.player.health -= POLICE.ramDamage;
          cop.speed *= 0.4;
          if (state.player.health <= 0) return bustPlayer(events);
        } else {
          return bustPlayer(events);
        }
      }
    }
    if (state.wanted === 0 && state.police.length > 0) {
      state.police = [];
      state.roadblocks = [];
      state.heli.active = false;
    }
    return events;
  }

  function stepHeli(dt, events) {
    const heli = state.heli;
    const shouldBeActive = state.wanted >= 4;
    if (shouldBeActive && !heli.active) {
      heli.active = true;
      heli.x = state.player.x - 30;
      heli.z = state.player.z - 30;
      events |= EVENT_HELI;
    }
    if (!shouldBeActive) {
      heli.active = false;
      return events;
    }
    heli.rotor += HELI.rotorSpeed * dt;
    const tx = state.player.x + 12;
    const tz = state.player.z - 12;
    heli.x += (tx - heli.x) * Math.min(1, HELI.followLag * dt);
    heli.z += (tz - heli.z) * Math.min(1, HELI.followLag * dt);
    heli.angle = Math.atan2(state.player.z - heli.z, state.player.x - heli.x);
    return events;
  }

  function stepRoadblocks(dt) {
    if (state.wanted < 4) {
      state.roadblocks = [];
      return;
    }
    if (state.roadblocks.length > 0) return;
    // Three barriers across the roads ahead of the player's heading.
    const heading = state.player.angle;
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    for (let i = 0; i < ROADBLOCK.count; i += 1) {
      const ahead = 55 + i * 38;
      const cx = state.player.x + fx * ahead + (i === 1 ? -fz * 30 : i === 2 ? fz * 30 : 0);
      const cz = state.player.z + fz * ahead + (i === 1 ? fx * 30 : i === 2 ? -fx * 30 : 0);
      const p = nearestRoadPoint(state.city, cx, cz);
      state.roadblocks.push({ x: p.x, z: p.z, angle: heading + Math.PI / 2, hit: false });
    }
  }

  function stepRoadblockHits() {
    const mine = state.player.inCar;
    if (!mine) return;
    for (const block of state.roadblocks) {
      if (block.hit) continue;
      const d = Math.hypot(block.x - mine.x, block.z - mine.z);
      if (d < 3.4 && Math.abs(mine.speed) > 3) {
        block.hit = true;
        mine.speed *= ROADBLOCK.slowFactor;
        state.player.health -= ROADBLOCK.damage;
        state.particles.push({ x: block.x, z: block.z, life: 0.6, kind: 'spark' });
      }
    }
  }

  function step(dt, input) {
    let events = 0;
    state.elapsed += dt;
    state.clock = (state.clock + dt / CLOCK.dayLength) % 1;
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) state.banner = null;
    }
    if (state.flash > 0) state.flash -= dt;
    if (state.tutorialTimer > 0) state.tutorialTimer -= dt;
    if (state.ramCooldown > 0) state.ramCooldown -= dt;
    if (state.player.punchTimer > 0) state.player.punchTimer -= dt;
    if (state.player.shootTimer > 0) state.player.shootTimer -= dt;
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      state.particles[i].life -= dt;
      if (state.particles[i].life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.shots.length - 1; i >= 0; i -= 1) {
      state.shots[i].life -= dt;
      if (state.shots[i].life <= 0) state.shots.splice(i, 1);
    }

    const actions = input ? input.actions : 0;
    if (!state.demo && actions !== undefined) {
      if (actions & ACTION_ENTER) {
        if (state.player.inCar) exitCar();
        else events = enterNearestCar(events);
      }
      if (actions & ACTION_PUNCH) events = punch(events);
      if (actions & ACTION_SHOOT) events = shoot(events);
    }

    const move = input ? input.move : { x: 0, z: 0 };
    if (state.player.inCar) stepDriving(move, dt, !!(input && input.nos));
    else if (input) stepOnFoot(move, !!input.running, dt);

    stepTraffic(dt);
    const collision = stepCarCollisions(events);
    events = collision.events;
    events = stepPolice(dt, events);
    events = stepHeli(dt, events);
    stepRoadblocks(dt);
    stepRoadblockHits();

    const chapter = currentChapter(state.missions);
    if (chapter && chapter.heatOnStart && state.heatChapter !== chapter.id) {
      state.heatChapter = chapter.id;
      state.wanted = Math.max(state.wanted, chapter.heatOnStart);
      state.flash = 0.6;
      if (chapter.night) state.clock = 0.92;
      events |= EVENT_WANTED_UP;
    }

    const snap = { x: state.player.x, z: state.player.z, inCar: !!state.player.inCar, wanted: state.wanted };
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
          showBanner('TOO SLOW', 'The window closed — back to the pickup.', 3);
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

    if (state.player.health <= 0) return bustPlayer(events);
    if (state.wanted === 0 && state.player.health < state.player.maxHealth) {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 2 * dt);
    }
    return events;
  }

  function beginJob(kind) {
    cancelJob(state.missions);
    if (kind === 'taxi') {
      const fare = {
        x: state.player.x + 12, z: state.player.z, angle: 0, speed: 1.2,
        wait: 9999, fleeing: 0, down: 0, color: '#f2c94c', fare: true,
      };
      state.peds.push(fare);
      state.farePed = fare;
      return startJob(state.missions, 'taxi', { x: fare.x, z: fare.z });
    }
    if (kind === 'vigilante') {
      const target = spawnPoliceCar();
      target.kind = 'target';
      target.topSpeed = 30;
      state.cars.push(target);
      state.targetCar = target;
      const job = startJob(state.missions, 'vigilante', null);
      state.missions.jobTarget = target;
      return job;
    }
    return startJob(state.missions, kind, null);
  }

  function buyGarage(item) {
    const cash = state.missions.cash;
    if (item === 'armor' && !state.garage.armor && cash >= GARAGE.armorCost) {
      state.missions.cash -= GARAGE.armorCost;
      state.garage.armor = true;
      state.player.maxHealth += GARAGE.armorHealth;
      state.player.health = state.player.maxHealth;
      return true;
    }
    if (item === 'speed' && !state.garage.speed && cash >= GARAGE.speedCost) {
      state.missions.cash -= GARAGE.speedCost;
      state.garage.speed = true;
      return true;
    }
    if (item === 'nos' && cash >= GARAGE.nosCost) {
      state.missions.cash -= GARAGE.nosCost;
      state.garage.nos = true;
      state.nos = NOS.capacity;
      return true;
    }
    return false;
  }

  function buyWeapon(id) {
    const def = WEAPONS.find((w) => w.id === id);
    if (!def || def.cost === 0) return false;
    if (state.ammo[id] > 0) return false;
    if (state.missions.cash < def.cost) return false;
    state.missions.cash -= def.cost;
    state.ammo[id] = def.ammo;
    return true;
  }

  function cycleWeapon() {
    for (let i = 1; i <= WEAPONS.length; i += 1) {
      const next = (state.weapon + i) % WEAPONS.length;
      const def = WEAPONS[next];
      if (def.ammo < 0 || state.ammo[def.id] > 0) {
        state.weapon = next;
        return def;
      }
    }
    state.weapon = 0;
    return WEAPONS[0];
  }

  function snapshot() {
    return { x: state.player.x, z: state.player.z, inCar: !!state.player.inCar, wanted: state.wanted };
  }

  function saveData() {
    return {
      cash: state.missions.cash,
      chapter: state.missions.chapter,
      completed: state.missions.completed.slice(),
      garage: { ...state.garage },
      ammo: { ...state.ammo },
      bestCash: state.missions.cash,
    };
  }

  function applySave(save) {
    if (!save) return;
    state.missions.cash = save.cash || 0;
    state.missions.chapter = Math.min(save.chapter || 0, CHAPTERS.length);
    state.missions.completed = (save.completed || []).slice();
    if (save.garage) {
      state.garage = { ...state.garage, ...save.garage };
      if (state.garage.armor) state.player.maxHealth = PLAYER.health + GARAGE.armorHealth;
      if (state.garage.nos) state.nos = NOS.capacity;
    }
    if (save.ammo) state.ammo = { ...state.ammo, ...save.ammo };
  }

  reset();
  return {
    state, reset, step, snapshot, buyGarage, buyWeapon, cycleWeapon, beginJob,
    saveData, applySave,
    district: () => districtNameAt(state.player.x, state.player.z),
    marker: () => stepMarker(state.missions),
    objective: () => objectiveText(state.missions),
    chapter: () => currentChapter(state.missions),
    currentStepInfo: () => currentStep(state.missions),
  };
}
