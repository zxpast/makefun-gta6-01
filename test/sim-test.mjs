// Solano Heat — automated tests for the pure logic core (game/src/sim.js).
// Runs with plain node: node --test test/sim-test.mjs
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

test('city has sixteen named districts, all unique', () => {
  assert.equal(DISTRICTS.length, 16);
  assert.equal(new Set(DISTRICTS.map(d => d.name)).size, 16);
  for (const d of DISTRICTS) assert.ok(d.name.length > 3 && d.flavor.length > 3);
});

test('districtAt maps the grid corners and centre', () => {
  assert.equal(districtAt(-590, -590).name, 'Port Solano');
  assert.equal(districtAt(590, -590).name, 'North Point');
  assert.equal(districtAt(-590, 590).name, 'Little Havana');
  assert.equal(districtAt(590, 590).name, 'South Docks');
  assert.equal(districtAt(0, 0).name, 'Civic Center');
  assert.equal(districtAt(9999, 0), null);
});

test('twelve missions over seven days', () => {
  assert.equal(MISSIONS.length, 12);
  assert.deepEqual(MISSIONS.map(m => m.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(Math.max(...MISSIONS.map(m => m.day)), 7);
  assert.equal(missionById(12).name, 'The Night Job');
  assert.equal(missionById(12).type, 'finale');
});

test('saw-tooth difficulty: peaks at 4, 8 and 12, valleys at 5 and 9', () => {
  const d = Object.fromEntries(MISSIONS.map(m => [m.id, m.difficulty]));
  assert.ok(d[4] > d[3] && d[4] > d[5], 'mission 4 peaks above its neighbours');
  assert.ok(d[8] > d[7] && d[8] > d[9], 'mission 8 peaks above its neighbours');
  assert.equal(d[12], Math.max(...MISSIONS.map(m => m.difficulty)));
  assert.ok(d[5] < d[4] && d[9] < d[8], 'valleys drop after peaks');
  assert.ok(d[5] <= 3 && d[9] <= 3, 'valleys stay gentle');
});

test('days framing counts down to the Night Job', () => {
  assert.equal(daysLeft(1), 6);
  assert.equal(daysLeft(12), 0);
  assert.equal(daysLeft(8), 3);
});

test('wanted clamps at 0 and 5', () => {
  assert.equal(wantedAfterCrime(0, 'hitPed'), 2);
  assert.equal(wantedAfterCrime(5, 'shoot'), 5);
  assert.equal(wantedAfterCrime(0, 'speedTrap'), 0);
  assert.equal(wantedAfterCrime(3, 'stealCar'), 4);
});

test('police scale with wanted; heli and roadblocks only at 4+', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(policeCount), [0, 1, 2, 3, 4, 5]);
  assert.equal(heliActive(3), false);
  assert.equal(heliActive(4), true);
  assert.equal(roadblockActive(5), true);
  assert.equal(roadblockActive(2), false);
});

test('wanted decays only after line of sight breaks', () => {
  assert.equal(decayWanted(3, 12, true), 1);
  assert.equal(decayWanted(3, 12, false), 3);
  assert.equal(decayWanted(1, 5, true), 1);
  assert.equal(decayWanted(0, 99, true), 0);
});

test('mission rewards grow with bonuses', () => {
  const m = missionById(12);
  assert.ok(respectForMission(m, {}) < respectForMission(m, { timeBonus: true, noDamage: true }));
  assert.ok(cashForMission(m, { timeBonus: true }) > cashForMission(m, {}));
  assert.equal(stuntRespect('nearMiss'), 3);
  assert.equal(stuntRespect('takedown'), 8);
});

test('completing missions advances the story in order', () => {
  const s = createState();
  assert.equal(nextMissionId(s.completed), 1);
  const g = completeMission(s, 1, {});
  assert.ok(g && g.cash > 0 && g.respect > 0);
  assert.equal(s.nextMission, 2);
  assert.equal(completeMission(s, 1, {}), null, 'no double completion');
  completeMission(s, 2, {}); completeMission(s, 3, {});
  assert.equal(s.nextMission, 4);
});

test('garage upgrades cost more each level and cap at 3', () => {
  assert.ok(upgradeCost('engine', 1) < upgradeCost('engine', 2));
  assert.ok(upgradeCost('engine', 2) < upgradeCost('engine', 3));
  assert.ok(upgradeEffect('engine', 3) > upgradeEffect('engine', 1));
  const s = createState();
  s.cash = 100000;
  assert.equal(buyUpgrade(s, 'nos').level, 1);
  assert.equal(buyUpgrade(s, 'nos').level, 2);
  assert.equal(buyUpgrade(s, 'nos').level, 3);
  assert.equal(buyUpgrade(s, 'nos').ok, false);
  const poor = createState();
  assert.equal(buyUpgrade(poor, 'engine').ok, false);
});

test('weapons: three on sale, pistol owned from the start', () => {
  assert.equal(WEAPONS.length, 3);
  const s = createState();
  assert.equal(s.weapons.pistol, true);
  assert.equal(buyWeapon(s, 'pistol').ok, false);
  s.cash = 5000;
  assert.equal(buyWeapon(s, 'smg').ok, true);
  assert.equal(s.ammo.smg, 30);
});

test('shops and safehouses exist in the city', () => {
  assert.equal(SHOPS.length, 3);
  assert.equal(SAFEHOUSES.length, 2);
  assert.equal(new Set(SHOPS.map(s => s.kind)).size, 3);
  for (const s of [...SHOPS, ...SAFEHOUSES]) {
    assert.ok(districtAt(s.x, s.z), `${s.name} sits inside a district`);
  }
});

test('save round-trips through JSON and rejects junk', () => {
  const s = createState();
  s.cash = 1234; s.respect = 77; s.completed = [1, 2];
  const back = parseSave(serializeSave(s));
  assert.equal(back.cash, 1234);
  assert.equal(back.respect, 77);
  assert.deepEqual(back.completed, [1, 2]);
  assert.equal(parseSave('not json'), null);
  assert.equal(parseSave('{"version":9}'), null);
});

test('mission targets are deterministic and inside the city', () => {
  const a = missionTarget(7), b = missionTarget(7);
  assert.deepEqual(a, b);
  for (let id = 1; id <= 12; id++) {
    const t = missionTarget(id);
    assert.ok(Math.abs(t.x) <= 500 && Math.abs(t.z) <= 500);
    assert.ok(t.x % 100 === 0, 'targets sit on road intersections');
    assert.ok(t.z % 100 === 0, 'targets sit on road intersections');
    assert.ok(t.district.length > 3);
    assert.ok(objectiveText(missionById(id)).includes(t.district));
  }
});

test('star labels render five slots', () => {
  assert.equal(starLabel(0), '☆☆☆☆☆');
  assert.equal(starLabel(5), '★★★★★');
  assert.equal(starLabel(3), '★★★☆☆');
});

test('seeded RNG is deterministic and hashes differ', () => {
  const a = mulberry32(99), b = mulberry32(99);
  assert.equal(a(), b());
  assert.notEqual(hashStr('a'), hashStr('b'));
});
