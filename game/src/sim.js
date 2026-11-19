// The game's rules and state, with no drawing and no browser in it: driving, collisions,
// traffic, pedestrians, police chases with line of sight, the helicopter, roadblocks,
// wanted heat, weapons, the garage and the clock. step() advances one fixed step; the
// caller (missions, autopilot, tests) reads state directly. Deterministic for one seed.
import {
  CAR, CLOCK, GARAGE, HELI, NOS, PLACES, PLAYER, POLICE, ROADBLOCK, SPAWN,
  TRAFFIC_COUNT, PED_COUNT, WANTED, WEAPONS, WORLD,
} from './config.js';
import { createCity } from './city.js';
import { randInt, randPick, randRange } from './random.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function dist2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function createSim(random) {
  const city = createCity(random);
  const carColors = ['#c23b3b', '#3b6bc2', '#3bc26b', '#c2a13b', '#8a3bc2', '#c2c2c2'];

  const state = {
    player: { x: SPAWN.x, z: SPAWN.z, angle: SPAWN.angle, speed: 0, onFoot: true, health: PLAYER.health, maxHealth: PLAYER.health },
    car: null,
    traffic: [],
    peds: [],
    police: [],
    heli: { active: false, x: 0, z: 0, angle: 0 },
    wanted: 0,
    losTimer: 0,
    fadeTimer: 0,
    lastSeenTimer: 0,
    cash: 0,
    clockMinutes: CLOCK.startHour * 60 + CLOCK.startMinute,
    roadblocks: [],
    roadblockTimer: 0,
    weapons: { current: 'fists', owned: { pistol: false, smg: false, shotgun: false }, ammo: { pistol: 0, smg: 0, shotgun: 0 } },
    garage: { armor: false, engine: false, nos: false, nosAmount: 0 },
    radio: 0,
    elapsed: 0,
    busted: false,
    dead: false,
    fireCooldown: 0,
    punchCooldown: 0,
  };

  function maxCarSpeed() {
    let top = CAR.maxSpeed + (state.garage.engine ? GARAGE.engine.speed : 0);
    return top;
  }

  function reset() {
    state.player.x = SPAWN.x;
    state.player.z = SPAWN.z;
    state.player.angle = SPAWN.angle;
    state.player.speed = 0;
    state.player.onFoot = true;
    state.player.health = PLAYER.health;
    state.player.maxHealth = PLAYER.health;
    state.car = null;
    state.traffic = [];
    state.peds = [];
    state.police = [];
    state.heli.active = false;
    state.wanted = 0;
    state.losTimer = 0;
    state.fadeTimer = 0;
    state.lastSeenTimer = 0;
    state.cash = 0;
    state.clockMinutes = CLOCK.startHour * 60 + CLOCK.startMinute;
    state.roadblocks = [];
    state.roadblockTimer = 0;
    state.weapons = { current: 'fists', owned: { pistol: false, smg: false, shotgun: false }, ammo: { pistol: 0, smg: 0, shotgun: 0 } };
    state.garage = { armor: false, engine: false, nos: false, nosAmount: 0 };
    state.radio = 0;
    state.elapsed = 0;
    state.busted = false;
    state.dead = false;
    state.fireCooldown = 0;
    state.punchCooldown = 0;
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const node = city.nearestNode(randRange(random, -400, 400), randRange(random, -280, 280));
      state.traffic.push({
        x: node.x, z: node.z, angle: randRange(random, 0, TAU),
        speed: randRange(random, 9, 13), color: randPick(random, carColors),
        route: [], routeIndex: 0, hp: 40, wrecked: false,
      });
    }
    for (let i = 0; i < PED_COUNT; i += 1) {
      state.peds.push({
        x: randRange(random, -440, 440), z: randRange(random, -300, 300),
        angle: randRange(random, 0, TAU), speed: randRange(random, 1, 2),
        tx: 0, tz: 0, hp: 30, down: -1,
      });
      const ped = state.peds[state.peds.length - 1];
      ped.tx = ped.x + randRange(random, -40, 40);
      ped.tz = ped.z + randRange(random, -40, 40);
    }
  }

  function setClock(hour, minute) {
    state.clockMinutes = hour * 60 + minute;
  }

  /** 1 in full daylight, ~0.1 at night; dusk sits between. */
  function daylight() {
    const h = (state.clockMinutes / 60) % 24;
    if (h >= 7 && h < 17) return 1;
    if (h >= 17 && h < 19.5) return 1 - ((h - 17) / 2.5) * 0.85;
    if (h >= 19.5 || h < 6) return 0.12;
    return 0.12 + ((h - 6) / 1) * 0.88;
  }

  function hourMinute() {
    const total = Math.floor(state.clockMinutes) % (24 * 60);
    return { hour: Math.floor(total / 60), minute: total % 60 };
  }

  function addHeat(amount) {
    state.wanted = clamp(state.wanted + amount, 0, WANTED.max);
    state.losTimer = 0;
    state.fadeTimer = 0;
    state.lastSeenTimer = 0;
  }

  /** Set the wanted level outright (a chapter opening fixes its heat). */
  function setWanted(level) {
    state.wanted = clamp(level, 0, WANTED.max);
    state.losTimer = 0;
    state.fadeTimer = 0;
    state.lastSeenTimer = 0;
  }

  function moveBody(body, dx, dz, radius) {
    const nx = body.x + dx;
    const nz = body.z + dz;
    const hit = city.insideBuilding(nx, nz, radius);
    if (hit === null) {
      body.x = clamp(nx, -WORLD.width / 2 + 4, WORLD.width / 2 - 4);
      body.z = clamp(nz, -WORLD.depth / 2 + 4, WORLD.depth / 2 - 4);
      return true;
    }
    // Slide along one axis when the diagonal is blocked.
    if (city.insideBuilding(nx, body.z, radius) === null) {
      body.x = clamp(nx, -WORLD.width / 2 + 4, WORLD.width / 2 - 4);
      return true;
    }
    if (city.insideBuilding(body.x, nz, radius) === null) {
      body.z = clamp(nz, -WORLD.depth / 2 + 4, WORLD.depth / 2 - 4);
      return true;
    }
    return false;
  }

  function nearestParked(maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const car of city.parked) {
      const d = dist2(state.player.x, state.player.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar() {
    if (!state.player.onFoot) return false;
    const parked = nearestParked(3.5);
    if (parked === null) return false;
    state.player.onFoot = false;
    state.car = {
      x: parked.x, z: parked.z, angle: parked.angle, speed: 0,
      color: parked.color, hp: 250, nos: state.garage.nos ? 1 : 0,
    };
    city.parked.splice(city.parked.indexOf(parked), 1);
    addHeat(WANTED.stealHeat);
    return true;
  }

  function exitCar() {
    if (state.player.onFoot || state.car === null) return false;
    const side = state.car.angle + Math.PI / 2;
    state.player.x = state.car.x + Math.sin(side) * 3;
    state.player.z = state.car.z + Math.cos(side) * 3;
    state.player.angle = state.car.angle;
    state.player.onFoot = true;
    city.parked.push({ x: state.car.x, z: state.car.z, angle: state.car.angle, color: state.car.color });
    state.car = null;
    return true;
  }

  function drive(dt, input) {
    const car = state.car;
    if (car === null) return;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const boosting = input.nos && state.garage.nos && car.nos > 0 && car.speed > 4;
    let top = maxCarSpeed();
    if (boosting) {
      top += NOS.boost;
      car.nos = Math.max(0, car.nos - NOS.drain * dt);
      // NOS is thrust, not just a higher cap: without the push the car never
      // reaches the raised cap before the bottle runs dry.
      car.speed += NOS.boost * 1.4 * dt;
    }
    if (input.fwd) car.speed += CAR.accel * dt;
    if (input.back) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    car.speed -= car.speed * 0.35 * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, top);
    if (!input.fwd && !input.back && Math.abs(car.speed) < 0.4) car.speed = 0;
    const steerAmount = steer * CAR.steer * clamp(Math.abs(car.speed) / CAR.steerSpeed, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount * dt;
    const moved = moveBody(car, Math.sin(car.angle) * car.speed * dt, Math.cos(car.angle) * car.speed * dt, CAR.radius);
    if (!moved) car.speed *= 0.5;
    state.player.x = car.x;
    state.player.z = car.z;
    state.player.angle = car.angle;
    state.player.speed = car.speed;
  }

  function walk(dt, input) {
    const p = state.player;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const fwd = input.fwd ? 1 : 0;
    const back = input.back ? 1 : 0;
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.angle += steer * 2.6 * dt;
    const move = (fwd - back) * speed;
    p.speed = move;
    moveBody(p, Math.sin(p.angle) * move * dt, Math.cos(p.angle) * move * dt, PLAYER.radius);
  }

  function punch(dt, input) {
    if (state.fireCooldown > 0 || state.punchCooldown > 0) return;
    if (!input.punch) return;
    state.punchCooldown = WEAPONS.fists.rate;
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down >= 0) continue;
      if (dist2(p.x, p.z, ped.x, ped.z) < WEAPONS.fists.range ** 2) {
        ped.hp -= WEAPONS.fists.damage;
        if (ped.hp <= 0) {
          ped.down = 5;
          addHeat(WANTED.hitHeat);
        }
      }
    }
  }

  function shoot(dt, input) {
    if (state.fireCooldown > 0) return;
    if (!input.shoot) return;
    const weapon = WEAPONS[state.weapons.current];
    if (state.weapons.current !== 'fists') {
      if (state.weapons.ammo[state.weapons.current] <= 0) return;
      state.weapons.ammo[state.weapons.current] -= 1;
    }
    state.fireCooldown = weapon.rate;
    const p = state.player;
    const range = weapon.range;
    let best = null;
    let bestD = range * range;
    const consider = (x, z, target) => {
      const d = dist2(p.x, p.z, x, z);
      if (d >= bestD) return;
      const aim = angleTo(p.x, p.z, x, z);
      if (Math.abs(angleDiff(p.angle, aim)) > 0.35) return;
      bestD = d;
      best = target;
    };
    for (const cop of state.police) consider(cop.x, cop.z, { kind: 'police', ref: cop });
    for (const car of state.traffic) {
      if (!car.wrecked) consider(car.x, car.z, { kind: 'traffic', ref: car });
    }
    for (const ped of state.peds) {
      if (ped.down < 0) consider(ped.x, ped.z, { kind: 'ped', ref: ped });
    }
    if (best === null) return;
    const pellets = weapon.pellets ?? 1;
    const damage = weapon.damage * pellets;
    if (best.kind === 'police') {
      best.ref.hp -= damage;
      if (best.ref.hp <= 0) {
        state.police.splice(state.police.indexOf(best.ref), 1);
        addHeat(WANTED.shootHeat);
      }
    } else if (best.kind === 'traffic') {
      best.ref.hp -= damage;
      if (best.ref.hp <= 0) best.ref.wrecked = true;
      addHeat(WANTED.shootHeat);
    } else {
      best.ref.hp -= damage;
      if (best.ref.hp <= 0) {
        best.ref.down = 5;
        addHeat(WANTED.shootHeat);
      }
    }
  }

  function updateTraffic(dt) {
    for (const car of state.traffic) {
      if (car.wrecked) continue;
      if (car.route.length === 0 || car.routeIndex >= car.route.length) {
        const dest = city.nearestNode(randRange(random, -400, 400), randRange(random, -280, 280));
        car.route = city.route(car.x, car.z, dest.x, dest.z);
        car.routeIndex = 0;
      }
      const target = car.route[car.routeIndex];
      if (target === undefined) continue;
      const d = Math.hypot(target.x - car.x, target.z - car.z);
      if (d < 4) {
        car.routeIndex += 1;
        continue;
      }
      const want = angleTo(car.x, car.z, target.x, target.z);
      car.angle += clamp(angleDiff(car.angle, want), -2.2 * dt, 2.2 * dt);
      const nx = car.x + Math.sin(car.angle) * car.speed * dt;
      const nz = car.z + Math.cos(car.angle) * car.speed * dt;
      if (city.insideBuilding(nx, nz, 2) === null) {
        car.x = nx;
        car.z = nz;
      } else {
        car.angle += Math.PI / 2;
      }
      // Bumping the player's car slows both down.
      if (state.car !== null && dist2(car.x, car.z, state.car.x, state.car.z) < 16) {
        state.car.speed *= 0.9;
        car.speed = Math.max(4, car.speed * 0.9);
      }
    }
  }

  function updatePeds(dt) {
    for (const ped of state.peds) {
      if (ped.down >= 0) {
        ped.down -= dt;
        if (ped.down < 0) {
          ped.hp = 30;
          ped.x = randRange(random, -440, 440);
          ped.z = randRange(random, -300, 300);
        }
        continue;
      }
      const d = Math.hypot(ped.tx - ped.x, ped.tz - ped.z);
      if (d < 2) {
        ped.tx = clamp(ped.x + randRange(random, -60, 60), -440, 440);
        ped.tz = clamp(ped.z + randRange(random, -60, 60), -300, 300);
        continue;
      }
      ped.angle = angleTo(ped.x, ped.z, ped.tx, ped.tz);
      // A fast car bearing down makes a ped dodge aside at once — a step to the
      // side, not a slow wander, so the car passes instead of running them over.
      if (state.car !== null && Math.abs(state.car.speed) > 8 && dist2(ped.x, ped.z, state.car.x, state.car.z) < 196) {
        const side = Math.sign((ped.x - state.car.x) * Math.cos(state.car.angle) - (ped.z - state.car.z) * Math.sin(state.car.angle)) || 1;
        ped.x = clamp(ped.x + Math.cos(state.car.angle) * 2.5 * side, -440, 440);
        ped.z = clamp(ped.z - Math.sin(state.car.angle) * 2.5 * side, -300, 300);
        ped.tx = ped.x;
        ped.tz = ped.z;
      }
      ped.x += Math.sin(ped.angle) * ped.speed * dt;
      ped.z += Math.cos(ped.angle) * ped.speed * dt;
      // Run over by a car: only a ped directly in the car's path counts — a
      // ped the car passes beside is a near miss, not a crime.
      if (state.car !== null && Math.abs(state.car.speed) > 3) {
        const fx = Math.sin(state.car.angle);
        const fz = Math.cos(state.car.angle);
        const rx = ped.x - state.car.x;
        const rz = ped.z - state.car.z;
        const forward = rx * fx + rz * fz;
        const lateral = Math.abs(rx * fz - rz * fx);
        if (forward > -1 && forward < 4 && lateral < 1.5) {
          ped.hp = 0;
          ped.down = 5;
          addHeat(WANTED.hitHeat);
        }
      }
    }
  }

  function spawnPolice() {
    // No fresh units when the trail is cold: if nobody has seen the player for
    // a while, the department stops sending cars and the heat can cool.
    if (state.lastSeenTimer > 8) return;
    const want = Math.min(state.wanted, 4);
    while (state.police.length < want) {
      const angle = randRange(random, 0, TAU);
      const d = POLICE.spawnDistance;
      const x = clamp(state.player.x + Math.sin(angle) * d, -460, 460);
      const z = clamp(state.player.z + Math.cos(angle) * d, -300, 300);
      const spot = city.nearestRoadPoint(x, z);
      state.police.push({
        x: spot.x, z: spot.z, angle: randRange(random, 0, TAU),
        speed: 0, hp: 60, ramTimer: 0, bustTimer: 0, seenTimer: 0,
        lastSeenX: state.player.x, lastSeenZ: state.player.z,
      });
    }
    while (state.police.length > want) state.police.pop();
  }

  function updatePolice(dt) {
    spawnPolice();
    const p = state.player;
    let anyoneSees = false;
    for (const cop of state.police) {
      const d = Math.hypot(p.x - cop.x, p.z - cop.z);
      const blocked = city.segmentBlocked(cop.x, cop.z, p.x, p.z);
      if (!blocked && d < 90) {
        anyoneSees = true;
        cop.seenTimer = 0;
        cop.lastSeenX = p.x;
        cop.lastSeenZ = p.z;
      } else {
        cop.seenTimer += dt;
      }
      // A cop that lost sight drives to where it last saw the player and searches
      // there — it does not home in on the player's real position through walls.
      const tx = cop.seenTimer > 3 ? cop.lastSeenX : p.x;
      const tz = cop.seenTimer > 3 ? cop.lastSeenZ : p.z;
      const want = angleTo(cop.x, cop.z, tx, tz);
      cop.angle += clamp(angleDiff(cop.angle, want), -2.6 * dt, 2.6 * dt);
      cop.speed = Math.min(POLICE.maxSpeed, cop.speed + POLICE.accel * dt);
      // Pull up alongside instead of zipping past: slow down when close, so the
      // cop can actually catch a player who stops — that is what a bust is.
      if (d < 14) cop.speed = Math.min(cop.speed, Math.max(0, d * 1.2));
      const nx = cop.x + Math.sin(cop.angle) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.angle) * cop.speed * dt;
      if (city.insideBuilding(nx, nz, 2.2) === null) {
        cop.x = nx;
        cop.z = nz;
      } else {
        cop.speed *= 0.5;
      }
      if (cop.ramTimer > 0) cop.ramTimer -= dt;
      // Ram the player's car: damage the car, slow it, then a cooldown. The car
      // is the shield — the driver takes no damage from a ram, so a wait step
      // under fire costs the car, not the run.
      if (state.car !== null && d < 5 && cop.ramTimer <= 0) {
        cop.ramTimer = POLICE.ramCooldown;
        state.car.speed *= POLICE.ramSlow;
        state.car.hp -= POLICE.ramDamage;
        if (state.car.hp <= 0) {
          state.car = null;
          state.player.onFoot = true;
        }
      }
      // Bust: a cop catches a player ON FOOT who stands still next to them. A
      // player in a car gets rammed, never busted — a wait step in the car must
      // not be a death trap.
      if (p.onFoot && d < POLICE.bustRange && Math.abs(p.speed) < 1.5) {
        cop.bustTimer += dt;
        if (cop.bustTimer >= POLICE.bustTime) {
          state.busted = true;
          state.cash = Math.max(0, state.cash - 50);
          state.wanted = 0;
          state.police = [];
          state.roadblocks = [];
          state.heli.active = false;
        }
      } else {
        cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
      }
    }
    if (anyoneSees) {
      state.losTimer = 0;
      state.fadeTimer = 0;
      state.lastSeenTimer = 0;
    } else {
      state.losTimer += dt;
      state.lastSeenTimer += dt;
      if (state.losTimer >= WANTED.loseSightSeconds) {
        state.fadeTimer += dt;
        if (state.fadeTimer >= WANTED.fadeSeconds) {
          state.fadeTimer = 0;
          state.wanted = Math.max(0, state.wanted - 1);
          if (state.wanted === 0) state.losTimer = 0;
        }
      }
    }
    // A cop that has not seen the player for a long time gives up and drives
    // off; the heat can only cool once the street is empty.
    if (state.police.some((cop) => cop.seenTimer > 15)) {
      state.police = state.police.filter((cop) => cop.seenTimer <= 15);
    }
  }

  function updateHeli(dt) {
    const want = state.wanted >= 4;
    state.heli.active = want;
    if (!want) return;
    const p = state.player;
    const tx = p.x + Math.sin(p.angle) * 10;
    const tz = p.z + Math.cos(p.angle) * 10;
    state.heli.x += (tx - state.heli.x) * Math.min(1, 1.6 * dt);
    state.heli.z += (tz - state.heli.z) * Math.min(1, 1.6 * dt);
    state.heli.angle += dt * 0.8;
  }

  function updateRoadblocks(dt) {
    if (state.wanted < ROADBLOCK.atWanted) {
      state.roadblocks = [];
      return;
    }
    state.roadblockTimer -= dt;
    if (state.roadblockTimer > 0) return;
    state.roadblockTimer = ROADBLOCK.gapSeconds;
    const p = state.player;
    const aheadX = p.x + Math.sin(p.angle) * ROADBLOCK.ahead;
    const aheadZ = p.z + Math.cos(p.angle) * ROADBLOCK.ahead;
    const spot = city.nearestRoadPoint(aheadX, aheadZ);
    const across = p.angle + Math.PI / 2;
    // The two cars park near the road edges, leaving a gap in the middle wide
    // enough to squeeze through — a roadblock is a challenge, not a wall.
    state.roadblocks = [
      { x: spot.x + Math.sin(across) * 6, z: spot.z + Math.cos(across) * 6, angle: p.angle },
      { x: spot.x - Math.sin(across) * 6, z: spot.z - Math.cos(across) * 6, angle: p.angle },
    ];
  }

  function collideRoadblocks() {
    if (state.car === null) return;
    for (const block of state.roadblocks) {
      const d = Math.hypot(state.car.x - block.x, state.car.z - block.z);
      if (d < 3.4 && d > 0.01) {
        // Shove the car back out of the roadblock car and bleed its speed: the
        // block is a wall with a gap between its two cars, not a speed trap.
        const push = (3.4 - d);
        state.car.x += ((state.car.x - block.x) / d) * push;
        state.car.z += ((state.car.z - block.z) / d) * push;
        state.car.speed *= 0.6;
        state.player.x = state.car.x;
        state.player.z = state.car.z;
      }
    }
  }

  function nearPlace(name, radius) {
    const place = PLACES[name];
    if (place === undefined) return false;
    return dist2(state.player.x, state.player.z, place.x, place.z) < radius * radius;
  }

  function buyGarage(kind) {
    // Upgrades are sold at the garage only — the player has to drive there.
    if (!nearPlace('garage', 12)) return false;
    if (kind === 'armor') {
      if (state.garage.armor || state.cash < GARAGE.armor.price) return false;
      state.cash -= GARAGE.armor.price;
      state.garage.armor = true;
      state.player.maxHealth += GARAGE.armor.health;
      state.player.health += GARAGE.armor.health;
      return true;
    }
    if (kind === 'engine') {
      if (state.garage.engine || state.cash < GARAGE.engine.price) return false;
      state.cash -= GARAGE.engine.price;
      state.garage.engine = true;
      return true;
    }
    if (kind === 'nos') {
      if (state.garage.nos || state.cash < GARAGE.nos.price) return false;
      state.cash -= GARAGE.nos.price;
      state.garage.nos = true;
      if (state.car !== null) state.car.nos = 1;
      return true;
    }
    if (kind === 'refill') {
      if (!state.garage.nos || state.cash < GARAGE.nos.refill) return false;
      state.cash -= GARAGE.nos.refill;
      if (state.car !== null) state.car.nos = 1;
      return true;
    }
    return false;
  }

  function buyWeapon(kind) {
    const weapon = WEAPONS[kind];
    if (weapon === undefined || weapon.price === undefined) return false;
    if (state.weapons.owned[kind] || state.cash < weapon.price) return false;
    state.cash -= weapon.price;
    state.weapons.owned[kind] = true;
    state.weapons.ammo[kind] = 24;
    state.weapons.current = kind;
    return true;
  }

  function buyAmmo(kind) {
    const weapon = WEAPONS[kind];
    if (weapon === undefined || weapon.ammoPrice === undefined) return false;
    if (!state.weapons.owned[kind] || state.cash < weapon.ammoPrice) return false;
    state.cash -= weapon.ammoPrice;
    state.weapons.ammo[kind] += 24;
    return true;
  }

  function cycleWeapon() {
    const order = ['fists', 'pistol', 'smg', 'shotgun'];
    const owned = order.filter((k) => k === 'fists' || state.weapons.owned[k]);
    const at = owned.indexOf(state.weapons.current);
    state.weapons.current = owned[(at + 1) % owned.length];
  }

  // No Infinity anywhere in the saved shape: timers that are off store -1.
  function serialize() {
    return JSON.parse(JSON.stringify({
      player: state.player,
      car: state.car,
      wanted: state.wanted,
      cash: state.cash,
      clockMinutes: state.clockMinutes,
      weapons: state.weapons,
      garage: state.garage,
      radio: state.radio,
      elapsed: state.elapsed,
    }));
  }

  function deserialize(data) {
    if (data === null || typeof data !== 'object') return false;
    const p = data.player;
    if (p === null || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    state.player.x = p.x;
    state.player.z = p.z;
    state.player.angle = Number.isFinite(p.angle) ? p.angle : 0;
    state.player.health = Number.isFinite(p.health) ? p.health : PLAYER.health;
    state.player.maxHealth = Number.isFinite(p.maxHealth) ? p.maxHealth : PLAYER.health;
    state.player.onFoot = p.onFoot !== false;
    state.player.speed = 0;
    state.car = data.car !== null && typeof data.car === 'object' && Number.isFinite(data.car.x) ? data.car : null;
    if (state.car !== null) state.player.onFoot = false;
    state.wanted = clamp(Number.isFinite(data.wanted) ? data.wanted : 0, 0, WANTED.max);
    state.cash = Number.isFinite(data.cash) ? data.cash : 0;
    state.clockMinutes = Number.isFinite(data.clockMinutes) ? data.clockMinutes : CLOCK.startHour * 60 + CLOCK.startMinute;
    if (data.weapons !== null && typeof data.weapons === 'object') state.weapons = data.weapons;
    if (data.garage !== null && typeof data.garage === 'object') state.garage = data.garage;
    state.radio = Number.isFinite(data.radio) ? data.radio : 0;
    state.elapsed = Number.isFinite(data.elapsed) ? data.elapsed : 0;
    state.losTimer = 0;
    state.fadeTimer = 0;
    state.police = [];
    state.roadblocks = [];
    state.heli.active = false;
    return true;
  }

  function step(dt, input) {
    if (state.busted || state.dead) return;
    state.elapsed += dt;
    state.clockMinutes += CLOCK.minutesPerSecond * dt;
    // Catch your breath when the heat is off.
    if (state.wanted === 0 && state.player.health < state.player.maxHealth) {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 5 * dt);
    }
    if (state.fireCooldown > 0) state.fireCooldown -= dt;
    if (state.punchCooldown > 0) state.punchCooldown -= dt;
    if (input.enter) {
      if (state.player.onFoot) enterCar();
      else exitCar();
    }
    // X steps out of the car without stealing — E toggles, X only exits.
    if (input.exit && !state.player.onFoot) exitCar();
    if (input.weaponCycle) cycleWeapon();
    if (input.radioNext) state.radio = (state.radio + 1) % 3;
    if (state.player.onFoot) {
      walk(dt, input);
      punch(dt, input);
    } else {
      drive(dt, input);
    }
    shoot(dt, input);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateHeli(dt);
    updateRoadblocks(dt);
    collideRoadblocks();
    if (state.player.health <= 0) state.dead = true;
  }

  reset();
  return {
    state, city, reset, step, setClock, daylight, hourMinute, addHeat, setWanted,
    nearPlace, buyGarage, buyWeapon, buyAmmo, cycleWeapon, serialize, deserialize,
  };
}
