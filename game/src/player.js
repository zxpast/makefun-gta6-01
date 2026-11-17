// Solano Heat — the player: Lucia Vega, ex-mechanic turned wheelwoman. One job:
// her body on foot and behind the wheel, her health and armour, her weapons,
// and the wanted level the city answers with. Missions and rendering read her;
// they never move her.
import {
  CAR, PLAYER, WANTED_DECAY_SECONDS, WANTED_MAX, WEAPONS,
} from './config.js';

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export function makePlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2, // facing up the street
    vx: 0, vy: 0,
    health: PLAYER.health,
    armor: PLAYER.armor,
    money: 250,
    respect: 0,
    inCar: null, // the car object she is driving, or null
    weapon: 'pistol',
    ammo: { fists: Infinity, pistol: 120, smg: 240, shotgun: 40 },
    fireTimer: 0,
    reloadTimer: 0,
    hurtTimer: 0,
    wanted: 0,
    wantedTimer: 0,
    hiddenTimer: 0,
    dead: false,
    deathTimer: 0,
    kills: 0,
    carsStolen: 0,
    distanceDriven: 0,
  };
}

// --- On foot: WASD moves, Shift sprints, mouse aims, click fires.
export function stepOnFoot(player, input, dt, city, aimAngle) {
  let ax = 0;
  let ay = 0;
  if (input.held('up')) ay -= 1;
  if (input.held('down')) ay += 1;
  if (input.held('left')) ax -= 1;
  if (input.held('right')) ax += 1;
  const len = Math.hypot(ax, ay);
  if (len > 0) { ax /= len; ay /= len; }
  const speed = input.held('sprint') ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const nx = player.x + ax * speed * dt;
  const ny = player.y + ay * speed * dt;
  const fixed = city.collideCircle(nx, ny, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
  player.vx = ax * speed;
  player.vy = ay * speed;
  if (len > 0) player.angle = Math.atan2(ay, ax);
  else if (aimAngle !== undefined) player.angle = aimAngle;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
}

// --- Driving: arcade bicycle-ish model — accelerate, steer by speed, drift a little.
export function stepDriving(player, car, input, dt, city) {
  const forward = input.held('up') ? 1 : 0;
  const back = input.held('down') ? 1 : 0;
  const steer = (input.held('left') ? -1 : 0) + (input.held('right') ? 1 : 0);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const speedAlong = car.speed;
  let accel = 0;
  if (forward) accel = CAR.accel;
  else if (back) accel = speedAlong > 20 ? -CAR.brake : -CAR.reverseAccel;
  else accel = speedAlong > 0 ? -140 : speedAlong < 0 ? 140 : 0;
  car.speed += accel * dt;
  if (car.speed > CAR.maxSpeed) car.speed = CAR.maxSpeed;
  if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
  if (!forward && !back && Math.abs(car.speed) < 8) car.speed = 0;
  const steerAmount = steer * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 120) * (car.speed < 0 ? -1 : 1);
  car.angle += steerAmount;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Buildings stop the car hard; the sea stops it too (collideCircle clamps).
  const beforeX = car.x;
  const beforeY = car.y;
  const fixed = city.collideCircle(nx, ny, CAR.width / 2);
  car.x = fixed.x;
  car.y = fixed.y;
  const moved = Math.hypot(car.x - beforeX, car.y - beforeY);
  const wanted = Math.hypot(nx - beforeX, ny - beforeY);
  if (wanted > 1 && moved < wanted * 0.4) {
    // Slammed into something solid: lose speed, take a little damage.
    if (Math.abs(car.speed) > 180) {
      car.health -= Math.abs(car.speed) * 0.06;
      car.smoke = 1;
    }
    car.speed *= 0.25;
  }
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.distanceDriven += Math.abs(car.speed) * dt;
  void fx;
  void fy;
}

// --- Combat: fire the current weapon toward `angle`; returns bullet specs.
export function tryFire(player, angle, dt) {
  player.fireTimer -= dt;
  if (player.fireTimer > 0 || player.reloadTimer > 0) return [];
  const weapon = WEAPONS[player.weapon];
  if (!weapon) return [];
  if (player.weapon !== 'fists' && player.ammo[player.weapon] <= 0) {
    player.reloadTimer = 0.9; // auto-reload pause; ammo pickups refill
    return [];
  }
  const pellets = weapon.pellets || 1;
  const bullets = [];
  for (let i = 0; i < pellets; i += 1) {
    const spread = weapon.spread ? (Math.random() - 0.5) * weapon.spread * 2 : 0;
    bullets.push({
      x: player.x + Math.cos(angle) * 22,
      y: player.y + Math.sin(angle) * 22,
      angle: angle + spread,
      speed: 900,
      damage: weapon.damage,
      range: weapon.range,
      travelled: 0,
      fromPlayer: true,
    });
  }
  if (player.weapon !== 'fists') player.ammo[player.weapon] -= 1;
  player.fireTimer = weapon.rate;
  return bullets;
}

export function damagePlayer(player, amount) {
  if (player.dead) return;
  player.hurtTimer = 0.5;
  let rest = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, rest * 0.6);
    player.armor -= absorbed;
    rest -= absorbed;
  }
  player.health -= rest;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
    player.deathTimer = 0;
  }
}

export function healPlayer(player, amount) {
  player.health = Math.min(PLAYER.health, player.health + amount);
}

export function addWanted(player, stars) {
  const before = player.wanted;
  player.wanted = Math.min(WANTED_MAX, player.wanted + stars);
  player.wantedTimer = 0;
  player.hiddenTimer = 0;
  return player.wanted > before;
}

export function stepWanted(player, dt, seenByPolice) {
  if (player.wanted === 0) return;
  if (seenByPolice) {
    player.hiddenTimer = 0;
    player.wantedTimer = 0;
  } else {
    player.hiddenTimer += dt;
    if (player.hiddenTimer >= WANTED_DECAY_SECONDS) {
      player.hiddenTimer = 0;
      player.wanted -= 1;
    }
  }
}

export function weaponName(player) {
  return WEAPONS[player.weapon].name;
}
