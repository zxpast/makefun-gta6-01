// Solano Heat — Node tests for the rules. No browser, no DOM: the sim,
// the missions and the autopilot run in plain Node, so every check below
// is a check of the game itself. Run it with `node test/sim-test.mjs`;
// it exits non-zero when a check fails.
//
//   node test/sim-test.mjs

import { createSim, EVENT_BUSTED, EVENT_CRASH, EVENT_HIT_PED, EVENT_HELI, EVENT_RAMMED, EVENT_ROADBLOCK, EVENT_SHOT, EVENT_STOLEN, EVENT_WANTED_DOWN } from '../game/src/sim.js';
import { createMissions, CHAPTERS, SIDE_JOBS } from '../game/src/missions.js';
import { createAutopilot } from '../game/src/autopilot.js';
import { stageShot } from '../game/src/shots.js';
import { deserialize, serialize } from '../game/src/save.js';
import { STEP } from '../game/src/config.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL: ${name}`);
  }
}

/** A full input with overrides; anything left out is off. */
function input(over = {}) {
  return { throttle: 0, steer: 0, brake: 0, run: false, enter: false, punch: false, shoot: false, nextWeapon: false, nos: false, ...over };
}

function fresh() {
  const sim = createSim(7);
  const missions = createMissions(sim);
  const pilot = createAutopilot(sim, missions);
  return { sim, missions, pilot };
}

function steps(sim, n, inp) {
  let events = 0;
  for (let i = 0; i < n; i += 1) events |= sim.step(STEP, inp);
  return events;
}

/** Teleport the player next to the nearest parked car and steal it. */
function stealCar(sim) {
  const car = sim.state.parkedCars.find((c) => c.parked);
  sim.state.player.x = car.x;
  sim.state.player.z = car.z;
  sim.state.player.angle = car.angle;
  const events = sim.step(STEP, input({ enter: true }));
  return { events, car };
}

// --- A. Creation and determinism -----------------------------------------

{
  const { sim } = fresh();
  check('A1 cash starts at $200', sim.state.cash === 200);
  check('A2 wanted starts at 0', sim.state.wanted === 0);
  check('A3 player starts on foot', sim.state.player.onFoot === true && sim.state.player.car === -1);
  check('A4 city has 12 avenues and 8 streets', sim.city.avenues.length === 12 && sim.city.streets.length === 8);
  check('A5 26 parked cars', sim.state.parkedCars.length === 26);
  check('A6 16 traffic cars and 28 pedestrians', sim.state.traffic.length === 16 && sim.state.peds.length === 28);
  check('A7 buildings fill the blocks', sim.city.buildings.length > 50);
  check('A8 clock starts at 15:20', sim.state.clockMinutes === 15 * 60 + 20);
  check('A9 district at spawn is Marina', sim.district() === 'Marina');
}

{
  const a = createSim(7);
  const b = createSim(7);
  steps(a, 300, input({ throttle: 1, steer: 0.2 }));
  steps(b, 300, input({ throttle: 1, steer: 0.2 }));
  check('A10 same seed, same play', a.state.player.x === b.state.player.x && a.state.player.z === b.state.player.z && a.state.clockMinutes === b.state.clockMinutes);
  const c = createSim(8);
  check('A11 another seed plays differently', c.state.traffic[0].x !== a.state.traffic[0].x);
}

{
  const { sim } = fresh();
  const before = sim.state.clockMinutes;
  steps(sim, 60, input());
  check('A12 the clock advances', sim.state.clockMinutes > before);
  sim.state.clockMinutes = 12 * 60;
  check('A13 noon is bright', sim.daylight() > 0.7);
  sim.state.clockMinutes = 22 * 60;
  check('A14 night is dark', sim.daylight() < 0.2);
  sim.state.clockMinutes = 18 * 60 + 40;
  check('A15 dusk is in between', sim.daylight() > 0.4 && sim.daylight() < 0.7);
  sim.state.player.x = 200;
  sim.state.player.z = 120;
  check('A16 North Hills by position', sim.district() === 'North Hills');
  sim.state.player.x = 900;
  sim.state.player.z = 500;
  check('A17 The Docks by position', sim.district() === 'The Docks');
}

