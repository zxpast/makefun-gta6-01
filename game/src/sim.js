// Solano Heat — the rules. No drawing and no browser in it: the player, the
// cars, the traffic, the pedestrians, the police, the helicopter, the
// roadblocks, the wanted stars, the weapons, the garage and the clock. step()
// advances one fixed step and returns what happened as bit flags. Everything
// random comes from the seeded source, so the same seed plays the same game.

import {
  CAR,
  CLOCK,
  GARAGE,
  HELI,
  PLAYER,
  POLICE,
  ROADBLOCK,
  SPAWN,
  START_CASH,
  STEP,
  TRAFFIC,
  WANTED,
  WEAPONS,
  WORLD,
} from './config.js';
import { createCity } from './city.js';
import { createRandom } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_STOLEN = 1;
export const EVENT_HIT_PED = 2;
export const EVENT_SHOT = 4;
export const EVENT_RAMMED = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_WANTED_UP = 64;
export const EVENT_WANTED_DOWN = 128;
export const EVENT_CRASH = 256;
export const EVENT_HELI = 512;
export const EVENT_ROADBLOCK = 1024;

const TAU = Math.PI * 2;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** The smallest signed turn from `from` to `to`, in radians. */
function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function forwardX(angle) {
  return Math.sin(angle);
}
function forwardZ(angle) {
  return Math.cos(angle);
}

