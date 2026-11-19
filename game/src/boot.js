// Solano Heat, main loop: the file that ties the city, the cars, the law,
// the story and the HUD into one game. Title screen, driving, walking,
// missions, shops, garage, wanted, busted, done. The loop runs on a fixed
// 60 Hz step with a clamp, so a slow frame never teleports the player.

import { buildCity, districtAt, nearestIntersection, intersection } from './city.js';
import { makeRng, pick } from './rng.js';
import { makeCar, stepCar, stepTraffic, makeTraffic, separate } from './vehicles.js';
import { makeWalker, stepWalker, nearestCar, punchHits } from './walker.js';
import { makePolice, setWanted, stepPolice, policeBusted } from './police.js';
import { makeMissions, startMission, stepMission, nextMissionId, startSideJob, stepSideJob, storyDone } from './missions.js';
import { makeEconomy, addReward, buyGarage, buyShop, rankName, garageSummary, persist, loadSave } from './economy.js';
import { makeAudio, ensureAudio, setEngine, setSiren, stepRadio, cycleStation, sfx } from './audio.js';
import { makeEffects, spawnParticles, spawnExplosion, stepEffects, addShake, floatText, hitStop, consumeFreeze } from './effects.js';
import { makeRenderer, makeWorld, makeCarMesh, makeWalkerMesh, makeHeliMesh, makeSpotMesh, updateWorld } from './render.js';
import { makeHud, updateHud, toast, renderMenu } from './hud.js';
import { makeInput, attachInput, driveInput, walkInput, wasPressed, flushPressed, endFrame } from './input.js';
import { makeDemo, demoDrive, demoMenu } from './demo.js';
import { MISSIONS, SIDE_JOBS, missionById, starsAfter, garageTopSpeed, garageArmor, SHOP_ITEMS } from './sim.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') || 7);
const QUALITY = params.get('quality') || 'high';
const AUTO = params.get('auto') === '1';
const START_MISSION = Number(params.get('mission') || 0);

const city = buildCity(SEED);
const rng = makeRng(SEED * 13 + 5);
const trafficCount = QUALITY === 'low' ? 10 : 18;

const game = {
  city,
  state: 'title',
  night: false,
  onFoot: false,
  day: 1,
  district: 'Aldergate',
  radioName: 'SOL 98.5 — Synthwave',
  missionTimer: 0,
  missionTarget: null,
  menuMissions: MISSIONS,
  menuIndex: 0,
  menuOpen: false,
  completed: [],
  fireCooldown: 0,
  weapon: 'pistol',
  paused: false,
};

const economy = makeEconomy(loadSave());
const missions = makeMissions();
missions.completed = [...economy.completed];
missions.day = economy.day;
game.day = economy.day;
game.completed = missions.completed;

const player = makeCar(city.start.x, city.start.z, city.start.heading, {
  color: 0xd8b13a,
  topSpeed: garageTopSpeed(economy.garage.engine),
});
player.nos = 5;
const walker = makeWalker(city.start.x + 4, city.start.z, 0);
const traffic = makeTraffic(city, rng, trafficCount);
const police = makePolice();
const effects = makeEffects();
const audio = makeAudio();
const hud = makeHud();
const input = attachInput(makeInput());
const demo = makeDemo();
demo.active = AUTO;

game.player = player;
game.walker = walker;
game.traffic = traffic;
game.police = police;
game.effects = effects;
game.economy = economy;
game.rank = rankName(economy);

// Renderer and meshes.
const canvas = document.getElementById('game');
const renderer = makeRenderer(canvas, QUALITY);
const world = makeWorld(city, QUALITY);
const playerMesh = makeCarMesh(0xd8b13a);
world.scene.add(playerMesh);
game.playerMesh = playerMesh;
const walkerMesh = makeWalkerMesh();
walkerMesh.visible = false;
world.scene.add(walkerMesh);
game.walkerMesh = walkerMesh;
game.trafficMeshes = traffic.map((car) => {
  const mesh = makeCarMesh(car.color);
  world.scene.add(mesh);
  return mesh;
});
game.policeMeshes = Array.from({ length: 10 }, () => {
  const mesh = makeCarMesh(0x1c2a44);
  mesh.visible = false;
  world.scene.add(mesh);
  return mesh;
});
const heliMesh = makeHeliMesh();
heliMesh.visible = false;
world.scene.add(heliMesh);
game.heliMesh = heliMesh;
const spotMesh = makeSpotMesh();
world.scene.add(spotMesh);
game.spotMesh = spotMesh;
game.roadblockMeshes = [0, 1, 2].map(() => {
  const mesh = makeCarMesh(0x1c2a44);
  mesh.visible = false;
  world.scene.add(mesh);
  return mesh;
});
window.__game = game;
window.__ready = true;

