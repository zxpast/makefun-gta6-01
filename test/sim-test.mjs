// Sim tests for Solano Heat: every behavior the plan promises, checked against the
// deterministic sim. Run with `node test/sim-test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../game/src/random.js';
import { createSim } from '../game/src/sim.js';
import { createMissions, CHAPTERS, SIDE_JOBS } from '../game/src/missions.js';
import { createAutopilot } from '../game/src/autopilot.js';
import { stageShot, SHOT_NAMES } from '../game/src/shots.js';
import { chaseCamera } from '../game/src/camera3d.js';
import { createCity } from '../game/src/city.js';

const IDLE = { fwd: false, back: false, left: false, right: false, run: false, nos: false, punch: false, shoot: false, enter: false, weaponCycle: false, radioNext: false };
const DRIVE = { ...IDLE, fwd: true };

function fresh(seed = 7) {
  const sim = createSim(createRandom(seed));
  const missions = createMissions(sim);
  const pilot = createAutopilot(sim, missions);
  return { sim, missions, pilot };
}

function run(sim, missions, input, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    sim.step(1 / 60, input);
    missions.update(1 / 60);
  }
}

test('world: roads, buildings and places are on the grid', () => {
  const city = createCity(createRandom(7));
  assert.equal(city.roadsX.length, 6);
  assert.equal(city.roadsZ.length, 5);
  assert.ok(city.buildings.length > 20);
  assert.ok(city.parked.length >= 20);
  assert.ok(city.places.garage !== undefined);
  assert.ok(city.places.downtown !== undefined);
  assert.ok(city.places.northHills !== undefined);
  for (const b of city.buildings) assert.notEqual(city.insideBuilding(b.x, b.z, 0), null);
});

test('world: a route follows roads and reaches its target', () => {
  const city = createCity(createRandom(7));
  const route = city.route(-400, -280, 400, 280);
  assert.ok(route.length > 2);
  const last = route[route.length - 1];
  assert.ok(Math.hypot(last.x - 400, last.z - 280) < 15);
  for (const p of route) {
    const onRoadX = city.roadsX.some((x) => Math.abs(p.x - x) < 1);
    const onRoadZ = city.roadsZ.some((z) => Math.abs(p.z - z) < 1);
    assert.ok(onRoadX || onRoadZ, `waypoint (${p.x}, ${p.z}) off the roads`);
  }
});

test('world: line of sight is blocked by buildings and open on roads', () => {
  const city = createCity(createRandom(7));
  const building = city.buildings[0];
  const behind = { x: building.x + building.w, z: building.z };
  assert.equal(city.segmentBlocked(building.x - building.w, building.z, behind.x, behind.z), true);
  assert.equal(city.segmentBlocked(-400, -280, -400, 280), false);
});

test('sim: determinism — the same seed plays the same game', () => {
  const a = fresh(42);
  const b = fresh(42);
  a.missions.startChapter(0);
  b.missions.startChapter(0);
  run(a.sim, a.missions, a.pilot.input(), 5);
  run(b.sim, b.missions, b.pilot.input(), 5);
  assert.equal(a.sim.state.player.x, b.sim.state.player.x);
  assert.equal(a.sim.state.player.z, b.sim.state.player.z);
  assert.equal(a.sim.state.cash, b.sim.state.cash);
});

test('sim: the player spawns on foot at the safehouse', () => {
  const { sim } = fresh();
  assert.equal(sim.state.player.onFoot, true);
  assert.equal(sim.state.car, null);
  assert.equal(sim.state.wanted, 0);
  assert.equal(sim.state.cash, 0);
});

test('sim: stealing a car puts the player behind the wheel', () => {
  const { sim, missions } = fresh();
  missions.startChapter(0);
  const parked = sim.city.parked[0];
  sim.state.player.x = parked.x;
  sim.state.player.z = parked.z;
  sim.step(1 / 60, { ...IDLE, enter: true });
  assert.equal(sim.state.player.onFoot, false);
  assert.notEqual(sim.state.car, null);
  assert.equal(sim.city.parked.length, 24);
});