export function createSim(seed) {
  const rng = createRandom(seed);
  const city = createCity(rng);

  const parkedCars = city.parked.map((spot, i) => ({
    id: i,
    x: spot.x,
    z: spot.z,
    angle: spot.angle,
    speed: 0,
    color: rng.pick(['#c94f42', '#4f7ec9', '#e8e8e8', '#3a3f4a', '#7a4fc9', '#4fc9a0']),
    parked: true,
    health: 100,
    stolen: false,
  }));

  const traffic = [];
  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const x = rng.range(60, WORLD.width - 60);
    const z = rng.range(60, WORLD.height - 60);
    const dest = city.nearestNode(rng.range(0, WORLD.width), rng.range(0, WORLD.height));
    traffic.push({
      x,
      z,
      angle: rng.angle(),
      speed: TRAFFIC.speed,
      route: city.route(x, z, dest.x, dest.z),
      routeIndex: 0,
      color: rng.pick(['#8b93a3', '#6a707c', '#a3a3a3', '#5a6a7a']),
      stopped: 0,
    });
  }

  const peds = [];
  for (let i = 0; i < TRAFFIC.peds; i += 1) {
    peds.push({
      x: rng.range(40, WORLD.width - 40),
      z: rng.range(40, WORLD.height - 40),
      angle: rng.angle(),
      speed: TRAFFIC.pedSpeed,
      tx: rng.range(40, WORLD.width - 40),
      tz: rng.range(40, WORLD.height - 40),
      down: 0,
      hostile: false,
      health: 30,
    });
  }

  const state = {
    seed,
    elapsed: 0,
    clockMinutes: CLOCK.startHours * 60 + CLOCK.startMinutes,
    cash: START_CASH,
    wanted: 0,
    shotHeatTimer: 0,
    crashCooldown: 0,
    loseSightTimer: 0,
    fadeTimer: 0,
    roadblockTimer: 12,
    player: {
      x: SPAWN.x,
      z: SPAWN.z,
      angle: SPAWN.angle,
      onFoot: true,
      car: -1,
      health: PLAYER.maxHealth,
      maxHealth: PLAYER.maxHealth,
      punchCooldown: 0,
      shootCooldown: 0,
      weapon: 0,
      owned: [true, false, false, false],
      ammo: [Infinity, 0, 0, 0],
      nosTime: 0,
      speed: 0,
    },
    garage: { armor: false, engine: false, nos: false, nosLeft: 0 },
    radio: 0,
    police: [],
    heli: { active: false, x: SPAWN.x, z: SPAWN.z - 40, angle: 0 },
    roadblocks: [],
    busted: false,
    wasted: false,
    parkedCars,
    traffic,
    peds,
    city,
  };

  function topSpeed() {
    let top = CAR.baseTopSpeed + (state.garage.engine ? CAR.engineBonus : 0);
    if (state.player.nosTime > 0) top += CAR.nosBoost;
    return top;
  }

  function addWanted(stars) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + stars);
    if (state.wanted > before) return EVENT_WANTED_UP;
    return EVENT_NONE;
  }

  function syncPolice() {
    const want = POLICE.countByStars[state.wanted];
    while (state.police.length < want) {
      const a = rng.angle();
      const d = rng.range(60, 110);
      state.police.push({
        x: clamp(state.player.x + Math.sin(a) * d, 20, WORLD.width - 20),
        z: clamp(state.player.z + Math.cos(a) * d, 20, WORLD.height - 20),
        angle: rng.angle(),
        speed: 0,
        mode: 'chase',
        loseTimer: 0,
        ramTimer: 0,
        bustTimer: 0,
        health: 100,
        lastX: state.player.x,
        lastZ: state.player.z,
      });
    }
    while (state.police.length > want) state.police.pop();
    const heliWant = state.wanted >= 4;
    if (heliWant && !state.heli.active) {
      state.heli.active = true;
      state.heli.x = state.player.x;
      state.heli.z = state.player.z - HELI.followDistance;
      return EVENT_HELI;
    }
    if (!heliWant) state.heli.active = false;
    return EVENT_NONE;
  }

  function movePlayer(dt, input) {
    const p = state.player;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.shootCooldown > 0) p.shootCooldown -= dt;
    if (p.nosTime > 0) p.nosTime -= dt;

    if (p.onFoot) {
      const turn = input.steer * 2.6 * dt;
      p.angle += turn;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const moving = input.throttle > 0;
      if (moving) {
        const nx = p.x + forwardX(p.angle) * speed * input.throttle * dt;
        const nz = p.z + forwardZ(p.angle) * speed * input.throttle * dt;
        // A player standing inside a building's padded edge (usually after
        // being thrown from a dying car) may always step out again: without
        // this, every step's destination is still inside the pad and the
        // player is trapped forever a hand's width from the wall.
        if (!city.inBuilding(nx, nz, PLAYER.radius) || city.inBuilding(p.x, p.z, PLAYER.radius)) {
          p.x = clamp(nx, 10, WORLD.width - 10);
          p.z = clamp(nz, 10, WORLD.height - 10);
        }
      }
      p.speed = moving ? speed * input.throttle : 0;
      return;
    }

    const car = parkedCars[p.car];
    if (!car) {
      p.onFoot = true;
      p.car = -1;
      return;
    }
    const top = topSpeed();
    if (input.nos && state.garage.nos && state.garage.nosLeft > 0 && p.nosTime <= 0) {
      state.garage.nosLeft -= 1;
      p.nosTime = CAR.nosSeconds;
    }
    if (input.throttle > 0) car.speed += CAR.accel * input.throttle * dt;
    if (input.brake > 0) car.speed -= CAR.brake * input.brake * dt;
    if (input.throttle <= 0 && input.brake <= 0) car.speed -= Math.sign(car.speed) * 4 * dt;
    car.speed = clamp(car.speed, -CAR.reverseMax, top);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
    const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1);
    car.angle += input.steer * CAR.steerRate * steerAuthority * Math.sign(car.speed || 1) * dt;
    const nx = car.x + forwardX(car.angle) * car.speed * dt;
    const nz = car.z + forwardZ(car.angle) * car.speed * dt;
    // Only when the car is moving into a building from outside it. A car
    // parked a hand's width inside the padded edge would otherwise take
    // damage every second while standing still, and could never leave.
    // The pad is the car's half-width: a wider pad makes the car ride the
    // boundary of a building face it is driving along and stall there.
    let blockedByBuilding = false;
    if (Math.abs(car.speed) > 0.1 && city.inBuilding(nx, nz, 1.2) && !city.inBuilding(car.x, car.z, 1.2)) {
      // A scrape costs health once a second, not once a step: a car
      // turning along a building face would otherwise die in a second.
      if (state.crashCooldown <= 0) {
        car.health -= 4;
        state.crashCooldown = 1;
      }
      car.speed *= -0.25;
      blockedByBuilding = true;
    }
    if (!blockedByBuilding) {
      car.x = clamp(nx, 10, WORLD.width - 10);
      car.z = clamp(nz, 10, WORLD.height - 10);
    }
    p.x = car.x;
    p.z = car.z;
    p.angle = car.angle;
    p.speed = Math.abs(car.speed);
    if (car.health <= 0) {
      car.health = 0;
      car.parked = true;
      p.onFoot = true;
      p.car = -1;
      p.x = car.x + forwardX(car.angle) * 3;
      p.z = car.z + forwardZ(car.angle) * 3;
    }
  }

  function tryEnterCar() {
    const p = state.player;
    if (!p.onFoot) {
      // Get out of the car.
      const car = parkedCars[p.car];
      if (car) {
        p.onFoot = true;
        p.car = -1;
        p.x = car.x + forwardX(car.angle + Math.PI / 2) * 3;
        p.z = car.z + forwardZ(car.angle + Math.PI / 2) * 3;
      }
      return EVENT_NONE;
    }
    let best = null;
    let bestD = CAR.stealRange;
    for (const car of parkedCars) {
      if (!car.parked || car.health <= 0) continue;
      const d = dist(p.x, p.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return EVENT_NONE;
    best.parked = false;
    best.stolen = true;
    p.onFoot = false;
    p.car = best.id;
    p.angle = best.angle;
    return addWanted(WANTED.stealStars) | EVENT_STOLEN;
  }

  function updateTraffic(dt) {
    for (const t of traffic) {
      if (t.stopped > 0) {
        t.stopped -= dt;
        continue;
      }
      const target = t.route[t.routeIndex];
      if (!target) continue;
      const dx = target.x - t.x;
      const dz = target.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) {
        t.routeIndex += 1;
        if (t.routeIndex >= t.route.length) {
          const dest = city.nearestNode(rng.range(0, WORLD.width), rng.range(0, WORLD.height));
          t.route = city.route(t.x, t.z, dest.x, dest.z);
          t.routeIndex = 0;
        }
        continue;
      }
      const want = Math.atan2(dx, dz);
      t.angle += clamp(angleDiff(t.angle, want), -1.8 * dt, 1.8 * dt);
      t.x += forwardX(t.angle) * t.speed * dt;
      t.z += forwardZ(t.angle) * t.speed * dt;
    }
  }

  function updatePeds(dt) {
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }
      if (ped.health <= 0) {
        ped.down = 8;
        ped.health = 30;
        continue;
      }
      const dx = ped.tx - ped.x;
      const dz = ped.tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) {
        ped.tx = rng.range(40, WORLD.width - 40);
        ped.tz = rng.range(40, WORLD.height - 40);
        continue;
      }
      const want = Math.atan2(dx, dz);
      ped.angle += clamp(angleDiff(ped.angle, want), -2 * dt, 2 * dt);
      const nx = ped.x + forwardX(ped.angle) * ped.speed * dt;
      const nz = ped.z + forwardZ(ped.angle) * ped.speed * dt;
      if (!city.inBuilding(nx, nz, 0.5)) {
        ped.x = nx;
        ped.z = nz;
      }
    }
  }

  function collideCarWithWorld(dt) {
    const p = state.player;
    if (p.onFoot) return EVENT_NONE;
    const car = parkedCars[p.car];
    if (!car) return EVENT_NONE;
    let events = EVENT_NONE;
    // Traffic bumps. One bump a second at most, and the traffic car is
    // shoved forward along its heading so the two cars separate: without
    // that the stopped car never moves away and the player dies waiting.
    for (const t of traffic) {
      if (dist(car.x, car.z, t.x, t.z) < 3.4 && state.crashCooldown <= 0) {
        car.speed *= 0.55;
        t.x += forwardX(t.angle) * 4;
        t.z += forwardZ(t.angle) * 4;
        t.stopped = 0.5;
        car.health -= 2;
        state.crashCooldown = 1;
        events |= EVENT_CRASH;
      }
    }
    // Pedestrians in the way.
    for (const ped of peds) {
      if (ped.down > 0) continue;
      if (dist(car.x, car.z, ped.x, ped.z) < 2 && Math.abs(car.speed) > 3) {
        ped.down = 10;
        ped.health = 0;
        car.speed *= 0.8;
        events |= addWanted(WANTED.hitPedStars) | EVENT_HIT_PED;
      }
    }
    // Roadblocks stop a fast car hard.
    for (const rb of state.roadblocks) {
      if (dist(car.x, car.z, rb.x, rb.z) < 4.5 && Math.abs(car.speed) > 2 && state.crashCooldown <= 0) {
        car.speed *= 0.2;
        car.health -= 12;
        state.crashCooldown = 1;
        events |= EVENT_CRASH;
      }
    }
    return events;
  }

  function shoot(dt, input) {
    const p = state.player;
    if (!input.shoot || p.shootCooldown > 0) return EVENT_NONE;
    const weapon = WEAPONS[p.weapon];
    if (!p.owned[p.weapon]) return EVENT_NONE;
    if (p.weapon !== 0) {
      if (p.ammo[p.weapon] <= 0) return EVENT_NONE;
      p.ammo[p.weapon] -= 1;
    }
    p.shootCooldown = weapon.rate;
    // The shot goes where the player faces; the nearest thing inside the
    // cone and the range takes the hit.
    const shots = weapon.pellets ?? 1;
    let hitAnything = false;
    for (let s = 0; s < shots; s += 1) {
      const spread = (rng.next() - 0.5) * 0.12;
      const aim = p.angle + spread;
      let bestD = weapon.range;
      let bestTarget = null;
      const consider = (x, z, obj, kind) => {
        const dx = x - p.x;
        const dz = z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > weapon.range || d < 0.5) return;
        const want = Math.atan2(dx, dz);
        if (Math.abs(angleDiff(aim, want)) > 0.22) return;
        if (d < bestD) {
          bestD = d;
          bestTarget = { obj, kind };
        }
      };
      for (const ped of peds) if (ped.down <= 0) consider(ped.x, ped.z, ped, 'ped');
      for (const cop of state.police) consider(cop.x, cop.z, cop, 'cop');
      for (const t of traffic) consider(t.x, t.z, t, 'traffic');
      if (bestTarget) {
        hitAnything = true;
        const target = bestTarget.obj;
        target.health -= weapon.damage;
        if (bestTarget.kind === 'ped' && target.health <= 0) target.down = 10;
        if (bestTarget.kind === 'cop') target.health = Math.max(0, target.health);
        if (bestTarget.kind === 'traffic') target.stopped = 3;
      }
    }
    let events = EVENT_SHOT;
    if (state.shotHeatTimer <= 0) {
      events |= addWanted(WANTED.shootStars);
      state.shotHeatTimer = 5;
    }
    return events;
  }

  function punch(dt, input) {
    const p = state.player;
    if (!input.punch || p.punchCooldown > 0 || !p.onFoot) return EVENT_NONE;
    p.punchCooldown = PLAYER.punchCooldown;
    let events = EVENT_NONE;
    for (const ped of peds) {
      if (ped.down > 0) continue;
      if (dist(p.x, p.z, ped.x, ped.z) < PLAYER.punchRange) {
        ped.health -= PLAYER.punchDamage;
        if (ped.health <= 0) ped.down = 10;
        events |= addWanted(WANTED.hitPedStars) | EVENT_HIT_PED;
        break;
      }
    }
    return events;
  }

  function updatePolice(dt) {
    const p = state.player;
    let events = EVENT_NONE;
    let anySight = false;
    for (const cop of state.police) {
      if (cop.health <= 0) {
        cop.speed = 0;
        continue;
      }
      cop.ramTimer = Math.max(0, cop.ramTimer - dt);
      const d = dist(cop.x, cop.z, p.x, p.z);
      const sees = !city.blockedBetween(cop.x, cop.z, p.x, p.z) && d < 160;
      if (sees) {
        anySight = true;
        cop.lastX = p.x;
        cop.lastZ = p.z;
        cop.mode = 'chase';
        cop.loseTimer = 0;
      } else if (cop.mode === 'chase') {
        cop.loseTimer += dt;
        if (cop.loseTimer > WANTED.loseSightSeconds) cop.mode = 'search';
      }
      const tx = cop.mode === 'chase' ? p.x : cop.lastX;
      const tz = cop.mode === 'chase' ? p.z : cop.lastZ;
      const dx = tx - cop.x;
      const dz = tz - cop.z;
      const td = Math.hypot(dx, dz);
      if (td > 2) {
        const want = Math.atan2(dx, dz);
        cop.angle += clamp(angleDiff(cop.angle, want), -2.4 * dt, 2.4 * dt);
        cop.speed = Math.min(POLICE.topSpeed, cop.speed + POLICE.accel * dt);
      } else {
        cop.speed = Math.max(0, cop.speed - 12 * dt);
      }
      const nx = cop.x + forwardX(cop.angle) * cop.speed * dt;
      const nz = cop.z + forwardZ(cop.angle) * cop.speed * dt;
      if (!city.inBuilding(nx, nz, 1.6)) {
        cop.x = clamp(nx, 10, WORLD.width - 10);
        cop.z = clamp(nz, 10, WORLD.height - 10);
      } else {
        cop.speed *= 0.4;
      }
      // Ram: close in, shove the player's car and slow it, once a second.
      if (!p.onFoot && d < 5 && cop.ramTimer <= 0) {
        const car = parkedCars[p.car];
        if (car) {
          car.speed *= POLICE.ramSlow;
          car.health -= 3;
          cop.speed *= 0.5;
          cop.ramTimer = POLICE.ramCooldown;
          events |= EVENT_RAMMED;
        }
      }
      // Bust: close and nearly still for long enough.
      if (d < POLICE.bustDistance && p.speed < POLICE.bustStillSpeed) {
        cop.bustTimer += dt;
        if (cop.bustTimer > POLICE.bustSeconds) {
          state.busted = true;
          events |= EVENT_BUSTED;
        }
      } else {
        cop.bustTimer = 0;
      }
    }
    // Heat fades once the trail is cold and no cop is near.
    if (!anySight && state.wanted > 0) {
      const near = state.police.some((c) => dist(c.x, c.z, p.x, p.z) < WANTED.nearDistance);
      if (!near) {
        state.fadeTimer += dt;
        if (state.fadeTimer > WANTED.fadeSeconds) {
          state.fadeTimer = 0;
          state.wanted -= 1;
          events |= EVENT_WANTED_DOWN;
        }
      } else {
        state.fadeTimer = 0;
      }
    } else {
      state.fadeTimer = 0;
    }
    return events;
  }

  function updateHeli(dt) {
    const heli = state.heli;
    if (!heli.active) return;
    const p = state.player;
    const tx = p.x - forwardX(p.angle) * HELI.followDistance;
    const tz = p.z - forwardZ(p.angle) * HELI.followDistance;
    const dx = tx - heli.x;
    const dz = tz - heli.z;
    const d = Math.hypot(dx, dz);
    if (d > 1) {
      const step = Math.min(d, HELI.speed * dt);
      heli.x += (dx / d) * step;
      heli.z += (dz / d) * step;
    }
    heli.angle = Math.atan2(p.x - heli.x, p.z - heli.z);
  }

  function updateRoadblocks(dt) {
    state.roadblockTimer -= dt;
    for (const rb of state.roadblocks) rb.timer -= dt;
    const before = state.roadblocks.length;
    state.roadblocks = state.roadblocks.filter((rb) => rb.timer > 0);
    // A roadblock that just cleared leaves a gap before the next one goes up.
    if (state.roadblocks.length < before) state.roadblockTimer = ROADBLOCK.cooldown;
    if (state.wanted >= 4 && state.roadblockTimer <= 0) {
      const p = state.player;
      const ahead = city.pointAhead(p.x, p.z, p.angle, ROADBLOCK.aheadDistance);
      state.roadblocks.push({ x: ahead.x, z: ahead.z, angle: p.angle, timer: 40 });
      state.roadblockTimer = ROADBLOCK.cooldown;
      return EVENT_ROADBLOCK;
    }
    return EVENT_NONE;
  }

  function damagePlayer(amount) {
    const p = state.player;
    p.health -= amount;
    if (p.health <= 0) {
      p.health = 0;
      state.wasted = true;
      return EVENT_WASTED;
    }
    return EVENT_NONE;
  }

  /** Buy from the garage. Returns true when the purchase went through. */
  function buy(kind, weaponIndex = 0) {
    const p = state.player;
    const g = state.garage;
    if (kind === 'armor') {
      if (g.armor || state.cash < GARAGE.armorPrice) return false;
      state.cash -= GARAGE.armorPrice;
      g.armor = true;
      p.maxHealth += GARAGE.armorBonus;
      p.health = p.maxHealth;
      return true;
    }
    if (kind === 'engine') {
      if (g.engine || state.cash < GARAGE.enginePrice) return false;
      state.cash -= GARAGE.enginePrice;
      g.engine = true;
      return true;
    }
    if (kind === 'nos') {
      if (g.nos || state.cash < GARAGE.nosPrice) return false;
      state.cash -= GARAGE.nosPrice;
      g.nos = true;
      g.nosLeft = 3;
      return true;
    }
    if (kind === 'nosRefill') {
      if (!g.nos || state.cash < GARAGE.nosRefillPrice) return false;
      state.cash -= GARAGE.nosRefillPrice;
      g.nosLeft = 3;
      return true;
    }
    if (kind === 'weapon') {
      const w = WEAPONS[weaponIndex];
      if (!w || weaponIndex === 0 || p.owned[weaponIndex] || state.cash < w.price) return false;
      state.cash -= w.price;
      p.owned[weaponIndex] = true;
      p.ammo[weaponIndex] = w.ammo;
      return true;
    }
    if (kind === 'ammo') {
      const w = WEAPONS[weaponIndex];
      if (!w || weaponIndex === 0 || !p.owned[weaponIndex] || state.cash < w.ammoPrice) return false;
      state.cash -= w.ammoPrice;
      p.ammo[weaponIndex] += w.ammoPack;
      return true;
    }
    return false;
  }

  /** The district the player is standing in. */
  function district() {
    return city.districtAt(state.player.x, state.player.z);
  }

  /** How light the sky is, 0 (night) to 1 (day), from the clock. */
  function daylight() {
    const h = state.clockMinutes / 60;
    if (h < 5 || h >= 21) return 0.06;
    if (h < 7) return 0.06 + ((h - 5) / 2) * 0.5;
    if (h < 17) return 0.56 + ((h - 7) / 10) * 0.44;
    if (h < 19) return 1 - ((h - 17) / 2) * 0.55;
    if (h < 21) return 0.45 - ((h - 19) / 2) * 0.39;
    return 0.06;
  }

  function step(dt, input) {
    let events = EVENT_NONE;
    state.elapsed += dt;
    state.clockMinutes = (state.clockMinutes + dt * CLOCK.minutesPerSecond) % 1440;
    if (state.shotHeatTimer > 0) state.shotHeatTimer -= dt;
    if (state.crashCooldown > 0) state.crashCooldown -= dt;

    if (input.enter) events |= tryEnterCar();
    movePlayer(dt, input);
    events |= punch(dt, input);
    events |= shoot(dt, input);
    updateTraffic(dt);
    updatePeds(dt);
    events |= collideCarWithWorld(dt);
    events |= syncPolice();
    events |= updatePolice(dt);
    updateHeli(dt);
    events |= updateRoadblocks(dt);

    // Cops shooting back when close and the player is wanted.
    if (state.wanted > 0 && !state.player.onFoot) {
      for (const cop of state.police) {
        if (cop.health <= 0) continue;
        if (dist(cop.x, cop.z, state.player.x, state.player.z) < 26 && rng.chance(dt * 0.25)) {
          events |= damagePlayer(2);
        }
      }
    }

    if (input.nextWeapon) {
      const p = state.player;
      for (let i = 1; i <= WEAPONS.length; i += 1) {
        const next = (p.weapon + i) % WEAPONS.length;
        if (p.owned[next]) {
          p.weapon = next;
          break;
        }
      }
    }
    return events;
  }

  function reset() {
    const fresh = createSim(seed);
    for (const key of Object.keys(state)) {
      if (key === 'city') continue;
      state[key] = fresh.state[key];
    }
    state.city = city;
  }

  return {
    state,
    city,
    step,
    buy,
    district,
    daylight,
    reset,
    addWanted,
    damagePlayer,
    topSpeed,
    /** Save only what progress is: cash, garage, weapons, health, chapters. */
    saveData(completedChapters) {
      return {
        cash: state.cash,
        garage: { ...state.garage },
        weapon: state.player.weapon,
        owned: [...state.player.owned],
        ammo: [...state.player.ammo],
        maxHealth: state.player.maxHealth,
        chapters: [...completedChapters],
      };
    },
    loadSaveData(data) {
      if (!data || typeof data !== 'object') return;
      if (typeof data.cash === 'number') state.cash = data.cash;
      if (data.garage) state.garage = { ...state.garage, ...data.garage };
      if (Array.isArray(data.owned)) state.player.owned = data.owned.slice(0, 4);
      // Ammo that came back as null or -1 is the fists' unlimited supply:
      // JSON cannot hold Infinity, so a save written before the sentinel
      // (or by hand) must not leave the fists unable to fire.
      if (Array.isArray(data.ammo)) {
        state.player.ammo = data.ammo.slice(0, 4).map((a) => (a === null || a === -1 ? Infinity : a));
      }
      if (typeof data.maxHealth === 'number') {
        state.player.maxHealth = data.maxHealth;
        state.player.health = data.maxHealth;
      }
    },
  };
}
