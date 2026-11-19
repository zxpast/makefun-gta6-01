// Solano Heat — tests for the pure logic core (game/src/sim.js).
// Plain node, no browser needed: node --test test/sim-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRICTS, MISSIONS, WEAPONS, SHOPS, SAFEHOUSES,
  districtAt, missionById, nextMissionId, daysLeft,
  wantedAfterCrime, decayWanted, policeCount, heliActive, roadblockActive,
  respectForMission, cashForMission, stuntRespect, completeMission,
  upgradeCost, upgradeEffect, buyUpgrade, buyWeapon, createState,
  serializeSave, parseSave, missionTarget, objectiveText, starLabel,
  mulberry32, hashStr,
} from '../game/src/sim.js';

test('the city is sixteen named districts, each one distinct', () => {
  assert.equal(DISTRICTS.length, 16);
  assert.equal(new Set(DISTRICTS.map(d => d.name)).size, 16);
  for (const d of DISTRICTS) {
    assert.ok(d.name.length > 3);
    assert.ok(d.flavor.length > 3);
  }
});

test('district lookup finds corners, centre, and nothing outside', () => {
  const corners = [
    [-590, -590, 'Port Solano'],
    [590, -590, 'North Point'],
    [-590, 590, 'Little Havana'],
    [590, 590, 'South Docks'],
    [0, 0, 'Civic Center'],
  ];
  for (const [x, z, name] of corners) assert.equal(districtAt(x, z).name, name);
  assert.equal(districtAt(9999, 0), null);
});

test('the story is twelve missions across seven days', () => {
  assert.equal(MISSIONS.length, 12);
  assert.deepEqual(MISSIONS.map(m => m.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(Math.max(...MISSIONS.map(m => m.day)), 7);
  const finale = missionById(12);
  assert.equal(finale.name, 'The Night Job');
  assert.equal(finale.type, 'finale');
});

test('saw-tooth pacing: hard peaks at 4, 8 and 12, easy valleys after', () => {
  const byId = Object.fromEntries(MISSIONS.map(m => [m.id, m.difficulty]));
  assert.ok(byId[4] > byId[3] && byId[4] > byId[5], 'mission 4 peaks above its neighbours');
  assert.ok(byId[8] > byId[7] && byId[8] > byId[9], 'mission 8 peaks above its neighbours');
  assert.equal(byId[12], Math.max(...MISSIONS.map(m => m.difficulty)));
  assert.ok(byId[5] < byId[4] && byId[9] < byId[8], 'valleys drop after peaks');
  assert.ok(byId[5] <= 3 && byId[9] <= 3, 'valleys stay gentle');
});

test('the countdown to the Night Job ticks down with each mission', () => {
  // Day 1 is six days out; the finale itself is day zero of the countdown.
  assert.equal(daysLeft(1), 6);
  assert.equal(daysLeft(12), 0);
  assert.equal(daysLeft(8), 3);
});

test('wanted level clamps between zero and five stars', () => {
  assert.equal(wantedAfterCrime(0, 'hitPed'), 2);
  assert.equal(wantedAfterCrime(5, 'shoot'), 5);
  assert.equal(wantedAfterCrime(0, 'speedTrap'), 0);
  assert.equal(wantedAfterCrime(3, 'stealCar'), 4);
});

test('police strength scales with wanted; heli and roadblocks need 4+ stars', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(policeCount), [0, 1, 2, 3, 4, 5]);
  assert.equal(heliActive(3), false);
  assert.equal(heliActive(4), true);
  assert.equal(roadblockActive(5), true);
  assert.equal(roadblockActive(2), false);
});

test('wanted only decays once the police lose sight of you', () => {
  assert.equal(decayWanted(3, 12, true), 1);
  assert.equal(decayWanted(3, 12, false), 3);
  assert.equal(decayWanted(1, 5, true), 1);
  assert.equal(decayWanted(0, 99, true), 0);
});

