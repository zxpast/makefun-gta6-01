// Solano Heat, logic core. Pure functions only: no DOM, no Three.js, no
// timers. The game runs on these numbers and the test suite runs on them too,
// so a mission that pays wrong here pays wrong everywhere. Missions are
// data; the state machine that plays them lives in missions.js.

import { DISTRICTS, districtAt, intersection } from './city.js';

export const DAYS = 7;
export const MAX_STARS = 5;
export const PLAYER_TOP_SPEED = 42;
export const NOS_TOP_SPEED = 54;

export const MISSIONS = [
  { id: 1, name: 'First Ride', day: 1, kind: 'drive', brief: 'Drive to Mara at the garage. Learn the streets, no heat.', target: { i: 4, j: 5 }, cash: 300, respect: 25, wanted: 0, par: 75, difficulty: 1 },
  { id: 2, name: 'Courier Run', day: 1, kind: 'deliver', brief: 'A package for Breakwater. Beat the clock.', target: { i: 6, j: 7 }, cash: 450, respect: 30, wanted: 0, par: 70, difficulty: 2 },
  { id: 3, name: 'The Pickup', day: 2, kind: 'drive', brief: 'Collect the drop in Driftwood. The law is watching.', target: { i: 2, j: 2 }, cash: 600, respect: 40, wanted: 2, par: 80, difficulty: 2 },
  { id: 4, name: 'Street Heat', day: 2, kind: 'race', brief: 'Beat Deke across town. NOS is on the table.', target: { i: 7, j: 7 }, cash: 800, respect: 50, wanted: 1, par: 65, difficulty: 3 },
  { id: 5, name: 'Gun Runner', day: 3, kind: 'combat', brief: 'Arm up at Ironmarket Arms, then clear the corner.', target: { i: 2, j: 6 }, cash: 1000, respect: 60, wanted: 2, par: 90, difficulty: 2 },
  { id: 6, name: 'Getaway Driver', day: 3, kind: 'chase', brief: 'Lose a three-star tail across the bay.', target: { i: 7, j: 2 }, cash: 1200, respect: 70, wanted: 3, par: 85, difficulty: 4 },
  { id: 7, name: 'Turf War', day: 4, kind: 'combat', brief: 'Take Ember Row back, street by street.', target: { i: 1, j: 4 }, cash: 1500, respect: 85, wanted: 3, par: 100, difficulty: 3 },
  { id: 8, name: 'Midnight Haul', day: 4, kind: 'stealth', brief: 'Move the haul after dark. Quiet beats fast.', target: { i: 5, j: 1 }, cash: 1300, respect: 75, wanted: 2, par: 95, difficulty: 2 },
  { id: 9, name: 'The Informant', day: 5, kind: 'drive', brief: 'Meet Pip on foot, then run. The heli is up.', target: { i: 3, j: 3 }, cash: 1800, respect: 100, wanted: 4, par: 100, difficulty: 4 },
  { id: 10, name: 'High Tide', day: 5, kind: 'chase', brief: 'Four stars, a heli and roadblocks. Outrun the tide.', target: { i: 6, j: 6 }, cash: 2200, respect: 120, wanted: 4, par: 95, difficulty: 5 },
  { id: 11, name: 'The Set-Up', day: 6, kind: 'chase', brief: 'Five stars. They set a trap. Drive through it.', target: { i: 1, j: 7 }, cash: 3000, respect: 150, wanted: 5, par: 110, difficulty: 4 },
  { id: 12, name: 'The Tidehouse Job', day: 7, kind: 'finale', brief: 'The vault, the crew, the whole city behind you. Finish it.', target: { i: 7, j: 4 }, cash: 6000, respect: 225, wanted: 5, par: 120, difficulty: 6 },
];