// --- B. Stealing and driving ----------------------------------------------

{
  const { sim } = fresh();
  const { events } = stealCar(sim);
  check('B1 stealing takes the car', sim.state.player.onFoot === false && sim.state.player.car >= 0);
  check('B2 stealing raises the heat', sim.state.wanted === 1 && (events & EVENT_STOLEN) !== 0);
  const x0 = sim.state.player.x;
  const z0 = sim.state.player.z;
  steps(sim, 60, input({ throttle: 1 }));
  check('B3 the car moves under throttle', Math.hypot(sim.state.player.x - x0, sim.state.player.z - z0) > 5);
  check('B4 the car builds speed', sim.state.player.speed > 5);
  const speedBefore = sim.state.player.speed;
  steps(sim, 60, input({ brake: 1 }));
  check('B5 the brake slows the car', sim.state.player.speed < speedBefore);
  steps(sim, 60, input({ brake: 1 }));
  check('B6 the brake reverses from a stop', sim.state.player.speed < 0 || sim.state.parkedCars[sim.state.player.car].speed < 0);
}

{
  // Driving into a building hurts the car.
  const { sim } = fresh();
  stealCar(sim);
  const b = sim.city.buildings[0];
  const car = sim.state.parkedCars[sim.state.player.car];
  car.x = (b.x0 + b.x1) / 2;
  car.z = b.z0 - 3;
  car.angle = 0;
  car.speed = 0;
  sim.state.player.x = car.x;
  sim.state.player.z = car.z;
  sim.state.player.angle = 0;
  const healthBefore = car.health;
  steps(sim, 90, input({ throttle: 1 }));
  check('B7 a building stops the car', car.health < healthBefore);
}

// --- C. Pedestrians and weapons -------------------------------------------

{
  const { sim } = fresh();
  const ped = sim.state.peds[0];
  ped.x = sim.state.player.x + 1.5;
  ped.z = sim.state.player.z;
  ped.tx = ped.x;
  ped.tz = ped.z;
  const events = sim.step(STEP, input({ punch: true }));
  check('C1 a punch lands', (events & EVENT_HIT_PED) !== 0 && ped.health < 30);
}

{
  const { sim } = fresh();
  stealCar(sim);
  const car = sim.state.parkedCars[sim.state.player.car];
  const ped = sim.state.peds[0];
  ped.x = car.x + Math.sin(car.angle) * 2.5;
  ped.z = car.z + Math.cos(car.angle) * 2.5;
  ped.tx = ped.x + Math.sin(car.angle) * 100;
  ped.tz = ped.z + Math.cos(car.angle) * 100;
  ped.angle = car.angle;
  car.speed = 10;
  let hit = 0;
  for (let i = 0; i < 90 && !(hit & EVENT_HIT_PED); i += 1) hit |= sim.step(STEP, input({ throttle: 1 }));
  check('C2 the car can hit a pedestrian', (hit & EVENT_HIT_PED) !== 0 && ped.down > 0);
}