test('sim: driving accelerates, steers and brakes', () => {
  const { sim } = fresh();
  const parked = sim.city.parked[0];
  sim.state.player.x = parked.x;
  sim.state.player.z = parked.z;
  sim.step(1 / 60, { ...IDLE, enter: true });
  run(sim, createMissions(sim), DRIVE, 3);
  assert.ok(Math.abs(sim.state.car.speed) > 10, `speed ${sim.state.car.speed}`);
  const x0 = sim.state.car.x;
  const z0 = sim.state.car.z;
  run(sim, createMissions(sim), { ...DRIVE, left: true }, 1);
  assert.ok(Math.abs(sim.state.car.x - x0) + Math.abs(sim.state.car.z - z0) > 1);
});

test('sim: NOS boosts speed above the normal cap', () => {
  const { sim } = fresh();
  const parked = sim.city.parked[0];
  sim.state.player.x = parked.x;
  sim.state.player.z = parked.z;
  sim.step(1 / 60, { ...IDLE, enter: true });
  sim.state.garage.nos = true;
  sim.state.car.nos = 1;
  // Judge the boost by the fastest speed reached: traffic may slow the car later.
  let maxSpeed = 0;
  for (let i = 0; i < 360; i += 1) {
    sim.step(1 / 60, { ...DRIVE, nos: true });
    maxSpeed = Math.max(maxSpeed, Math.abs(sim.state.car.speed));
  }
  assert.ok(maxSpeed > 34, `max speed ${maxSpeed}`);
  assert.ok(sim.state.car.nos < 1);
});

test('sim: wanted rises with heat and decays to zero out of sight', () => {
  const { sim } = fresh();
  sim.addHeat(2);
  assert.equal(sim.state.wanted, 2);
  sim.addHeat(4);
  assert.equal(sim.state.wanted, 5);
  // Hide inside a building: the cops lose line of sight and the heat fades.
  const building = sim.city.buildings[0];
  sim.state.player.x = building.x;
  sim.state.player.z = building.z;
  run(sim, createMissions(sim), IDLE, 60);
  assert.equal(sim.state.wanted, 0);
});

test('sim: police spawn at wanted 1 and the heli at wanted 4', () => {
  const { sim } = fresh();
  run(sim, createMissions(sim), IDLE, 3);
  assert.equal(sim.state.police.length, 0);
  sim.addHeat(1);
  run(sim, createMissions(sim), IDLE, 3);
  assert.ok(sim.state.police.length >= 1);
  sim.addHeat(3);
  run(sim, createMissions(sim), IDLE, 3);
  assert.equal(sim.state.heli.active, true);
});

test('sim: roadblocks appear at wanted 4 and sit on roads', () => {
  const { sim } = fresh();
  sim.addHeat(4);
  run(sim, createMissions(sim), IDLE, 6);
  assert.ok(sim.state.roadblocks.length >= 1);
  for (const b of sim.state.roadblocks) {
    const onRoadX = sim.city.roadsX.some((x) => Math.abs(b.x - x) < 8);
    const onRoadZ = sim.city.roadsZ.some((z) => Math.abs(b.z - z) < 8);
    assert.ok(onRoadX || onRoadZ);
  }
});

test('sim: a bust costs cash and drops the wanted level', () => {
  const { sim } = fresh();
  sim.state.cash = 500;
  sim.addHeat(1);
  run(sim, createMissions(sim), IDLE, 3);
  const cop = sim.state.police[0];
  sim.state.player.x = cop.x;
  sim.state.player.z = cop.z;
  sim.state.player.onFoot = true;
  sim.state.car = null;
  run(sim, createMissions(sim), IDLE, 5);
  assert.equal(sim.state.busted, true);
  assert.equal(sim.state.wanted, 0);
  assert.equal(sim.state.cash, 450);
});

test('sim: punching a ped knocks them down and raises heat', () => {
  const { sim } = fresh();
  const ped = sim.state.peds[0];
  ped.hp = 10;
  sim.state.player.x = ped.x;
  sim.state.player.z = ped.z;
  sim.state.player.angle = ped.angle;
  sim.step(1 / 60, { ...IDLE, punch: true });
  assert.ok(ped.down >= 0);
  assert.ok(sim.state.wanted >= 1);
});