function currentBody() {
  return game.onFoot ? walker : player;
}

function startPlaying(missionId) {
  game.state = 'play';
  document.getElementById('title').classList.add('hidden');
  const id = missionId || nextMissionId(missions) || 1;
  if (!missions.current) {
    startMission(missions, id, player);
    applyMissionHeat();
  }
  toast(`DAY ${missions.day} — ${missionById(id).name}`);
}

function applyMissionHeat() {
  if (!missions.current) return;
  setWanted(police, missions.current.wanted);
  game.night = missions.current.kind === 'stealth';
  game.missionTarget = missions.current.target;
}

function pickNextMission() {
  const id = nextMissionId(missions);
  if (!id) return;
  startMission(missions, id, player);
  applyMissionHeat();
}
game.pickNextMission = pickNextMission;

function completeMission(result) {
  addReward(economy, result.reward);
  player.nos = Math.min(8, player.nos + 3);
  missions.completed = [...missions.completed];
  economy.completed = [...missions.completed];
  economy.mission = nextMissionId(missions) || 13;
  economy.day = missions.day;
  persist(economy);
  game.rank = rankName(economy);
  floatText(effects, `+$${result.reward.cash}`, 'cash');
  floatText(effects, `+${result.reward.respect} RESPECT`, 'respect');
  sfx(audio, 'complete');
  toast(`${result.mission.name} COMPLETE — $${result.reward.cash} · ${result.reward.respect} respect`);
  if (storyDone(missions)) {
    game.state = 'done';
    document.getElementById('done').classList.remove('hidden');
  }
}

function failMission(result) {
  sfx(audio, 'fail');
  toast(`${result.mission.name} FAILED — ${result.reason}`);
}

function bustPlayer() {
  const fine = Math.min(200, Math.floor(economy.cash * 0.1));
  economy.cash -= fine;
  setWanted(police, 0);
  const safe = city.safehouses[0];
  player.x = safe.x;
  player.z = safe.z;
  player.speed = 0;
  player.heading = 0;
  sfx(audio, 'busted');
  toast(`BUSTED — $${fine} fine. Rook walked out of the precinct.`);
  persist(economy);
}

function enterCar(car) {
  game.onFoot = false;
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.speed = 0;
  player.color = car.color;
  playerMesh.children[0].material.color.setHex(car.color);
  if (car.isTraffic) {
    setWanted(police, starsAfter('steal', police.stars));
    toast('Carjacked. The owner called it in.');
  }
}

function exitCar() {
  if (Math.abs(player.speed) > 3) return;
  game.onFoot = true;
  walker.x = player.x + Math.sin(player.heading + Math.PI / 2) * 3;
  walker.z = player.z + Math.cos(player.heading + Math.PI / 2) * 3;
  walker.heading = player.heading;
}