{
  const { sim } = fresh();
  // Fists are a weapon too: a close-range shot lands and hurts.
  const ped = sim.state.peds[0];
  const p0 = sim.state.player;
  ped.x = p0.x + Math.sin(p0.angle) * 1.5;
  ped.z = p0.z + Math.cos(p0.angle) * 1.5;
  const events = sim.step(STEP, input({ shoot: true }));
  check('C3 fists shoot at close range', (events & EVENT_SHOT) !== 0 && ped.health < 30);
  sim.state.cash = 2000;
  check('C4 the pistol is for sale', sim.buy('weapon', 1) === true);
  check('C5 the pistol comes loaded', sim.state.player.owned[1] === true && sim.state.player.ammo[1] === 24);
  sim.state.wanted = 1;
  sim.step(STEP, input());
  const cop = sim.state.police[0];
  const p = sim.state.player;
  cop.x = p.x + Math.sin(p.angle) * 10;
  cop.z = p.z + Math.cos(p.angle) * 10;
  sim.state.wanted = 0;
  // Let the fists' cooldown from C3 run out, pick the pistol, and clear
  // the shot-heat window so the wanted check is a real one.
  steps(sim, 30, input());
  sim.step(STEP, input({ nextWeapon: true }));
  sim.state.shotHeatTimer = 0;
  const shot = sim.step(STEP, input({ shoot: true }));
  check('C6 the pistol fires', (shot & EVENT_SHOT) !== 0 && sim.state.player.ammo[1] === 23);
  check('C7 the first shot raises the heat', sim.state.wanted === 1);
  sim.buy('weapon', 2);
  sim.step(STEP, input({ nextWeapon: true }));
  check('C8 Q switches to the SMG', sim.state.player.weapon === 2);
  sim.step(STEP, input({ nextWeapon: true }));
  check('C9 Q cycles back to fists', sim.state.player.weapon === 0);
}

// --- D. The garage ----------------------------------------------------------

{
  const { sim } = fresh();
  sim.state.cash = 5000;
  check('D1 armor is for sale', sim.buy('armor') === true);
  check('D2 armor raises max health', sim.state.player.maxHealth === 160 && sim.state.cash === 4200);
  check('D3 armor cannot be bought twice', sim.buy('armor') === false);
  check('D4 the engine tune is for sale', sim.buy('engine') === true && sim.state.garage.engine === true);
  check('D5 the NOS kit is for sale', sim.buy('nos') === true && sim.state.garage.nosLeft === 3);
  stealCar(sim);
  const before = sim.state.garage.nosLeft;
  steps(sim, 60, input({ throttle: 1 }));
  sim.step(STEP, input({ throttle: 1, nos: true }));
  check('D6 NOS burns a charge', sim.state.garage.nosLeft === before - 1 && sim.state.player.nosTime > 0);
  check('D7 the NOS refill works', sim.buy('nosRefill') === true && sim.state.garage.nosLeft === 3);
  sim.buy('weapon', 1);
  check('D8 ammo is for sale', sim.buy('ammo', 1) === true && sim.state.player.ammo[1] === 48);
  sim.state.cash = 0;
  check('D9 broke means no sale', sim.buy('engine') === false);
}

// --- E. Police, wanted, helicopter, roadblocks ------------------------------

{
  const { sim } = fresh();
  sim.state.wanted = 1;
  sim.step(STEP, input());
  check('E1 one star brings one cruiser', sim.state.police.length === 1);
  sim.state.wanted = 3;
  sim.step(STEP, input());
  check('E2 three stars bring three cruisers', sim.state.police.length === 3);
  sim.state.wanted = 5;
  sim.step(STEP, input());
  check('E3 five stars bring four cruisers', sim.state.police.length === 4);
}

{
  // A cruiser on the tail rams the car and slows it.
  const { sim } = fresh();
  stealCar(sim);
  const car = sim.state.parkedCars[sim.state.player.car];
  car.speed = 10;
  sim.state.wanted = 1;
  sim.step(STEP, input());
  const cop = sim.state.police[0];
  cop.x = car.x - Math.sin(car.angle) * 3;
  cop.z = car.z - Math.cos(car.angle) * 3;
  cop.ramTimer = 0;
  cop.speed = 20;
  const events = sim.step(STEP, input({ throttle: 1 }));
  check('E4 the ram lands', (events & EVENT_RAMMED) !== 0 && car.speed < 10);
}