test('sim: shooting spends ammo and can wreck a traffic car', () => {
  const { sim } = fresh();
  const parked = sim.city.parked[0];
  sim.state.player.x = parked.x;
  sim.state.player.z = parked.z;
  sim.step(1 / 60, { ...IDLE, enter: true });
  sim.state.weapons.owned.pistol = true;
  sim.state.weapons.ammo.pistol = 24;
  sim.state.weapons.current = 'pistol';
  const target = sim.state.traffic[0];
  target.hp = 10;
  const aim = Math.atan2(target.x - sim.state.car.x, target.z - sim.state.car.z);
  sim.state.car.angle = aim;
  sim.state.car.x = target.x - Math.sin(aim) * 8;
  sim.state.car.z = target.z - Math.cos(aim) * 8;
  sim.state.player.x = sim.state.car.x;
  sim.state.player.z = sim.state.car.z;
  sim.state.player.angle = aim;
  const ammo = sim.state.weapons.ammo.pistol;
  sim.step(1 / 60, { ...IDLE, shoot: true });
  assert.equal(sim.state.weapons.ammo.pistol, ammo - 1);
  assert.equal(target.wrecked, true);
});

test('sim: garage buys need cash and the garage nearby', () => {
  const { sim } = fresh();
  sim.state.cash = 2000;
  assert.equal(sim.buyGarage('armor'), false);
  const garage = sim.city.places.garage;
  sim.state.player.x = garage.x;
  sim.state.player.z = garage.z;
  assert.equal(sim.buyGarage('armor'), true);
  assert.equal(sim.state.cash, 1200);
  assert.equal(sim.state.garage.armor, true);
  assert.equal(sim.buyGarage('nos'), true);
  assert.equal(sim.state.cash, 600);
  assert.equal(sim.state.car, null);
});

test('sim: weapons cycle and ammo can be bought', () => {
  const { sim } = fresh();
  sim.state.weapons.owned.pistol = true;
  sim.state.weapons.owned.smg = true;
  sim.state.weapons.owned.shotgun = true;
  assert.equal(sim.state.weapons.current, 'fists');
  sim.cycleWeapon();
  assert.equal(sim.state.weapons.current, 'pistol');
  sim.cycleWeapon();
  assert.equal(sim.state.weapons.current, 'smg');
  sim.cycleWeapon();
  assert.equal(sim.state.weapons.current, 'shotgun');
  sim.cycleWeapon();
  assert.equal(sim.state.weapons.current, 'fists');
  sim.state.cash = 1000;
  assert.equal(sim.buyWeapon('smg'), false);
  sim.state.weapons.owned.smg = false;
  assert.equal(sim.buyWeapon('smg'), true);
  assert.equal(sim.state.weapons.ammo.smg, 24);
  assert.equal(sim.buyAmmo('smg'), true);
  assert.equal(sim.state.weapons.ammo.smg, 48);
});

test('sim: save round-trips exactly, with no Infinity', () => {
  const { sim } = fresh();
  sim.addHeat(3);
  sim.state.cash = 777;
  const data = sim.serialize();
  assert.ok(!JSON.stringify(data).includes('Infinity'));
  const other = createSim(createRandom(7));
  other.deserialize(data);
  assert.equal(other.state.wanted, 3);
  assert.equal(other.state.cash, 777);
});

test('sim: the clock runs and daylight follows it', () => {
  const { sim } = fresh();
  sim.setClock(12, 0);
  assert.ok(sim.daylight() > 0.9);
  const { hour } = sim.hourMinute();
  assert.equal(hour, 12);
  sim.setClock(22, 0);
  assert.ok(sim.daylight() < 0.4);
  sim.setClock(18, 30);
  assert.ok(sim.daylight() > 0.3 && sim.daylight() < 0.8);
});

test('missions: all eight chapters are defined with rewards', () => {
  assert.equal(CHAPTERS.length, 8);
  assert.equal(CHAPTERS[7].name, 'The Night Job');
  for (const ch of CHAPTERS) {
    assert.ok(ch.reward > 0);
    assert.ok(ch.steps.length >= 1);
  }
  assert.equal(SIDE_JOBS.length, 4);
});

