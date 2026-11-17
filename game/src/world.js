// Solano Heat — the world: everything alive in Port Solano, stepped 60 times a
// second. The game loop owns screens and drawing; this file owns the rules:
// driving, stealing, shooting, traffic, pedestrians, police, wanted level,
// missions, pickups, particles and the clock. It returns event flags so the
// loop can play sounds and announce without knowing the rules.
import {
  BEACH_X, CAR, CLOCK_RATE, CLOCK_START_MINUTES, PLAYER, STEP, VIEW_H, VIEW_W,
  WORLD_H, WORLD_W,
} from './config.js';
import { mulberry32 } from './random.js';
import { buildCity, isOnRoad, randomRoadPoint } from './city.js';
import {
  makeCar, makePed, makePoliceCar, makePoliceFoot, spawnPeds, spawnTraffic,
  stepPed, stepPoliceCar, stepPoliceFoot, stepTraffic,
} from './entities.js';
import {
  addWanted, damagePlayer, healPlayer, makePlayer, stepDriving, stepOnFoot,
  stepWanted, tryFire,
} from './player.js';
import {
  makeMissionState, objectiveText, startMission, startSideJob, updateMission,
  updateSideJob, missionTarget, showMessage, currentMission,
} from './missions.js';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_WANTED_UP = 8;
export const EVENT_MISSION = 16;
export const EVENT_DEATH = 32;
export const EVENT_CRASH = 64;
export const EVENT_EXPLOSION = 128;
export const EVENT_CASH = 256;

const POLICE_CAP = 6;