{
  // Standing still next to a cruiser gets the player busted.
  const { sim } = fresh();
  sim.state.wanted = 1;
  sim.step(STEP, input());
  const cop = sim.state.police[0];
  const p = sim.state.player;
  cop.x = p.x + 2;
  cop.z = p.z;
  cop.speed = 0;
  let busted = 0;
  for (let i = 0; i < 200 && !(busted & EVENT_BUSTED); i += 1) busted |= sim.step(STEP, input());
  check('E5 standing still gets you busted', (busted & EVENT_BUSTED) !== 0 && sim.state.busted === true);
}

{
  // The heat fades once the trail is cold and no cruiser is near.
  const { sim } = fresh();
  sim.state.wanted = 2;
  sim.step(STEP, input());
  sim.state.player.x = 50;
  sim.state.player.z = 50;
  let down = 0;
  for (let i = 0; i < 900 && !(down & EVENT_WANTED_DOWN); i += 1) down |= sim.step(STEP, input());
  check('E6 the heat fades far from the cops', (down & EVENT_WANTED_DOWN) !== 0 && sim.state.wanted === 1);
}

{
  const { sim } = fresh();
  sim.state.wanted = 4;
  const heli = sim.step(STEP, input());
  check('E7 four stars bring the helicopter', (heli & EVENT_HELI) !== 0 && sim.state.heli.active === true);
  sim.state.wanted = 3;
  sim.step(STEP, input());
  check('E8 three stars ground the helicopter', sim.state.heli.active === false);
}

{
  const { sim } = fresh();
  sim.state.wanted = 4;
  sim.state.roadblockTimer = 0;
  const spawned = sim.step(STEP, input());
  check('E9 four stars raise a roadblock', (spawned & EVENT_ROADBLOCK) !== 0 && sim.state.roadblocks.length === 1);
  // Hitting the roadblock stops the car hard.
  stealCar(sim);
  const car = sim.state.parkedCars[sim.state.player.car];
  const rb = sim.state.roadblocks[0];
  car.x = rb.x;
  car.z = rb.z;
  car.speed = 10;
  sim.state.player.x = car.x;
  sim.state.player.z = car.z;
  const crash = sim.step(STEP, input({ throttle: 1 }));
  check('E10 the roadblock stops the car', (crash & EVENT_CRASH) !== 0 && car.speed < 5);
  // A cleared roadblock leaves a gap before the next one.
  sim.state.roadblocks[0].timer = 0.01;
  sim.step(STEP, input());
  check('E11 the roadblock clears', sim.state.roadblocks.length === 0);
  check('E12 no instant respawn after a roadblock', sim.state.roadblockTimer > 0);
  steps(sim, 60, input());
  check('E13 the gap holds', sim.state.roadblocks.length === 0);
}

// --- F. Missions and the autopilot ------------------------------------------

{
  check('F1 eight chapters', CHAPTERS.length === 8);
  check('F2 four side jobs', SIDE_JOBS.length === 4);
  const { sim, missions, pilot } = fresh();
  missions.startChapter(0);
  check('F3 chapter one opens on a theft', missions.objective().includes('Steal'));
  check('F4 chapter one starts with a steal step', missions.step().type === 'steal');
  let done = false;
  for (let i = 0; i < 300 * 60 && !done; i += 1) {
    sim.step(STEP, pilot.input());
    missions.update(STEP);
    done = missions.done;
  }
  check('F5 the autopilot finishes chapter one', done === true && missions.completed.includes(0));
  check('F6 chapter one pays $300', sim.state.cash >= 500);
}

{
  // A taxi fare, driven by the autopilot.
  const { sim, missions, pilot } = fresh();
  const cashBefore = sim.state.cash;
  missions.startSideJob('taxi');
  check('F7 the taxi job starts', missions.sideJob !== null && missions.sideJob.kind === 'taxi');
  let done = false;
  for (let i = 0; i < 240 * 60 && !done; i += 1) {
    sim.step(STEP, pilot.input());
    missions.update(STEP);
    done = missions.sideJob === null;
  }
  check('F8 the autopilot finishes the taxi fare', done === true && sim.state.cash === cashBefore + 100);
}

