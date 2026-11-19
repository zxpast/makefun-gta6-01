// Solano Heat sim tests. Plain node, no framework: every check prints PASS
// or FAIL and the process exits non-zero on the first failure, so a red run
// is impossible to miss. Run: node test/sim-test.mjs

import {
  MISSIONS, SIDE_JOBS, missionById, missionsOnDay, rewardFor, respectRank,
  garagePrice, garageTopSpeed, garageArmor, shopPrice, starsAfter,
  policeUnits, heliActive, roadblockActive, chaseTopSpeed, starsAfterHiding,
  headingError, steerFor, stoppingDistance, targetPoint, districtNameAt,
  blankSave, validSave, DAYS, MAX_STARS,
} from '../game/src/sim.js';
import { DISTRICTS, buildCity, hitsBuilding, hasLineOfSight, routeBetween } from '../game/src/city.js';

let passed = 0;

function check(name, ok) {
  if (!ok) {
    console.error('FAIL', name);
    process.exit(1);
  }
  passed += 1;
  console.log('PASS', name);
}

function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// Missions: twelve, saw-toothed, one finale, days 1-7.
check('twelve missions', MISSIONS.length === 12);
check('mission ids run 1..12', MISSIONS.every((m, i) => m.id === i + 1));
check('finale is mission 12 on day 7', missionById(12).day === 7 && missionById(12).kind === 'finale');
check('days span 1..7', Math.max(...MISSIONS.map((m) => m.day)) === DAYS);
check('saw-tooth peaks then drops', MISSIONS[3].difficulty > MISSIONS[2].difficulty && MISSIONS[4].difficulty < MISSIONS[3].difficulty);
check('two missions on day 1', missionsOnDay(1).length === 2);
check('every mission has a target inside the grid', MISSIONS.every((m) => m.target.i >= 0 && m.target.i <= 8 && m.target.j >= 0 && m.target.j <= 8));
check('every mission pays cash and respect', MISSIONS.every((m) => m.cash > 0 && m.respect > 0));

// Rewards: par time pays a fifth extra cash, respect never moves.
check('par time pays +20% cash', rewardFor(missionById(1), 60).cash === 360);
check('slow run pays base cash', rewardFor(missionById(1), 200).cash === 300);
check('respect is time-blind', rewardFor(missionById(12), 10).respect === 225);

// Respect ranks climb in order.
check('respect rank rookie', respectRank(0) === 'Rookie');
check('respect rank street', respectRank(150) === 'Street');
check('respect rank legend', respectRank(1200) === 'Legend');

// Garage and shop prices.
check('engine level 2 costs 1600', garagePrice('engine', 2) === 1600);
check('paint is flat', garagePrice('paint', 3) === 150);
check('unknown part costs 0', garagePrice('turbo', 1) === 0);
check('engine level 3 tops 51', garageTopSpeed(3) === 51);
check('armor level 2 shields 50', garageArmor(2) === 50);
check('shotgun costs 800', shopPrice('shotgun') === 800);

// Wanted system: stars clamp, units scale, heli and roadblocks at 4+.
check('steal adds a star', starsAfter('steal', 1) === 2);
check('shoot adds two stars', starsAfter('shoot', 2) === 4);
check('stars clamp at 5', starsAfter('shoot', 5) === 5);
check('stars never go below 0', starsAfter('steal', 0) === 1);
check('three stars field six units', policeUnits(3) === 6);
check('heli sleeps below 4 stars', heliActive(3) === false && heliActive(4) === true);
check('roadblocks start at 4 stars', roadblockActive(4) === true);
check('chase speed grows with stars', chaseTopSpeed(5) === 45 && chaseTopSpeed(1) === 33);

// Hiding: grace first, then one star per four quiet seconds.
check('hiding keeps stars during grace', starsAfterHiding(4, 7) === 4);
check('hiding drops a star at 12s', starsAfterHiding(4, 12) === 3);
check('hiding clears at 24s', starsAfterHiding(4, 24) === 0);

// Driving math: wrapped headings, clamped steering, braking distance.
check('heading wraps past PI', near(headingError(Math.PI * 0.9, -Math.PI * 0.9), Math.PI * 0.2, 1e-6));
check('steering clamps at 1', steerFor(3) === 1 && steerFor(-3) === -1);
check('steering is proportional', near(steerFor(0.25), 0.55));
check('braking distance grows with speed', stoppingDistance(40, 20) === 40 && stoppingDistance(20, 20) === 10);

// City: sixteen districts, buildings collide, routes run on the grid.
check('sixteen districts', DISTRICTS.length === 16);
check('district names are unique', new Set(DISTRICTS.map((d) => d.name)).size === 16);
const city = buildCity(7);
check('city builds hundreds of buildings', city.buildings.length > 100);
check('a building blocks its own centre', hitsBuilding(city, city.buildings[0].x, city.buildings[0].z, 2) !== null);
check('open road has no building', hitsBuilding(city, 0, -289, 2) === null);
check('line of sight is open down a street', hasLineOfSight(city, -289, -289, 289, -289) === true);
check('a route crosses the grid', routeBetween({ i: 0, j: 0 }, { i: 8, j: 8 }).length === 16);
check('target point names its district', typeof targetPoint(missionById(1)).district === 'string');
check('district lookup matches the grid', districtNameAt(-250, -250) === DISTRICTS[0].name);

// Saves: blank is valid, broken ones are not.
check('blank save is valid', validSave(blankSave()) === true);
check('negative cash is invalid', validSave({ ...blankSave(), cash: -5 }) === false);
check('mission 99 is invalid', validSave({ ...blankSave(), mission: 99 }) === false);
check('six side jobs', SIDE_JOBS.length === 6);

console.log(`\n${passed} sim tests passed`);