export const SIDE_JOBS = [
  { id: 'taxi', name: 'Taxi Fare', cash: 120, respect: 8, brief: 'Ferry a fare across town.' },
  { id: 'courier', name: 'Courier Drop', cash: 150, respect: 10, brief: 'One parcel, no questions.' },
  { id: 'vigilante', name: 'Vigilante', cash: 200, respect: 15, brief: 'Chase down a runner for the precinct.' },
  { id: 'repo', name: 'Repo Run', cash: 180, respect: 12, brief: 'Tow a car that is not yours yet.' },
  { id: 'race', name: 'Street Race', cash: 350, respect: 20, brief: 'Three laps, no rules.' },
  { id: 'stunt', name: 'Stunt Jump', cash: 250, respect: 18, brief: 'Clear the gap, land it clean.' },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function missionsOnDay(day) {
  return MISSIONS.filter((m) => m.day === day);
}

// Pay for finishing a mission. Beat the par time and the cash gets a fifth
// on top; respect never changes with speed, only with the job itself.
export function rewardFor(mission, seconds) {
  const fast = seconds <= mission.par;
  return {
    cash: fast ? Math.round(mission.cash * 1.2) : mission.cash,
    respect: mission.respect,
    fast,
  };
}

export const RESPECT_RANKS = [
  { at: 0, name: 'Rookie' },
  { at: 100, name: 'Street' },
  { at: 300, name: 'Hustler' },
  { at: 600, name: 'Kingpin' },
  { at: 1000, name: 'Legend' },
];

export function respectRank(respect) {
  let rank = RESPECT_RANKS[0];
  for (const r of RESPECT_RANKS) if (respect >= r.at) rank = r;
  return rank.name;
}

export const GARAGE_PARTS = {
  engine: { name: 'Engine', base: 400 },
  armor: { name: 'Armor', base: 350 },
  nos: { name: 'NOS Kit', base: 300 },
  paint: { name: 'Paint', base: 150 },
};

export function garagePrice(part, level) {
  const spec = GARAGE_PARTS[part];
  if (!spec) return 0;
  if (part === 'paint') return spec.base;
  return spec.base * level * level;
}

export function garageTopSpeed(level) {
  return PLAYER_TOP_SPEED + level * 3;
}

export function garageArmor(level) {
  return level * 25;
}

export const SHOP_ITEMS = {
  pistol: { name: 'Pistol', price: 250, damage: 12 },
  smg: { name: 'SMG', price: 600, damage: 9 },
  shotgun: { name: 'Shotgun', price: 800, damage: 30 },
  health: { name: 'First Aid', price: 100, heal: 50 },
  ammo: { name: 'Ammo Box', price: 80, rounds: 60 },
};

export function shopPrice(item) {
  return SHOP_ITEMS[item] ? SHOP_ITEMS[item].price : 0;
}

// Wanted stars after a crime, clamped to the 0-5 band.
export function starsAfter(crime, stars) {
  const bump = { steal: 1, shoot: 2, ram: 1, speed: 0, mission: 0 }[crime] ?? 0;
  if (crime === 'mission') return Math.max(0, Math.min(MAX_STARS, stars));
  return Math.max(0, Math.min(MAX_STARS, stars + bump));
}

export function policeUnits(stars) {
  return Math.max(0, Math.min(10, stars * 2));
}

export function heliActive(stars) {
  return stars >= 4;
}

export function roadblockActive(stars) {
  return stars >= 4;
}

export function chaseTopSpeed(stars) {
  return 30 + stars * 3;
}

// Heat falls when nobody can see the player: one star per four quiet
// seconds, after an eight-second grace where the tail is still warm.
export function starsAfterHiding(stars, quietSeconds) {
  if (quietSeconds < 8) return stars;
  return Math.max(0, stars - Math.floor((quietSeconds - 8) / 4));
}

// Wrapped angle difference, -PI..PI. Positive means turn left.
export function headingError(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function steerFor(error) {
  return Math.max(-1, Math.min(1, error * 2.2));
}

export function stoppingDistance(speed, decel) {
  return (speed * speed) / (2 * decel);
}

export function targetPoint(mission) {
  const p = intersection(mission.target.i, mission.target.j);
  return { ...p, district: districtAt(p.x, p.z).name };
}

export function districtNameAt(x, z) {
  return districtAt(x, z).name;
}

export const SAVE_KEY = 'solanoheat.save.v1';

export function blankSave() {
  return {
    cash: 500,
    respect: 0,
    mission: 1,
    completed: [],
    garage: { engine: 0, armor: 0, nos: 0, paint: 0 },
    weapons: { pistol: false, smg: false, shotgun: false },
    ammo: 0,
    day: 1,
  };
}

export function validSave(save) {
  if (!save || typeof save !== 'object') return false;
  if (typeof save.cash !== 'number' || save.cash < 0) return false;
  if (typeof save.respect !== 'number' || save.respect < 0) return false;
  if (typeof save.mission !== 'number' || save.mission < 1 || save.mission > 13) return false;
  if (!Array.isArray(save.completed)) return false;
  return true;
}