{
  // The full story: all eight chapters, driven by the autopilot.
  const { sim, missions, pilot } = fresh();
  let allDone = true;
  let totalSeconds = 0;
  for (let chapter = 0; chapter < 8; chapter += 1) {
    let chapterDone = false;
    let retries = 0;
    while (!chapterDone && retries <= 2) {
      missions.startChapter(chapter);
      let seconds = 0;
      for (let i = 0; i < 300 * 60; i += 1) {
        sim.step(STEP, pilot.input());
        missions.update(STEP);
        seconds += 1 / 60;
        if (missions.done) {
          chapterDone = true;
          break;
        }
        if (missions.failed) break;
        if (sim.state.busted || sim.state.wasted) break;
      }
      totalSeconds += seconds;
      if (!chapterDone) {
        retries += 1;
        missions.acknowledge();
      }
    }
    if (!chapterDone) {
      allDone = false;
      console.log(`  chapter ${chapter} (${CHAPTERS[chapter].name}) did not finish`);
      break;
    }
    missions.acknowledge();
  }
  check('F9 the autopilot finishes all eight chapters', allDone === true && missions.completed.length === 8);
  check('F10 no bust or death on the full run', sim.state.busted === false && sim.state.wasted === false);
  console.log(`  full story took ${Math.round(totalSeconds)}s of game time, cash $${Math.floor(sim.state.cash)}`);
}

// --- G. Staged scenes and saves ---------------------------------------------

{
  const { sim, missions } = fresh();
  const chase = stageShot('chase', sim, missions);
  check('G1 the chase scene stages', chase.screen === 'play' && sim.state.player.onFoot === false && sim.state.wanted === 3 && sim.state.police.length >= 1);
  const heli = stageShot('heli', sim, missions);
  check('G2 the helicopter scene stages', heli.screen === 'play' && sim.state.heli.active === true);
  const roadblock = stageShot('roadblock', sim, missions);
  check('G3 the roadblock scene stages', roadblock.screen === 'play' && sim.state.roadblocks.length >= 1);
  const finale = stageShot('finale', sim, missions);
  check('G4 the finale scene stages', finale.screen === 'play' && sim.state.wanted === 5 && sim.state.heli.active === true);
}

{
  const { sim, missions } = fresh();
  sim.state.cash = 1234;
  missions.completed.push(0, 1);
  const text = serialize(sim, missions);
  const data = deserialize(text);
  check('G5 the save round-trips', data !== null && data.version === 1 && data.cash === 1234 && data.chapters.length === 2);
}

{
  // JSON has no Infinity: the fists' unlimited ammo must survive a save
  // and load, and a hand-edited save with wrong-typed fields must be
  // rejected instead of reaching the sim.
  const { sim, missions } = fresh();
  const data = deserialize(serialize(sim, missions));
  check('G7 the fists ammo survives a save', data !== null && data.ammo[0] === Infinity);
  sim.loadSaveData(data);
  check('G8 the loaded fists can still fire', sim.state.player.ammo[0] === Infinity);
  check(
    'G9 a corrupt save is rejected',
    deserialize('{"version":1,"cash":"lots","weapon":9,"owned":[1,2,3],"ammo":[0,0,0,0],"maxHealth":100,"chapters":[0]}') === null,
  );
}

{
  const a = createSim(7);
  steps(a, 300, input({ throttle: 1, steer: 0.2 }));
  a.reset();
  const b = createSim(7);
  check('G6 reset restores a fresh sim', a.state.player.x === b.state.player.x && a.state.player.z === b.state.player.z && a.state.cash === b.state.cash && a.state.clockMinutes === b.state.clockMinutes);
}

// --- Result -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed: ${failures.join(', ')}`);
  process.exit(1);
}