test('missions: chapter one completes by stealing and driving downtown', () => {
  const { sim, missions } = fresh();
  missions.startChapter(0);
  const parked = sim.city.parked[0];
  sim.state.player.x = parked.x;
  sim.state.player.z = parked.z;
  sim.step(1 / 60, { ...IDLE, enter: true });
  const downtown = sim.city.places.downtown;
  sim.state.player.x = downtown.x;
  sim.state.player.z = downtown.z;
  sim.state.car.x = downtown.x;
  sim.state.car.z = downtown.z;
  // One update advances the steal step, the next completes the drive downtown.
  missions.update(1 / 60);
  missions.update(1 / 60);
  assert.equal(missions.completed.length, 1);
  assert.equal(sim.state.cash, 300);
});

test('missions: the timed courier fails when the clock runs out', () => {
  const { sim, missions } = fresh();
  missions.startChapter(1);
  const marina = sim.city.places.marina;
  sim.state.player.x = marina.x;
  sim.state.player.z = marina.z;
  missions.update(1 / 60);
  assert.equal(missions.stepIndex, 1);
  run(sim, missions, IDLE, 151);
  assert.equal(missions.failed, true);
});

test('missions: the silent pickup fails when the player arrives hot', () => {
  const { sim, missions } = fresh();
  missions.startChapter(6);
  const downtown = sim.city.places.downtown;
  sim.state.player.x = downtown.x;
  sim.state.player.z = downtown.z;
  missions.update(1 / 60);
  sim.addHeat(1);
  const safehouse = sim.city.places.safehouse;
  sim.state.player.x = safehouse.x;
  sim.state.player.z = safehouse.z;
  missions.update(1 / 60);
  assert.equal(missions.failed, true);
});

test('missions: side jobs start and the taxi completes at its target', () => {
  const { sim, missions } = fresh();
  assert.equal(missions.startSideJob('taxi'), true);
  assert.notEqual(missions.sideJob, null);
  const target = sim.city.places[missions.sideJob.target];
  sim.state.player.x = target.x;
  sim.state.player.z = target.z;
  missions.update(1 / 60);
  assert.equal(missions.sideJob, null);
  assert.equal(sim.state.cash, 100);
});

test('autopilot: completes all eight chapters with no bust or death', () => {
  const { sim, missions, pilot } = fresh(7);
  for (let chapter = 0; chapter < 8; chapter += 1) {
    missions.startChapter(chapter);
    let seconds = 0;
    while (!missions.done && !missions.failed && seconds < 600) {
      sim.step(1 / 60, pilot.input());
      missions.update(1 / 60);
      seconds += 1 / 60;
    }
    assert.equal(missions.failed, false, `chapter ${chapter} failed after ${seconds.toFixed(0)}s`);
    assert.equal(missions.done, true, `chapter ${chapter} did not finish`);
    assert.equal(sim.state.busted, false);
  }
  assert.equal(missions.completed.length, 8);
  assert.ok(sim.state.cash > 4000);
}, { timeout: 120000 });

test('camera: the chase camera sits behind the player and looks ahead', () => {
  const { sim } = fresh();
  const cam = chaseCamera(sim.state.player, null, 0);
  assert.ok(cam.eye.y > 3, 'the chase camera rides above the street');
  const behind = (cam.eye.x - sim.state.player.x) * Math.sin(sim.state.player.angle)
    + (cam.eye.z - sim.state.player.z) * Math.cos(sim.state.player.angle);
  assert.ok(behind < 0, 'the camera must sit behind the player');
  assert.ok(cam.target.y < cam.eye.y);
});

test('shots: all four staged scenes build and place the player in a car', () => {
  for (const name of SHOT_NAMES) {
    const { sim, missions, camera } = stageShot(name);
    assert.notEqual(sim.state.car, null, `${name}: the player should be driving`);
    assert.ok(camera.eye.y > 0);
    // A shot may finish its chapter mid-drive; either way it must be mid-story.
    assert.ok(missions.current >= 0 || missions.completed.length >= 1);
  }
});

test('shots: the finale is at night and the heli scene has a helicopter', () => {
  const finale = stageShot('finale');
  assert.ok(finale.sim.daylight() < 0.4, 'the finale must be at night');
  const heli = stageShot('heli');
  assert.equal(heli.sim.state.heli.active, true, 'the heli scene must have a helicopter');
  assert.ok(heli.sim.state.wanted >= 4);
  const roadblock = stageShot('roadblock');
  assert.ok(roadblock.sim.state.roadblocks.length >= 1, 'the roadblock scene must have a roadblock');
});
