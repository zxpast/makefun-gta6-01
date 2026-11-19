// Solano Heat — Node tests for the sim. Every check prints PASS or FAIL
// and the process exits non-zero on the first failure, so a broken rule
// cannot hide behind a passing build.
//
//   node test/sim-test.mjs
import { createRandom } from '../game/src/random.js';
import { buildCity, districtAt, hasLineOfSight, routeBetween } from '../game/src/city.js';
import { createSim } from '../game/src/sim.js';
import { createMissions } from '../game/src/missions.js';
import { createAutopilot } from '../game/src/autopilot.js';
import { stageShot } from '../game/src/shots.js';
import { STEP } from '../game/src/config.js';

let passed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    console.log(`FAIL ${name} ${detail}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function freshGame(seed = 7) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const sim = createSim(random, city);
  const missions = createMissions(sim);
  return { random, city, sim, missions };
}

function driveFor(sim, missions, seconds) {
  const pilot = createAutopilot(sim, missions);
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    sim.step(STEP, pilot.input());
    missions.update(STEP);
    if (sim.state.busted || sim.state.dead) break;
  }
}

// 1 — the city has buildings and six districts that cover the map.
{
  const { city } = freshGame();
  check('city has buildings', city.buildings.length > 40, `${city.buildings.length} towers`);
  check('district north hills', districtAt(100, 100) === 'North Hills');
  check('district docks', districtAt(900, 600) === 'The Docks');
  check('district downtown', districtAt(700, 100) === 'Downtown');
}

// 2 — a route over the road grid starts near A and ends at B.
{
  const path = routeBetween(60, 60, 900, 540);
  check('route exists', path.length > 4, `${path.length} waypoints`);
  const last = path[path.length - 1];
  check('route ends at target', last.x === 900 && last.z === 540);
}

// 3 — line of sight: an open road is clear, a tower blocks the view.
{
  const { city } = freshGame();
  check('LOS along a road', hasLineOfSight(city, 60, 60, 60, 540));
  const b = city.buildings[0];
  const blocked = !hasLineOfSight(city, b.x - b.w, b.z, b.x + b.w, b.z);
  check('LOS blocked by a tower', blocked, `tower at ${Math.round(b.x)},${Math.round(b.z)}`);
}

// 4 — two sims from the same seed drive identically (determinism).
{
  const a = freshGame();
  const b = freshGame();
  a.missions.startChapter(0);
  b.missions.startChapter(0);
  driveFor(a.sim, a.missions, 30);
  driveFor(b.sim, b.missions, 30);
  const pa = a.sim.state.player;
  const pb = b.sim.state.player;
  check(
    'deterministic 30s drive',
    Math.abs(pa.x - pb.x) < 0.001 && Math.abs(pa.z - pb.z) < 0.001 && a.sim.state.cash === b.sim.state.cash,
    `pos ${pa.x.toFixed(1)},${pa.z.toFixed(1)}`,
  );
}

// 5 — the autopilot steals a car and finishes chapter 1.
{
  const { sim, missions } = freshGame();
  missions.startChapter(0);
  driveFor(sim, missions, 120);
  check('chapter 1 complete', missions.state.completed.includes('first-ride'), `cash $${sim.state.cash}`);
  check('chapter 1 paid', sim.state.cash >= 200, `$${sim.state.cash}`);
  check('car was stolen', sim.state.stats.carsStolen >= 1);
}

// 6 — chapter 2 (courier) completes too.
{
  const { sim, missions } = freshGame();
  missions.startChapter(1);
  driveFor(sim, missions, 150);
  check('chapter 2 complete', missions.state.completed.includes('courier'), `cash $${sim.state.cash}`);
}

// 7 — stealing a car raises the wanted level and brings police.
{
  const { sim } = freshGame();
  const before = sim.wantedStars();
  const pilot = createAutopilot(sim, createMissions(sim));
  for (let i = 0; i < 600 && !sim.state.car; i += 1) sim.step(STEP, pilot.input());
  check('stole a car', !!sim.state.car);
  check('wanted rose after theft', sim.wantedStars() > before, `${before} -> ${sim.wantedStars()} stars`);
  for (let i = 0; i < 120; i += 1) sim.step(STEP, { steer: 0, throttle: 0, run: false, nos: false, enter: false, exit: false, shoot: false, weaponSwitch: false, radio: false, garage: false, garageBuy: null, ammoBuy: null });
  check('police spawned', sim.state.police.length >= 2, `${sim.state.police.length} cruisers`);
}

// 8 — at four stars the helicopter and roadblocks show up.
{
  const { sim } = freshGame();
  sim.state.wanted = 4;
  sim.state.roadblockTimer = 0;
  const idle = { steer: 0, throttle: 0, run: false, nos: false, enter: false, exit: false, shoot: false, weaponSwitch: false, radio: false, garage: false, garageBuy: null, ammoBuy: null };
  for (let i = 0; i < 180; i += 1) sim.step(STEP, idle);
  check('helicopter at 4 stars', sim.state.heli.active);
  check('roadblock at 4 stars', sim.state.roadblocks.length >= 1, `${sim.state.roadblocks.length} blocks`);
}

// 9 — heat fades when the player stays out of sight. The hiding spot is
// mid-block at (720, 360), where the towers break every line of sight.
{
  const { sim } = freshGame();
  sim.state.player.x = 720;
  sim.state.player.z = 360;
  sim.state.wanted = 2;
  sim.state.losTimer = 10;
  const idle = { steer: 0, throttle: 0, run: false, nos: false, enter: false, exit: false, shoot: false, weaponSwitch: false, radio: false, garage: false, garageBuy: null, ammoBuy: null };
  for (let i = 0; i < 60 * 30; i += 1) sim.step(STEP, idle);
  check('wanted fades while hidden', sim.wantedStars() === 0, `${sim.state.wanted.toFixed(2)} left`);
}

// 10 — garage: an engine tune costs cash and adds top speed; a second
// big purchase is refused when the cash runs out.
{
  const { sim } = freshGame();
  sim.state.cash = 2000;
  const ok = sim.buyUpgrade('engine');
  check('engine tune bought', ok && sim.state.upgrades.engine && sim.state.cash === 800);
  const armor = sim.buyUpgrade('armor');
  check('armor bought with exact cash', armor && sim.state.upgrades.armor && sim.state.cash === 0);
  const nos = sim.buyUpgrade('nos');
  check('NOS refused when broke', !nos && !sim.state.upgrades.nos);
}

// 11 — weapons: buying a pistol arms the player, shooting spends ammo.
{
  const { sim } = freshGame();
  sim.state.cash = 2000;
  check('pistol bought', sim.buyWeapon('pistol') && sim.state.weapons.owned.pistol);
  check('pistol has 30 rounds', sim.state.weapons.ammo.pistol === 30);
  const idle = { steer: 0, throttle: 0, run: false, nos: false, enter: false, exit: false, shoot: true, weaponSwitch: false, radio: false, garage: false, garageBuy: null, ammoBuy: null };
  sim.step(STEP, idle);
  check('shot spent a round', sim.state.weapons.ammo.pistol === 29, `${sim.state.weapons.ammo.pistol} left`);
}

// 12 — a 60-second free drive covers ground without a bust or a death.
{
  const { sim, missions } = freshGame();
  driveFor(sim, missions, 60);
  check('60s drive survives', !sim.state.busted && !sim.state.dead);
  check('60s drive covers ground', sim.state.stats.distanceDriven > 100, `${Math.round(sim.state.stats.distanceDriven)} m`);
}

// 13 — the finale scene stages five stars, a helicopter and a roadblock.
{
  const { sim, missions } = freshGame();
  stageShot('finale', sim, missions);
  check('finale has 5 stars', sim.wantedStars() === 5, `${sim.wantedStars()} stars`);
  check('finale heli overhead', sim.state.heli.active);
  check('finale roadblock up', sim.state.roadblocks.length >= 1);
  check('finale is night', sim.state.clockMinutes >= 1320);
}

// 14 — the chase scene stages a daylight pursuit.
{
  const { sim, missions } = freshGame();
  stageShot('chase', sim, missions);
  check('chase has 3 stars', sim.wantedStars() === 3, `${sim.wantedStars()} stars`);
  check('chase is daytime', sim.state.clockMinutes >= 900 && sim.state.clockMinutes < 1020);
  check('chase has police', sim.state.police.length >= 2);
  check('chase is driving', !!sim.state.car && Math.abs(sim.state.car.speed) > 5, `${sim.state.car ? sim.state.car.speed.toFixed(1) : 0} m/s`);
}

// 15 — the clock advances and daylight follows it.
{
  const { sim } = freshGame();
  const idle = { steer: 0, throttle: 0, run: false, nos: false, enter: false, exit: false, shoot: false, weaponSwitch: false, radio: false, garage: false, garageBuy: null, ammoBuy: null };
  const start = sim.state.clockMinutes;
  for (let i = 0; i < 120; i += 1) sim.step(STEP, idle);
  check('clock advances', sim.state.clockMinutes > start, `${start} -> ${sim.state.clockMinutes}`);
  check('daylight at dusk', sim.daylight() > 0 && sim.daylight() < 1, sim.daylight().toFixed(2));
}

console.log(`\nAll ${passed} checks passed.`);