export function createGame(seed) {
  // Live state lives in these closure variables (the step function and its
  // helpers read them directly); the `game` object mirrors them so the
  // renderer and the screenshots can read the same state. reset() re-runs
  // init() so both stay in sync — never replace the game object itself.
  let rng = mulberry32(seed);
  let city = null;
  let player = null;
  let traffic = null;
  let peds = null;
  let missions = null;

  const game = {
    seed,
    policeCars: [],
    policeFoot: [],
    rivals: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    pickups: [],
    clockMinutes: CLOCK_START_MINUTES,
    elapsed: 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    best: 0,
    stats: { shotsFired: 0, hits: 0 },
    paused: false,
  };

  function init() {
    rng = mulberry32(seed);
    city = buildCity(rng);
    player = makePlayer(1250, 820);
    traffic = spawnTraffic(rng, city, player.x, player.y);
    peds = spawnPeds(rng, city, player.x, player.y);
    missions = makeMissionState();
    game.rng = rng;
    game.city = city;
    game.player = player;
    game.traffic = traffic;
    game.peds = peds;
    game.missions = missions;
    game.policeCars = [];
    game.policeFoot = [];
    game.rivals = [];
    game.bullets = [];
    game.enemyBullets = [];
    game.particles = [];
    game.clockMinutes = CLOCK_START_MINUTES;
    game.elapsed = 0;
    game.camera = { x: player.x - VIEW_W / 2, y: player.y - VIEW_H / 2 };
    game.shake = 0;
    game.stats = { shotsFired: 0, hits: 0 };
    game.pickups = [
      { kind: 'health', x: 3650, y: 880, taken: false },
      { kind: 'health', x: 1250, y: 700, taken: false },
      { kind: 'armor', x: 2850, y: 480, taken: false },
      { kind: 'ammo', x: 2650, y: 3350, taken: false },
      { kind: 'ammo', x: 900, y: 2920, taken: false },
      { kind: 'cash', x: 300, y: 1500, amount: 120, taken: false },
      { kind: 'cash', x: 300, y: 2400, amount: 150, taken: false },
    ];
  }

  init();

  function reset() {
    init();
    game.best = 0;
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = rng() * Math.PI * 2;
      const s = speed * (0.4 + rng() * 0.8);
      game.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + rng() * 0.5, maxLife: 0.9, color, size: 2 + rng() * 3,
      });
    }
  }

  function explodeCar(car) {
    car.dead = true;
    spawnParticles(car.x, car.y, '#ff9f1c', 26, 260);
    spawnParticles(car.x, car.y, '#e74c3c', 18, 180);
    spawnParticles(car.x, car.y, '#7f8c8d', 14, 90);
    game.shake = 14;
    return EVENT_EXPLOSION;
  }

  function nearestCar(x, y, maxDist) {
    let bestCar = null;
    let bestD = maxDist;
    for (const car of traffic) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; bestCar = car; }
    }
    for (const car of game.policeCars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; bestCar = car; }
    }
    return bestCar;
  }

  function enterCar() {
    const car = nearestCar(player.x, player.y, 70);
    if (!car) return 0;
    // Stealing a stranger's car is a crime; a parked car in the safehouse lot is not.
    const stolen = !car.parked;
    if (car.isPolice) return 0;
    const idx = traffic.indexOf(car);
    if (idx >= 0) traffic.splice(idx, 1);
    car.isPlayerCar = true;
    car.parked = false;
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    if (stolen) {
      player.carsStolen += 1;
      if (addWanted(player, 1)) return EVENT_WANTED_UP;
    }
    return 0;
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    player.inCar = null;
    car.isPlayerCar = false;
    car.parked = true;
    car.speed = 0;
    const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 34, y: car.y + Math.sin(car.angle + Math.PI / 2) * 34 };
    const fixed = city.collideCircle(side.x, side.y, PLAYER.radius);
    player.x = fixed.x;
    player.y = fixed.y;
    traffic.push(car);
  }

  function spawnRivals() {
    // The Salt Kings crew, waiting on the streets around their warehouse for
    // mission 4 — on the roads, never inside the building.
    const cx = 2160;
    const cy = 2430;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const px = cx + Math.cos(a) * 240;
      const py = cy + Math.sin(a) * 200;
      const spot = city.collideCircle(px, py, 12);
      game.rivals.push({
        x: spot.x,
        y: spot.y,
        angle: rng() * Math.PI * 2,
        health: 50,
        shootTimer: 0.5 + rng(),
        speed: 120,
        dead: false,
        color: '#8e44ad',
        name: 'Salt King',
      });
    }
  }

  function updatePolice(dt) {
    const wanted = player.wanted;
    const wantCars = Math.min(POLICE_CAP, wanted * 2);
    // Spawn police cars on roads, away from the player.
    while (game.policeCars.length < wantCars) {
      const p = randomRoadPoint(rng, player.x, player.y, 700);
      game.policeCars.push(makePoliceCar(rng, p.x, p.y));
    }
    while (game.policeCars.length > wantCars) game.policeCars.pop();
    let seen = false;
    for (const car of game.policeCars) {
      stepPoliceCar(car, dt, player, city);
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < 700) seen = true;
      // A police car ramming the player hurts on foot and wrecks the player's car.
      if (d < 40) {
        if (player.inCar) {
          player.inCar.health -= 14 * dt;
          if (player.inCar.health <= 0) explodeCar(player.inCar);
        } else {
          damagePlayer(player, 18 * dt);
        }
        game.shake = Math.max(game.shake, 4);
      }
    }
    // Foot officers at 3+ stars.
    const wantFoot = wanted >= 3 ? 2 : 0;
    while (game.policeFoot.length < wantFoot) {
      const p = randomRoadPoint(rng, player.x, player.y, 420);
      game.policeFoot.push(makePoliceFoot(rng, p.x, p.y));
    }
    while (game.policeFoot.length > wantFoot) game.policeFoot.pop();
    for (const cop of game.policeFoot) {
      if (stepPoliceFoot(cop, dt, player, city)) {
        const a = Math.atan2(player.y - cop.y, player.x - cop.x) + (rng() - 0.5) * 0.2;
        game.enemyBullets.push({
          x: cop.x, y: cop.y, angle: a, speed: 700, damage: 9,
          range: 420, travelled: 0, fromPlayer: false,
        });
      }
      if (Math.hypot(cop.x - player.x, cop.y - player.y) < 700) seen = true;
    }
    stepWanted(player, dt, seen);
  }

  function updateBullets(dt) {
    let events = 0;
    for (const b of game.bullets) {
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.travelled += b.speed * dt;
      if (b.travelled > b.range) { b.dead = true; continue; }
      if (city.hitsBuilding(b.x - 1, b.y - 1, 2, 2)) {
        spawnParticles(b.x, b.y, '#f1c40f', 3, 120);
        b.dead = true;
        continue;
      }
      // Hit a rival, a cop on foot, a pedestrian, or a car.
      let hit = false;
      for (const r of game.rivals) {
        if (!r.dead && Math.hypot(r.x - b.x, r.y - b.y) < 16) {
          r.health -= b.damage;
          spawnParticles(b.x, b.y, '#e74c3c', 5, 140);
          if (r.health <= 0) {
            r.dead = true;
            player.kills += 1;
            game.missions.eliminateCount += 1;
            game.pickups.push({ kind: 'cash', x: r.x, y: r.y, amount: 60, taken: false });
          }
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const cop of game.policeFoot) {
          if (!cop.dead && Math.hypot(cop.x - b.x, cop.y - b.y) < 15) {
            cop.health -= b.damage;
            spawnParticles(b.x, b.y, '#e74c3c', 5, 140);
            if (cop.health <= 0) { cop.dead = true; player.kills += 1; }
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const ped of peds) {
          if (!ped.dead && Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
            ped.dead = true;
            player.kills += 1;
            spawnParticles(b.x, b.y, '#e74c3c', 6, 140);
            if (addWanted(player, 1)) events |= EVENT_WANTED_UP;
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        const allCars = traffic.concat(game.policeCars);
        for (const car of allCars) {
          if (car.dead) continue;
          const dx = b.x - car.x;
          const dy = b.y - car.y;
          const localX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
          const localY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);
          if (Math.abs(localX) < CAR.length / 2 + 2 && Math.abs(localY) < CAR.width / 2 + 2) {
            car.health -= b.damage;
            car.smoke = 1;
            spawnParticles(b.x, b.y, '#f39c12', 4, 130);
            if (car.health <= 0) events |= explodeCar(car);
            hit = true;
            break;
          }
        }
      }
      if (hit) { b.dead = true; game.stats.hits += 1; }
    }
    game.bullets = game.bullets.filter((b) => !b.dead);
    for (const b of game.enemyBullets) {
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.travelled += b.speed * dt;
      if (b.travelled > b.range) { b.dead = true; continue; }
      if (city.hitsBuilding(b.x - 1, b.y - 1, 2, 2)) { b.dead = true; continue; }
      if (player.inCar) {
        const car = player.inCar;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const localX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
        const localY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);
        if (Math.abs(localX) < CAR.length / 2 && Math.abs(localY) < CAR.width / 2) {
          car.health -= b.damage;
          b.dead = true;
          if (car.health <= 0) events |= explodeCar(car);
        }
      } else if (Math.hypot(b.x - player.x, b.y - player.y) < PLAYER.radius + 2) {
        damagePlayer(player, b.damage);
        spawnParticles(b.x, b.y, '#e74c3c', 4, 120);
        b.dead = true;
        events |= EVENT_HIT;
      }
    }
    game.enemyBullets = game.enemyBullets.filter((b) => !b.dead);
    return events;
  }

  function updateRivals(dt) {
    for (const r of game.rivals) {
      if (r.dead) continue;
      const dx = player.x - r.x;
      const dy = player.y - r.y;
      const dist = Math.hypot(dx, dy) || 1;
      r.angle = Math.atan2(dy, dx);
      if (dist > 200) {
        const next = city.collideCircle(r.x + Math.cos(r.angle) * r.speed * dt, r.y + Math.sin(r.angle) * r.speed * dt, 10);
        r.x = next.x;
        r.y = next.y;
      }
      r.shootTimer -= dt;
      if (dist < 460 && r.shootTimer <= 0) {
        r.shootTimer = 1.1 + rng() * 0.8;
        const a = r.angle + (rng() - 0.5) * 0.25;
        game.enemyBullets.push({
          x: r.x, y: r.y, angle: a, speed: 680, damage: 8,
          range: 460, travelled: 0, fromPlayer: false,
        });
      }
    }
  }

  function updatePickups() {
    let events = 0;
    for (const p of game.pickups) {
      if (p.taken) continue;
      if (Math.hypot(p.x - player.x, p.y - player.y) < 34) {
        p.taken = true;
        if (p.kind === 'health') healPlayer(player, 50);
        else if (p.kind === 'armor') player.armor = Math.min(PLAYER.armor, player.armor + 50);
        else if (p.kind === 'ammo') {
          player.ammo.pistol += 60;
          player.ammo.smg += 120;
          player.ammo.shotgun += 16;
        } else if (p.kind === 'cash') {
          player.money += p.amount || 50;
          events |= EVENT_CASH;
        }
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  // One fixed step of live play. `input` is the keyboard/mouse (or a scripted
  // stand-in); `aim` is the mouse position in world coordinates.
  function step(dt, input, aim) {
    let events = 0;
    game.elapsed += dt;
    game.clockMinutes += CLOCK_RATE * dt;
    if (game.clockMinutes >= 24 * 60) game.clockMinutes -= 24 * 60;

    // Enter / exit cars.
    if (input.wasPressed && input.wasPressed('enterCar')) {
      if (player.inCar) exitCar();
      else events |= enterCar();
    }
    if (input.wasPressed && input.wasPressed('interact')) {
      // F: punch the nearest pedestrian or rival when on foot.
      if (!player.inCar) {
        const targets = game.rivals.concat(game.policeFoot, peds.filter((p) => !p.dead));
        for (const t of targets) {
          if (Math.hypot(t.x - player.x, t.y - player.y) < 40) {
            t.health = (t.health || 50) - PLAYER.punchDamage;
            if (t.health <= 0) { t.dead = true; player.kills += 1; }
            events |= EVENT_HIT;
            break;
          }
        }
      }
    }
    // Weapon switching.
    if (input.wasPressed) {
      const order = ['fists', 'pistol', 'smg', 'shotgun'];
      order.forEach((w, i) => {
        if (input.wasPressed(`weapon${i + 1}`)) player.weapon = w;
      });
    }
    if (input.wasPressed && input.wasPressed('mission')) {
      if (!missions.active && !missions.sideJob) {
        if (currentMission(missions)) startMission(missions, player);
        else startSideJob(missions, rng, player);
      } else if (!missions.active && missions.sideJob) {
        // M again cancels a side job.
        missions.sideJob = null;
        missions.sideTarget = null;
      }
    }

    // Move the player.
    const aimAngle = aim ? Math.atan2(aim.y - player.y, aim.x - player.x) : undefined;
    if (player.inCar) {
      const car = player.inCar;
      const speedBefore = Math.abs(car.speed);
      stepDriving(player, car, input, dt, city);
      if (Math.abs(car.speed) > 200 && speedBefore > 200 && car.health < CAR.health) events |= EVENT_CRASH;
      if (car.health <= 0 && !car.dead) {
        events |= explodeCar(car);
        player.inCar = null;
        damagePlayer(player, 25);
      }
      // Running over a pedestrian at speed is a crime.
      for (const ped of peds) {
        if (!ped.dead && Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 120) {
          ped.dead = true;
          player.kills += 1;
          spawnParticles(ped.x, ped.y, '#e74c3c', 8, 160);
          if (addWanted(player, 1)) events |= EVENT_WANTED_UP;
        }
      }
    } else {
      stepOnFoot(player, input, dt, city, aimAngle);
    }

    // Shooting (mouse aim; hold for auto weapons).
    const weaponAuto = player.weapon === 'smg';
    const firing = weaponAuto ? (input.held && input.held('shoot')) : (input.wasPressed && input.wasPressed('shoot'));
    if (firing && !player.inCar && aim) {
      const newBullets = tryFire(player, aimAngle, dt);
      if (newBullets.length > 0) {
        game.bullets.push(...newBullets);
        game.stats.shotsFired += newBullets.length;
        spawnParticles(player.x + Math.cos(aimAngle) * 26, player.y + Math.sin(aimAngle) * 26, '#f1c40f', 3, 100);
        events |= EVENT_SHOT;
      }
    } else if (player.fireTimer > 0) {
      player.fireTimer -= dt;
    }

    // Traffic, pedestrians, police, rivals, bullets, pickups.
    const allCars = traffic.concat(game.policeCars);
    for (const car of traffic) stepTraffic(car, dt, rng, city, allCars);
    for (const ped of peds) {
      const dangerNear = Math.hypot(ped.x - player.x, ped.y - player.y) < 160 && (events & EVENT_SHOT);
      if (dangerNear) ped.fleeing = 2.5;
      stepPed(ped, dt, rng, city, player);
    }
    // Keep the streets full: respawn traffic and pedestrians far from the player.
    if (traffic.filter((c) => !c.dead).length < 18) {
      const p = randomRoadPoint(rng, player.x, player.y, 800);
      traffic.push(makeCar(rng, p.x, p.y));
    }
    if (peds.filter((p) => !p.dead).length < 30) {
      const p = randomRoadPoint(rng, player.x, player.y, 700);
      peds.push(makePed(rng, p.x, p.y));
    }
    updatePolice(dt);
    updateRivals(dt);
    events |= updateBullets(dt);
    events |= updatePickups();

    // Missions.
    const mission = currentMission(missions);
    if (mission && missions.active && mission.id === 'm4' && missions.step === 1 && game.rivals.length === 0) {
      spawnRivals();
      showMessage(missions, 'The crew is here — take them out!', 4);
    }
    if (mission && missions.active && mission.id === 'm5' && missions.step === 2 && player.wanted === 0
      && Math.hypot(player.x - 1250, player.y - 750) > 130) {
      player.wanted = Math.max(player.wanted, 3);
    }
    const mResult = updateMission(missions, { player }, dt);
    if (mResult === 'complete') {
      const reward = mission.reward;
      player.money += reward;
      player.respect += 10;
      showMessage(missions, `${mission.title} complete! +$${reward}`, 5);
      events |= EVENT_MISSION;
      if (mission.id === 'm5') {
        // The vault cash drops at the bank for the player to grab.
        game.pickups.push({ kind: 'cash', x: 2450, y: 1150, amount: 500, taken: false });
      }
    } else if (mResult === 'step') {
      showMessage(missions, 'Objective updated', 3);
    }
    const sideJob = updateSideJob(missions, { player }, dt);
    if (sideJob) {
      player.money += sideJob.pay;
      player.respect += 2;
      showMessage(missions, `${sideJob.title} done! +$${sideJob.pay}`, 4);
      events |= EVENT_MISSION;
    }

    // Health regen when calm, armour stays bought.
    if (player.wanted === 0 && !player.dead && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 2.5 * dt);
    }

    // Particles.
    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    game.particles = game.particles.filter((p) => p.life > 0);

    // Car smoke.
    for (const car of allCars) {
      if (car.smoke > 0 && !car.dead) {
        car.smoke -= dt * 0.2;
        if (rng() < 0.3) {
          game.particles.push({
            x: car.x, y: car.y - 8, vx: (rng() - 0.5) * 20, vy: -40 - rng() * 30,
            life: 0.7, maxLife: 0.7, color: '#7f8c8d', size: 4,
          });
        }
      }
    }

    // Camera follows the player, clamped to the world.
    const tx = player.x - VIEW_W / 2;
    const ty = player.y - VIEW_H / 2;
    game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 6);
    game.camera.y += (ty - game.camera.y) * Math.min(1, dt * 6);
    game.camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, game.camera.x));
    game.camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, game.camera.y));
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 30);

    if (player.dead) {
      player.deathTimer += dt;
      events |= EVENT_DEATH;
    }
    return events;
  }

  // The score the title screen shows: respect + money earned, in one number.
  function score() {
    return player.respect * 100 + Math.floor(player.money / 10) + player.kills * 25;
  }

  game.reset = reset;
  game.step = step;
  game.score = score;
  game.objectiveText = () => objectiveText(missions);
  game.missionTarget = () => missionTarget(missions);
  return game;
}

export { isOnRoad, BEACH_X };
