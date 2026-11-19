// Solano Heat — the rules. No drawing, no DOM, no audio in here: the player
// on foot or in a car, traffic, pedestrians, police with line of sight, the
// helicopter, roadblocks, the wanted system, weapons and the garage. step()
// advances one fixed step and returns event flags; missions.js reads the
// state and drives objectives from it.
import {
  CAR, CITY, CLOCK, ECONOMY, GARAGE, PED_COUNT, PARKED_COUNT,
  PLAYER, TRAFFIC_COUNT, WANTED, WEAPONS,
} from './config.js';
import {
  districtAt, hasLineOfSight, nearestHorizontal, nearestVertical,
  onRoad, resolveCollision, routeBetween,
} from './city.js';

export const EVENT_BOOM = 1;      // a crash, a shot, a punch landed
export const EVENT_WANTED_UP = 2;
export const EVENT_WANTED_DOWN = 4;
export const EVENT_BUSTED = 8;
export const EVENT_DEAD = 16;
export const EVENT_CASH = 32;
export const EVENT_MISSION = 64;
export const EVENT_SHOT = 128;

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0x3a8a4a, 0xd8d3c8, 0x22242a, 0x7a4a9e, 0xc27a2e];
const CAR_MODELS = ['sedan', 'coupe', 'van', 'pickup'];