test('bonuses raise mission payouts; stunts pay fixed respect', () => {
  const m = missionById(12);
  assert.ok(respectForMission(m, {}) < respectForMission(m, { timeBonus: true, noDamage: true }));
  assert.ok(cashForMission(m, { timeBonus: true }) > cashForMission(m, {}));
  assert.equal(stuntRespect('nearMiss'), 3);
  assert.equal(stuntRespect('takedown'), 8);
});

test('finishing jobs advances the story in order, never twice', () => {
  const s = createState();
  assert.equal(nextMissionId(s.completed), 1);
  const gain = completeMission(s, 1, {});
  assert.ok(gain && gain.cash > 0 && gain.respect > 0);
  assert.equal(s.nextMission, 2);
  assert.equal(completeMission(s, 1, {}), null, 'no double completion');
  completeMission(s, 2, {});
  completeMission(s, 3, {});
  assert.equal(s.nextMission, 4);
});

test('garage upgrades get pricier per level and stop at level 3', () => {
  assert.ok(upgradeCost('engine', 1) < upgradeCost('engine', 2));
  assert.ok(upgradeCost('engine', 2) < upgradeCost('engine', 3));
  assert.ok(upgradeEffect('engine', 3) > upgradeEffect('engine', 1));
  const rich = createState();
  rich.cash = 100000;
  assert.equal(buyUpgrade(rich, 'nos').level, 1);
  assert.equal(buyUpgrade(rich, 'nos').level, 2);
  assert.equal(buyUpgrade(rich, 'nos').level, 3);
  assert.equal(buyUpgrade(rich, 'nos').ok, false);
  assert.equal(buyUpgrade(createState(), 'engine').ok, false);
});

test('three weapons for sale; the pistol is owned from the start', () => {
  assert.equal(WEAPONS.length, 3);
  const s = createState();
  assert.equal(s.weapons.pistol, true);
  assert.equal(buyWeapon(s, 'pistol').ok, false);
  s.cash = 5000;
  assert.equal(buyWeapon(s, 'smg').ok, true);
  assert.equal(s.ammo.smg, 30);
});

test('shops and safehouses sit inside real districts', () => {
  assert.equal(SHOPS.length, 3);
  assert.equal(SAFEHOUSES.length, 2);
  assert.equal(new Set(SHOPS.map(s => s.kind)).size, 3);
  for (const place of [...SHOPS, ...SAFEHOUSES]) {
    assert.ok(districtAt(place.x, place.z), `${place.name} sits inside a district`);
  }
});

test('saves survive a JSON round trip and junk is rejected', () => {
  const s = createState();
  s.cash = 1234;
  s.respect = 77;
  s.completed = [1, 2];
  const back = parseSave(serializeSave(s));
  assert.equal(back.cash, 1234);
  assert.equal(back.respect, 77);
  assert.deepEqual(back.completed, [1, 2]);
  assert.equal(parseSave('not json'), null);
  assert.equal(parseSave('{"version":9}'), null);
});

test('mission targets are deterministic, on intersections, inside the city', () => {
  assert.deepEqual(missionTarget(7), missionTarget(7));
  for (let id = 1; id <= 12; id++) {
    const t = missionTarget(id);
    assert.ok(Math.abs(t.x) <= 500 && Math.abs(t.z) <= 500);
    assert.ok(t.x % 100 === 0, 'targets sit on road intersections');
    assert.ok(t.z % 100 === 0, 'targets sit on road intersections');
    assert.ok(t.district.length > 3);
    assert.ok(objectiveText(missionById(id)).includes(t.district));
  }
});

test('star labels always show five slots', () => {
  assert.equal(starLabel(0), '☆☆☆☆☆');
  assert.equal(starLabel(5), '★★★★★');
  assert.equal(starLabel(3), '★★★☆☆');
});

test('the seeded RNG repeats itself and hashes differ per input', () => {
  const first = mulberry32(99);
  const second = mulberry32(99);
  assert.equal(first(), second());
  assert.notEqual(hashStr('a'), hashStr('b'));
});