function fireWeapon() {
  if (game.fireCooldown > 0 || economy.ammo <= 0) return;
  game.fireCooldown = 0.35;
  economy.ammo -= 1;
  sfx(audio, 'shot');
  spawnParticles(effects, player.x, 1.2, player.z, 4, 0xffd24d, 12);
  const from = currentBody();
  let best = null;
  let bestDist = 34;
  for (const car of police.cars) {
    const d = Math.hypot(car.x - from.x, car.z - from.z);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  if (best) {
    best.damage += SHOP_ITEMS[game.weapon].damage;
    spawnParticles(effects, best.x, 1.2, best.z, 8, 0xff6a3d, 10);
    if (best.damage > 100) {
      best.damage = 0;
      best.speed = 0;
      police.cars = police.cars.filter((c) => c !== best);
      toast('Cruiser disabled.');
    }
  }
  setWanted(police, starsAfter('shoot', police.stars));
}

function nearShop() {
  for (const s of city.shops) {
    if (Math.hypot(s.x - player.x, s.z - player.z) < 10) return s;
  }
  return null;
}

function nearSafehouse() {
  for (const s of city.safehouses) {
    if (Math.hypot(s.x - player.x, s.z - player.z) < 10) return s;
  }
  return null;
}

function nearGarage() {
  return Math.hypot(city.garage.x - player.x, city.garage.z - player.z) < 10;
}

function openShop(shop) {
  game.state = 'shop';
  game.shop = shop;
  const panel = document.getElementById('shop');
  panel.innerHTML = `<h2>${shop.name}</h2>` + Object.entries(SHOP_ITEMS).map(([key, item], i) =>
    `<div>[${i + 1}] ${item.name} — $${item.price}</div>`).join('') + '<div>[Esc] Leave</div>';
  panel.classList.remove('hidden');
}

function openGarage() {
  game.state = 'garage';
  const panel = document.getElementById('shop');
  panel.innerHTML = '<h2>Aldergate Garage</h2>' + garageSummary(economy).map((g, i) =>
    `<div>[${i + 1}] ${g.name} Lv${g.level} — $${g.price}</div>`).join('') + '<div>[Esc] Leave</div>';
  panel.classList.remove('hidden');
}

function closePanels() {
  document.getElementById('shop').classList.add('hidden');
  game.state = 'play';
}

function stepGame(dt) {
  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  const body = currentBody();
  game.district = districtAt(body.x, body.z).name;
  game.day = missions.day;

  // Menu navigation.
  if (game.menuOpen) {
    if (wasPressed(input, 'ArrowDown') || wasPressed(input, 'KeyS')) {
      game.menuIndex = Math.min(game.menuMissions.length - 1, game.menuIndex + 1);
    }
    if (wasPressed(input, 'ArrowUp') || wasPressed(input, 'KeyW')) {
      game.menuIndex = Math.max(0, game.menuIndex - 1);
    }
    if (wasPressed(input, 'Enter') || wasPressed(input, 'NumpadEnter')) {
      const m = game.menuMissions[game.menuIndex];
      game.menuOpen = false;
      startMission(missions, m.id, player);
      applyMissionHeat();
      toast(`DAY ${m.day} — ${m.name}`);
    }
    if (wasPressed(input, 'KeyM') || wasPressed(input, 'Escape')) game.menuOpen = false;
    renderMenu(hud, game);
  } else if (wasPressed(input, 'KeyM')) {
    game.menuOpen = true;
    game.menuIndex = Math.max(0, MISSIONS.findIndex((m) => m.id === nextMissionId(missions)));
    flushPressed(input);
    renderMenu(hud, game);
  }

  // Enter / exit the car.
  if (wasPressed(input, 'KeyE')) {
    if (game.onFoot) {
      const car = nearestCar(walker, [...traffic, ...police.cars]);
      if (car) {
        if (car.isPolice) toast('That one has a radio. Pick another.');
        else {
          car.isTraffic = true;
          const idx = traffic.indexOf(car);
          if (idx >= 0) {
            const mesh = game.trafficMeshes[idx];
            if (mesh) world.scene.remove(mesh);
            game.trafficMeshes.splice(idx, 1);
            traffic.splice(idx, 1);
          }
          enterCar(car);
        }
      } else if (nearShop()) openShop(nearShop());
      else if (nearGarage()) openGarage();
      else if (nearSafehouse()) {
        persist(economy);
        walker.health = 100;
        toast('Safehouse — progress saved, Rook rested.');
      }
    } else {
      exitCar();
    }
  }
  if (wasPressed(input, 'KeyG') && !game.onFoot && nearGarage()) openGarage();

  // Weapons.
  if (wasPressed(input, 'Digit1')) game.weapon = 'pistol';
  if (wasPressed(input, 'Digit2')) game.weapon = 'smg';
  if (wasPressed(input, 'Digit3')) game.weapon = 'shotgun';
  if (wasPressed(input, 'KeyF') && game.onFoot) {
    walker.punch = 0.3;
    for (const t of punchHits(walker, police.cars)) {
      t.damage += 20;
      spawnParticles(effects, t.x, 1, t.z, 5, 0xffd24d, 8);
    }
  }
  if ((input.mousePressed || input.keys.KeyJ) && !game.onFoot) fireWeapon();
  if (wasPressed(input, 'KeyR')) game.radioName = cycleStation(audio);
  if (wasPressed(input, 'KeyT')) {
    const job = pick(rng, SIDE_JOBS);
    if (startSideJob(missions, job.id, player)) toast(`SIDE JOB — ${job.name}: ${job.brief}`);
  }

  // Driving or walking.
  let drive = demo.active ? demoDrive(demo, game, dt) : null;
  if (!drive) drive = driveInput(input);
  if (game.onFoot) {
    stepWalker(walker, walkInput(input), dt, city);
  } else {
    const top = garageTopSpeed(economy.garage.engine);
    player.topSpeed = top;
    const nosOn = drive.nos && player.nos > 0;
    stepCar(player, { ...drive, nos: nosOn }, dt, city);
    if (nosOn) spawnParticles(effects, player.x, 0.6, player.z, 2, 0x4dd0ff, 6);
    if (player.damage > 100) {
      spawnParticles(effects, player.x, 1.5, player.z, 3, 0x333333, 4);
      player.speed *= 0.97;
    }
  }
  setEngine(audio, game.onFoot ? 0 : player.speed, drive.nos);
  setSiren(audio, police.stars >= 2);
  stepRadio(audio, dt);

  // Traffic, police, collisions.
  for (const car of traffic) stepTraffic(car, dt, city);
  for (const car of traffic) {
    if (separate(car, player)) {
      player.speed *= 0.8;
      addShake(effects, 0.3);
      hitStop(effects, 0.04);
      sfx(audio, 'crash');
    }
  }
  stepPolice(police, player, dt, city, rng);
  for (const car of police.cars) {
    if (separate(car, player)) {
      addShake(effects, 0.5);
      hitStop(effects, 0.06);
      sfx(audio, 'crash');
      spawnParticles(effects, player.x, 1, player.z, 6, 0xffd24d, 9);
    }
  }
  for (const block of police.roadblocks) {
    const d = Math.hypot(block.x - player.x, block.z - player.z);
    if (d < 4.5 && Math.abs(player.speed) > 8) {
      player.speed *= 0.4;
      addShake(effects, 0.8);
      hitStop(effects, 0.08);
      sfx(audio, 'crash');
      spawnExplosion(effects, block.x, 1.2, block.z);
    }
  }
  if (policeBusted(police)) bustPlayer();

  // Missions and side jobs.
  game.mission = missions.current;
  game.missionTimer = missions.timer;
  if (missions.current) {
    const result = stepMission(missions, player, dt, police);
    if (result) {
      if (result.outcome === 'complete') completeMission(result);
      else failMission(result);
      game.missionTarget = missions.current ? missions.current.target : null;
    }
  }
  if (missions.side) {
    const side = stepSideJob(missions, player, dt);
    if (side && side.outcome === 'complete') {
      addReward(economy, side.reward);
      floatText(effects, `+$${side.reward.cash}`, 'cash');
      toast(`SIDE JOB DONE — ${side.job.name} +$${side.reward.cash}`);
    }
  }
  if (demo.active) demoMenu(demo, game);

  stepEffects(effects, dt);
  updateWorld(world, game, dt);
  updateHud(hud, game);
}

function loop(t) {
  requestAnimationFrame(loop);
  const now = t / 1000;
  const dt = Math.min(0.05, now - (loop.last || now));
  loop.last = now;
  const frozen = consumeFreeze(effects, dt);
  if (game.state === 'title') {
    if (wasPressed(input, 'Enter') || wasPressed(input, 'NumpadEnter')) {
      ensureAudio(audio);
      startPlaying(START_MISSION || undefined);
    }
    updateWorld(world, game, dt);
    updateHud(hud, game);
  } else if (game.state === 'play' && !game.menuOpen) {
    if (frozen > 0) stepGame(frozen);
    else stepGame(dt);
  } else if (game.menuOpen) {
    stepGame(0);
  } else if (game.state === 'shop' || game.state === 'garage') {
    if (wasPressed(input, 'Escape')) closePanels();
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (let i = 0; i < 4; i += 1) {
      if (!wasPressed(input, keys[i])) continue;
      if (game.state === 'shop') {
        const item = Object.keys(SHOP_ITEMS)[i];
        if (!item) break;
        const res = buyShop(economy, item);
        toast(res.ok ? `Bought ${SHOP_ITEMS[item].name}.` : res.reason);
      } else {
        const part = Object.keys({ engine: 1, armor: 1, nos: 1, paint: 1 })[i];
        if (!part) break;
        const res = buyGarage(economy, part);
        toast(res.ok ? `${part} upgraded.` : res.reason);
      }
    }
  } else if (game.state === 'done') {
    updateWorld(world, game, dt);
  }
  renderer.render(world.scene, world.camera);
  endFrame(input);
}

window.addEventListener('resize', () => {
  world.camera.aspect = window.innerWidth / window.innerHeight;
  world.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(loop);