function angleTo(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dist(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }

export function createSim(random, city) {
  const state = {
    time: 0, clockMinutes: CLOCK.startMinutes, clockBase: CLOCK.startMinutes,
    player: { x: 600, z: 540, angle: 0, onFoot: true, speed: 0, health: PLAYER.health, run: false },
    car: null,
    parked: [], traffic: [], peds: [], police: [], roadblocks: [],
    heli: { active: false, x: 0, z: 0, angle: 0, alt: 46 },
    wanted: 0, losTimer: 0, lastSeen: { x: 600, z: 540 },
    cash: ECONOMY.startCash,
    weapons: { owned: { fists: true }, current: 'fists', ammo: {} },
    upgrades: { armor: false, engine: false, nos: false, nosAmount: 0 },
    marker: null, feed: [], mission: null, sideJob: null,
    busted: false, dead: false, bustedTimer: 0,
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, distanceDriven: 0 },
    district: 'Marina',
  };

  function say(text) {
    state.feed.push(text);
    if (state.feed.length > 6) state.feed.shift();
  }

  function spawnParked() {
    state.parked = [];
    for (let i = 0; i < PARKED_COUNT; i += 1) {
      const vertical = random.next() < 0.5;
      const road = vertical ? random.pick(city.verticals) : random.pick(city.horizontals);
      const along = random.range(90, vertical ? CITY.height - 90 : CITY.width - 90);
      const side = random.pick([-1, 1]) * (CITY.roadHalf + 2.5);
      state.parked.push({
        x: vertical ? road + side : along,
        z: vertical ? along : road + side,
        angle: vertical ? (random.next() < 0.5 ? 0 : Math.PI) : (random.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        color: random.pick(CAR_COLORS), model: random.pick(CAR_MODELS), marked: false,
      });
    }
  }

  function spawnTraffic() {
    state.traffic = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const vertical = random.next() < 0.5;
      const road = vertical ? random.pick(city.verticals) : random.pick(city.horizontals);
      const along = random.range(80, vertical ? CITY.height - 80 : CITY.width - 80);
      const dir = random.pick([-1, 1]);
      const lane = dir * 3.2;
      state.traffic.push({
        x: vertical ? road + lane : along,
        z: vertical ? along : road + lane,
        angle: vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
        speed: random.range(8, 13), dir, vertical,
        color: random.pick(CAR_COLORS), model: random.pick(CAR_MODELS),
      });
    }
  }

  function spawnPeds() {
    state.peds = [];
    for (let i = 0; i < PED_COUNT; i += 1) {
      const x = random.range(40, CITY.width - 40);
      const z = random.range(40, CITY.height - 40);
      state.peds.push({
        x, z, angle: random.range(0, Math.PI * 2),
        speed: random.range(1, 1.8), down: false, downTimer: 0,
        shirt: random.pick([0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c94a, 0xd8d8d8, 0x8a4ad8]),
      });
    }
  }

  function reset() {
    state.time = 0;
    state.clockMinutes = CLOCK.startMinutes;
    state.clockBase = CLOCK.startMinutes;
    Object.assign(state.player, { x: 600, z: 540, angle: 0, onFoot: true, speed: 0, health: PLAYER.health });
    state.car = null;
    state.police = [];
    state.roadblocks = [];
    state.heli.active = false;
    state.wanted = 0;
    state.losTimer = 0;
    state.cash = ECONOMY.startCash;
    state.weapons = { owned: { fists: true }, current: 'fists', ammo: {} };
    state.upgrades = { armor: false, engine: false, nos: false, nosAmount: 0 };
    state.marker = null;
    state.feed = [];
    state.mission = null;
    state.sideJob = null;
    state.busted = false;
    state.dead = false;
    state.bustedTimer = 0;
    state.stats = { carsStolen: 0, pedsHit: 0, shotsFired: 0, distanceDriven: 0 };
    spawnParked();
    spawnTraffic();
    spawnPeds();
  }

  function wantedStars() { return Math.min(WANTED.max, Math.floor(state.wanted + 0.5)); }

  function addWanted(amount, reason) {
    const before = wantedStars();
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    if (wantedStars() > before) {
      say(`${reason} — wanted ${'★'.repeat(wantedStars())}`);
      return EVENT_WANTED_UP;
    }
    return 0;
  }

  function earn(amount, reason) {
    state.cash += amount;
    say(`${reason}: +$${amount}`);
    return EVENT_CASH;
  }

  function nearestCar(x, z, range) {
    let best = null;
    let bestD = range;
    for (const c of state.parked) {
      const d = dist(x, z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function enterCar() {
    const p = state.player;
    const target = nearestCar(p.x, p.z, PLAYER.enterRange);
    if (!target) return 0;
    state.parked.splice(state.parked.indexOf(target), 1);
    state.car = { ...target, speed: 0, health: 100 };
    p.onFoot = false;
    p.x = state.car.x;
    p.z = state.car.z;
    p.angle = state.car.angle;
    state.stats.carsStolen += 1;
    say(`Stole a ${target.model} — the owner will call it in`);
    return addWanted(1, 'Grand theft auto');
  }

  function exitCar() {
    const p = state.player;
    if (!state.car) return;
    const side = { x: state.car.x + Math.cos(state.car.angle) * 3, z: state.car.z - Math.sin(state.car.angle) * 3 };
    const fixed = resolveCollision(city, side.x, side.z, PLAYER.radius);
    p.x = fixed.x;
    p.z = fixed.z;
    p.angle = state.car.angle;
    p.onFoot = true;
    p.speed = 0;
    state.parked.push({ x: state.car.x, z: state.car.z, angle: state.car.angle, color: state.car.color, model: state.car.model, marked: false });
    state.car = null;
  }

  function drive(dt, input) {
    const car = state.car;
    const top = CAR.maxSpeed + (state.upgrades.engine ? GARAGE.engine.bonus : 0);
    let accel = 0;
    if (input.throttle > 0) accel = CAR.accel * input.throttle;
    else if (input.throttle < 0) accel = car.speed > 0.5 ? -CAR.brake * Math.abs(input.throttle) : -CAR.reverseAccel * Math.abs(input.throttle);
    if (input.nos && state.upgrades.nos && state.upgrades.nosAmount > 0 && car.speed > 4) {
      accel += CAR.nosBoost;
      state.upgrades.nosAmount = Math.max(0, state.upgrades.nosAmount - CAR.nosDrain * dt);
    }
    car.speed += accel * dt;
    car.speed -= car.speed * CAR.drag * dt * 0.4;
    car.speed = Math.max(-CAR.maxReverse, Math.min(top, car.speed));
    if (Math.abs(car.speed) < 0.15 && input.throttle === 0) car.speed = 0;
    const steerAuthority = Math.min(1, 0.55 + Math.abs(car.speed) / 12);
    car.angle += input.steer * CAR.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const nz = car.z + Math.cos(car.angle) * car.speed * dt;
    const fixed = resolveCollision(city, nx, nz, CAR.length / 2);
    // A wall stops the car but never freezes it: the resolved position is
    // always kept, so a car sliding along a wall keeps moving along it.
    const hitWall = fixed.x !== nx || fixed.z !== nz;
    if (hitWall) car.speed *= 0.7;
    state.stats.distanceDriven += Math.abs(car.speed) * dt;
    car.x = fixed.x;
    car.z = fixed.z;
    state.player.x = car.x;
    state.player.z = car.z;
    state.player.angle = car.angle;
    state.player.speed = car.speed;
    return hitWall && Math.abs(car.speed) > 4 ? EVENT_BOOM : 0;
  }

  function walk(dt, input) {
    // Tank-style on foot, like the car: W/S move along the heading, A/D
    // turn it. The chase camera sits behind the player, so W is forward
    // on screen.
    const p = state.player;
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.angle += input.steer * 2.4 * dt;
    if (input.throttle !== 0) {
      const nx = p.x + Math.sin(p.angle) * speed * input.throttle * dt;
      const nz = p.z + Math.cos(p.angle) * speed * input.throttle * dt;
      const fixed = resolveCollision(city, nx, nz, PLAYER.radius);
      p.x = fixed.x;
      p.z = fixed.z;
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    p.run = input.run && input.throttle !== 0;
  }

  function stepTraffic(dt) {
    for (const t of state.traffic) {
      // Slow down for the car ahead on the same road.
      let ahead = Infinity;
      for (const o of state.traffic) {
        if (o === t || o.vertical !== t.vertical) continue;
        const along = t.vertical ? (o.z - t.z) * t.dir : (o.x - t.x) * t.dir;
        const across = t.vertical ? Math.abs(o.x - t.x) : Math.abs(o.z - t.z);
        if (along > 0 && along < ahead && across < 4) ahead = along;
      }
      const playerCar = state.car;
      if (playerCar) {
        const along = t.vertical ? (playerCar.z - t.z) * t.dir : (playerCar.x - t.x) * t.dir;
        const across = t.vertical ? Math.abs(playerCar.x - t.x) : Math.abs(playerCar.z - t.z);
        if (along > 0 && along < ahead && across < 4) ahead = along;
      }
      const targetSpeed = ahead < 14 ? 0 : 11;
      t.speed += (targetSpeed - t.speed) * Math.min(1, 2 * dt);
      const nx = t.x + Math.sin(t.angle) * t.speed * dt;
      const nz = t.z + Math.cos(t.angle) * t.speed * dt;
      // Turn at intersections, keep on the road grid.
      const atX = t.vertical ? nz : nx;
      const roadPos = t.vertical ? nearestHorizontal(nz) : nearestVertical(nx);
      if (Math.abs(atX - roadPos) < 1.2 && random.next() < 0.25) {
        const turn = random.pick([-1, 1]);
        const newAngle = t.angle + turn * Math.PI / 2;
        t.vertical = !t.vertical;
        t.dir = Math.abs(Math.sin(newAngle)) > 0.5 ? (Math.sin(newAngle) > 0 ? 1 : -1) : (Math.cos(newAngle) > 0 ? 1 : -1);
        t.angle = newAngle;
        if (t.vertical) t.x = nearestVertical(t.x) + t.dir * 3.2;
        else t.z = nearestHorizontal(t.z) + t.dir * 3.2;
      } else {
        t.x = nx;
        t.z = nz;
      }
      t.x = Math.min(CITY.width - 8, Math.max(8, t.x));
      t.z = Math.min(CITY.height - 8, Math.max(8, t.z));
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) ped.down = false;
        continue;
      }
      const d = dist(ped.x, ped.z, p.x, p.z);
      const danger = state.car && Math.abs(state.car.speed) > 8 && d < 14;
      if (danger) {
        // Run away from the road, fast.
        ped.angle = angleTo(p.x, p.z, ped.x, ped.z);
        const nx = ped.x + Math.sin(ped.angle) * 5 * dt;
        const nz = ped.z + Math.cos(ped.angle) * 5 * dt;
        const fixed = resolveCollision(city, nx, nz, 0.5);
        ped.x = fixed.x;
        ped.z = fixed.z;
      } else {
        if (random.next() < 0.01) ped.angle = random.range(0, Math.PI * 2);
        const nx = ped.x + Math.sin(ped.angle) * ped.speed * dt;
        const nz = ped.z + Math.cos(ped.angle) * ped.speed * dt;
        const fixed = resolveCollision(city, nx, nz, 0.5);
        ped.x = fixed.x;
        ped.z = fixed.z;
      }
      // Hit by the player's car.
      if (state.car && Math.abs(state.car.speed) > 3 && dist(ped.x, ped.z, state.car.x, state.car.z) < 2.6) {
        ped.down = true;
        ped.downTimer = 4;
        state.stats.pedsHit += 1;
        state.car.speed *= 0.7;
        addWanted(1, 'Hit a pedestrian');
      }
    }
  }

  function stepPolice(dt) {
    const stars = wantedStars();
    const want = WANTED.policePerStar[stars];
    while (state.police.length < want) {
      const a = random.range(0, Math.PI * 2);
      state.police.push({
        x: state.player.x + Math.sin(a) * 90, z: state.player.z + Math.cos(a) * 90,
        angle: 0, speed: 0, mode: 'chase', searchTimer: 0,
      });
    }
    while (state.police.length > want) state.police.pop();
    const p = state.player;
    for (const cop of state.police) {
      const seen = hasLineOfSight(city, cop.x, cop.z, p.x, p.z);
      if (seen) {
        state.lastSeen.x = p.x;
        state.lastSeen.z = p.z;
        state.losTimer = 0;
        cop.mode = 'chase';
      } else {
        state.losTimer += dt;
      }
      const target = cop.mode === 'chase' ? p : state.lastSeen;
      const wantAngle = angleTo(cop.x, cop.z, target.x, target.z);
      const d = dist(cop.x, cop.z, target.x, target.z);
      const top = cop.mode === 'chase' ? 30 : 16;
      const desired = d > 6 ? top : 8;
      cop.speed += (desired - cop.speed) * Math.min(1, 1.6 * dt);
      cop.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, angleDiff(cop.angle, wantAngle)));
      const nx = cop.x + Math.sin(cop.angle) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.angle) * cop.speed * dt;
      const fixed = resolveCollision(city, nx, nz, 2);
      if ((fixed.x !== nx || fixed.z !== nz) && cop.speed > 10) cop.speed *= 0.5;
      cop.x = fixed.x;
      cop.z = fixed.z;
      // Ram the player's car: a shove, not a glue — one hit per second,
      // and the cop loses speed too, so the player can push through.
      if (state.car && d < 4.5 && Math.abs(state.car.speed) < 12 && state.time - (cop.ramAt ?? -10) > 1) {
        cop.ramAt = state.time;
        state.car.speed *= 0.94;
        cop.speed *= 0.5;
      }
      // Bust: caught on foot or crawling next to a cop for three seconds.
      // A brief stop at a corner is not an arrest.
      const slow = state.car ? Math.abs(state.car.speed) < 2 : true;
      if (d < WANTED.bustRange && slow) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 3) {
          state.busted = true;
          say('Busted by the Solano PD.');
          return EVENT_BUSTED;
        }
      } else {
        state.bustedTimer = Math.max(0, state.bustedTimer - dt);
      }
      // Lost the trail: after six seconds blind, cops search the last seen spot.
      if (state.losTimer > WANTED.quietSeconds && cop.mode === 'chase') {
        cop.mode = 'search';
        cop.searchTimer = 8;
      }
      if (cop.mode === 'search') {
        cop.searchTimer -= dt;
        if (cop.searchTimer <= 0) cop.mode = 'chase';
      }
    }
    return 0;
  }

  function stepHeli(dt) {
    const stars = wantedStars();
    const heli = state.heli;
    if (stars >= WANTED.heliAt) {
      if (!heli.active) {
        heli.active = true;
        heli.x = state.player.x + 40;
        heli.z = state.player.z - 40;
        say('Police helicopter overhead — stay out of the spotlight.');
      }
      heli.angle += dt * 0.5;
      const wantX = state.player.x + Math.sin(heli.angle) * 28;
      const wantZ = state.player.z + Math.cos(heli.angle) * 28;
      heli.x += (wantX - heli.x) * Math.min(1, 1.2 * dt);
      heli.z += (wantZ - heli.z) * Math.min(1, 1.2 * dt);
    } else if (heli.active) {
      heli.active = false;
    }
  }

  function stepRoadblocks(dt) {
    const stars = wantedStars();
    if (stars < WANTED.roadblockAt) {
      state.roadblocks = [];
      return;
    }
    // One fresh block ahead on the player's road, refreshed on a timer.
    state.roadblockTimer = (state.roadblockTimer ?? 0) - dt;
    if (state.roadblocks.length < 2 && state.roadblockTimer <= 0) {
      const p = state.player;
      const aheadX = p.x + Math.sin(p.angle) * 55;
      const aheadZ = p.z + Math.cos(p.angle) * 55;
      const rx = nearestVertical(aheadX);
      const rz = nearestHorizontal(aheadZ);
      const verticalRoad = Math.abs(aheadX - rx) < Math.abs(aheadZ - rz);
      const bx = verticalRoad ? rx : Math.min(CITY.width - 20, Math.max(20, aheadX));
      const bz = verticalRoad ? Math.min(CITY.height - 20, Math.max(20, aheadZ)) : rz;
      state.roadblocks.push({ x: bx, z: bz, angle: verticalRoad ? Math.PI / 2 : 0 });
      state.roadblockTimer = 24;
      say('Roadblock ahead — find another way through.');
    }
    // Hitting a block at speed wrecks the car.
    if (state.car) {
      for (const rb of state.roadblocks) {
        if (dist(state.car.x, state.car.z, rb.x, rb.z) < 4 && Math.abs(state.car.speed) > 6) {
          state.car.speed = -state.car.speed * 0.25;
          state.player.health -= 12;
          say('Slammed into a roadblock.');
        }
      }
    }
  }

  function stepWanted(dt) {
    if (state.wanted <= 0) return 0;
    // Heat fades once the cops cannot see you; faster while they search.
    const searching = state.police.some((c) => c.mode === 'search');
    const rate = WANTED.decayPerSecond * (state.losTimer > 2 ? (searching ? 2.5 : 1.6) : 0.25);
    const before = wantedStars();
    state.wanted = Math.max(0, state.wanted - rate * dt);
    if (wantedStars() < before) {
      say(`Heat dropping — ${'★'.repeat(wantedStars()) || 'clean'}`);
      return EVENT_WANTED_DOWN;
    }
    return 0;
  }

  function shoot() {
    const w = state.weapons;
    const def = WEAPONS[w.current];
    if (w.current !== 'fists' && (w.ammo[w.current] ?? 0) <= 0) {
      say(`No ${def.name} ammo — buy more at the garage.`);
      return 0;
    }
    if (w.current !== 'fists') w.ammo[w.current] -= 1;
    state.stats.shotsFired += 1;
    const p = state.player;
    // Hit the nearest cop or ped inside the firing cone.
    let best = null;
    let bestD = def.range;
    for (const cop of state.police) {
      const d = dist(p.x, p.z, cop.x, cop.z);
      const a = Math.abs(angleDiff(p.angle, angleTo(p.x, p.z, cop.x, cop.z)));
      if (d < bestD && a < 0.5) { bestD = d; best = { kind: 'cop', ref: cop }; }
    }
    for (const ped of state.peds) {
      if (ped.down) continue;
      const d = dist(p.x, p.z, ped.x, ped.z);
      const a = Math.abs(angleDiff(p.angle, angleTo(p.x, p.z, ped.x, ped.z)));
      if (d < bestD && a < 0.5) { bestD = d; best = { kind: 'ped', ref: ped }; }
    }
    if (best) {
      if (best.kind === 'cop') {
        best.ref.speed *= 0.4;
        state.police.splice(state.police.indexOf(best.ref), 1);
        say(`Cop down — ${def.name}.`);
      } else {
        best.ref.down = true;
        best.ref.downTimer = 6;
        say('Shot a pedestrian. The city noticed.');
      }
      return addWanted(0.5, 'Shots fired') | EVENT_SHOT;
    }
    return EVENT_SHOT;
  }

  function cycleWeapon() {
    const owned = Object.keys(state.weapons.owned);
    const at = owned.indexOf(state.weapons.current);
    state.weapons.current = owned[(at + 1) % owned.length];
    say(`Weapon: ${WEAPONS[state.weapons.current].name}`);
  }

  function buyUpgrade(kind) {
    const def = GARAGE[kind];
    if (!def) return false;
    if (state.cash < def.price) { say(`Need $${def.price} for ${def.name}.`); return false; }
    if (kind === 'armor' && state.upgrades.armor) { say('Armor already fitted.'); return false; }
    if (kind === 'engine' && state.upgrades.engine) { say('Engine already tuned.'); return false; }
    if (kind === 'nos' && state.upgrades.nos) { say('NOS already fitted — use G to refill.'); return false; }
    state.cash -= def.price;
    if (kind === 'armor') { state.upgrades.armor = true; state.player.health = Math.min(PLAYER.health + GARAGE.armor.bonus, state.player.health + GARAGE.armor.bonus); }
    if (kind === 'engine') state.upgrades.engine = true;
    if (kind === 'nos') { state.upgrades.nos = true; state.upgrades.nosAmount = 100; }
    say(`Bought ${def.name} for $${def.price}.`);
    return true;
  }

  function buyAmmo(kind) {
    const def = WEAPONS[kind];
    if (!def || !state.weapons.owned[kind]) return false;
    if (state.cash < def.ammoPrice) { say(`Need $${def.ammoPrice} for ${def.name} ammo.`); return false; }
    state.cash -= def.ammoPrice;
    state.weapons.ammo[kind] = (state.weapons.ammo[kind] ?? 0) + 30;
    say(`Bought 30 ${def.name} rounds.`);
    return true;
  }

  function buyWeapon(kind) {
    const def = WEAPONS[kind];
    if (!def || kind === 'fists') return false;
    if (state.weapons.owned[kind]) return buyAmmo(kind);
    if (state.cash < def.price) { say(`Need $${def.price} for a ${def.name}.`); return false; }
    state.cash -= def.price;
    state.weapons.owned[kind] = true;
    state.weapons.ammo[kind] = 30;
    state.weapons.current = kind;
    say(`Bought a ${def.name} with 30 rounds.`);
    return true;
  }

  function step(dt, input) {
    if (state.busted || state.dead) return 0;
    let events = 0;
    state.time += dt;
    state.clockMinutes = (state.clockBase + state.time * CLOCK.minutesPerSecond) % 1440;
    state.district = districtAt(state.player.x, state.player.z);

    if (input.enter) {
      if (state.car) exitCar();
      else events |= enterCar();
    }
    if (state.car) events |= drive(dt, input);
    else walk(dt, input);

    if (input.shoot) events |= shoot();
    if (input.weaponSwitch) cycleWeapon();
    if (input.garageBuy) buyUpgrade(input.garageBuy);
    if (input.ammoBuy) buyWeapon(input.ammoBuy);

    stepTraffic(dt);
    stepPeds(dt);
    events |= stepPolice(dt);
    stepHeli(dt);
    stepRoadblocks(dt);
    events |= stepWanted(dt);

    if (state.player.health <= 0) {
      state.dead = true;
      say('Lucia is down. The city keeps moving.');
      events |= EVENT_DEAD;
    }
    return events;
  }

  /** Daylight factor 0 (night) to 1 (noon); dusk sits near 0.35. */
  function daylight() {
    const m = state.clockMinutes;
    if (m < 360 || m >= 1140) return 0;
    if (m < 480) return (m - 360) / 120;
    if (m < 1020) return 1;
    return 1 - (m - 1020) / 120;
  }

  reset();
  return {
    state, city, reset, step, earn, addWanted, buyUpgrade, buyAmmo, buyWeapon,
    random, wantedStars, daylight, setMarker(m) { state.marker = m; },
    setClock(hours, minutes) {
      const target = hours * 60 + minutes;
      state.clockBase = (((target - state.time * CLOCK.minutesPerSecond) % 1440) + 1440) % 1440;
      state.clockMinutes = target;
    },
    clearMarker() { state.marker = null; },
    routeTo(x, z) { return routeBetween(state.player.x, state.player.z, x, z); },
  };
}
