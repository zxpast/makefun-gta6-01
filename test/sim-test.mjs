// Node tests for Port Solano: no browser, no Three.js. They import the
// pure modules (random, city, missions, sim, autopilot, camera, shots),
// play the game through the same sim.step() the browser uses, and check
// the rules hold: missions 1 and 2 finish under the autopilot, a 60-second
// free drive stays sane, the helicopter and roadblocks appear at four
// stars, the garage and weapons spend cash, and the same seed plays the
// same game twice. Browser-only files are syntax-checked with node --check.
// Exit non-zero on the first failure.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRandom } from '../game/src/random.js';
import { createSim } from '../game/src/sim.js';
import { driveFree, playChapter, stealNearestCar, createDriver } from '../game/src/autopilot.js';
import { stageShot } from '../game/src/shots.js';
import { STEP } from '../game/src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let passed = 0;

function check(name, ok, detail) {
  if (!ok) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function freshSim(seed) {
  return createSim(createRandom(seed), { seed });
}

// 1. Every game file parses.
const files = [
  'game/src/random.js', 'game/src/config.js', 'game/src/city.js',
  'game/src/missions.js', 'game/src/sim.js', 'game/src/camera3d.js',
  'game/src/autopilot.js', 'game/src/shots.js', 'game/src/input.js',
  'game/src/audio.js', 'game/src/world3d.js', 'game/src/hud.js',
  'game/src/save.js', 'game/src/main.js', 'game/index.html',
];
for (const f of files) {
  if (f.endsWith('.html')) continue;
  execSync(`node --check ${join(root, f)}`, { stdio: 'pipe' });
}
check('all js files parse', true, `${files.length - 1} files`);

// 2. Determinism: the same seed and the same inputs play the same game.
{
  const a = freshSim(7);
  const b = freshSim(7);
  const input = { move: { x: 0, z: -1 }, running: false, actions: 0, nos: false };
  for (let i = 0; i < 600; i += 1) {
    a.step(STEP, input);
    b.step(STEP, input);
  }
  check(
    'deterministic replay',
    a.state.player.x === b.state.player.x && a.state.player.z === b.state.player.z
      && a.state.cars[0].x === b.state.cars[0].x,
    `player (${a.state.player.x.toFixed(2)}, ${a.state.player.z.toFixed(2)})`,
  );
}

// 3. Autopilot finishes chapter 1 (steal + deliver to the garage).
{
  const sim = freshSim(7);
  const result = playChapter(sim, 240);
  check('autopilot chapter 1', result.done, `${result.seconds.toFixed(1)}s, cash $${sim.state.missions.cash}`);
  check('chapter 1 pays $300', sim.state.missions.cash === 300, `$${sim.state.missions.cash}`);
}

// 4. Autopilot finishes chapter 2 (courier downtown to the Marina).
{
  const sim = freshSim(7);
  const first = playChapter(sim, 240);
  check('autopilot chapter 1 (setup for 2)', first.done, `${first.seconds.toFixed(1)}s`);
  const second = playChapter(sim, 300);
  check('autopilot chapter 2', second.done, `${second.seconds.toFixed(1)}s, cash $${sim.state.missions.cash}`);
}

// 5. A 60-second free drive stays sane and covers ground.
{
  const sim = freshSim(11);
  const result = driveFree(sim, 60, createRandom(99));
  check('60s free drive', result.ok, `${result.distance.toFixed(0)}m${result.reason ? ` (${result.reason})` : ''}`);
  check('60s drive covers ground', result.distance > 200, `${result.distance.toFixed(0)}m`);
}

// 6. Four stars bring the helicopter and three roadblocks. The player
// is in a car and driving, so the test measures the chase, not a bust.
{
  const sim = freshSim(7);
  const ok = stealNearestCar(sim, 20);
  check('heli test setup steals car', ok === true, '');
  sim.state.wanted = 4;
  const drive = createDriver(sim, 800, 560);
  for (let i = 0; i < 600; i += 1) sim.step(STEP, drive());
  check('heli active at 4 stars', sim.state.heli.active === true, `wanted ${sim.state.wanted}`);
  check('roadblocks up at 4 stars', sim.state.roadblocks.length === 3, `${sim.state.roadblocks.length} blocks`);
}

// 7. The garage spends cash and grants the upgrades.
{
  const sim = freshSim(7);
  sim.state.missions.cash = 3000;
  check('buy armor', sim.buyGarage('armor') === true, `cash $${sim.state.missions.cash}`);
  check('buy speed', sim.buyGarage('speed') === true, `cash $${sim.state.missions.cash}`);
  check('buy nos', sim.buyGarage('nos') === true, `cash $${sim.state.missions.cash}, nos ${sim.state.nos}%`);
  check('garage cash spent', sim.state.missions.cash === 3000 - 800 - 1200 - 600, `$${sim.state.missions.cash}`);
  check('armor raises max health', sim.state.player.maxHealth === 160, `${sim.state.player.maxHealth}`);
}

// 8. Weapons: buying the SMG stocks ammo, shooting spends it.
{
  const sim = freshSim(7);
  sim.state.missions.cash = 1000;
  check('buy smg', sim.buyWeapon('smg') === true, `ammo ${sim.state.ammo.smg}`);
  sim.state.weapon = 1;
  sim.step(STEP, { move: { x: 0, z: 0 }, running: false, actions: 4, nos: false });
  check('shoot spends ammo', sim.state.ammo.smg === 119, `${sim.state.ammo.smg} left`);
}

// 9. Every screenshot scene stages without throwing, finale at night.
{
  for (const name of ['chase', 'heli', 'roadblock', 'finale', 'start']) {
    const sim = freshSim(7);
    const screen = stageShot(name, sim);
    const p = sim.state.player;
    check(`stage shot ${name}`, screen === 'play' || screen === 'title', `screen ${screen}, player (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
    check(`shot ${name} finite`, Number.isFinite(p.x) && Number.isFinite(p.z), '');
  }
  const sim = freshSim(7);
  stageShot('finale', sim);
  check('finale is night', sim.state.clock > 0.85, `clock ${sim.state.clock.toFixed(2)}`);
  check('finale wanted 4+', sim.state.wanted >= 4, `${sim.state.wanted} stars`);
  check('finale has heli', sim.state.heli.active === true, '');
}

console.log(`\nAll ${passed} checks passed.`);
