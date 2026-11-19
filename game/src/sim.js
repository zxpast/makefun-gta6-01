// Solano Heat — pure logic core. No DOM, no three.js, no I/O: every rule the
// game and its automated tests share lives here, so the same numbers drive the
// missions, the wanted system, the respect economy and the save file.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Solano Bay: a 4x4 grid of named districts, 300 units a cell, city 1200 wide.
export const CITY_HALF = 600;
export const CELL = 300;
export const DISTRICTS = [
  { name: 'Port Solano', gx: 0, gz: 0, tint: 0x3f6d8e, flavor: 'docks and cranes' },
  { name: 'Old Cannery', gx: 1, gz: 0, tint: 0x7a6a55, flavor: 'brick warehouses' },
  { name: 'Marina Bay', gx: 2, gz: 0, tint: 0x2e8b8b, flavor: 'yachts and neon' },
  { name: 'North Point', gx: 3, gz: 0, tint: 0x8e6a3f, flavor: 'lighthouse hill' },
  { name: 'La Plazoleta', gx: 0, gz: 1, tint: 0xd9a441, flavor: 'market square' },
  { name: 'Calle Verde', gx: 1, gz: 1, tint: 0x4f8f5a, flavor: 'palm boulevard' },
  { name: 'Downtown', gx: 2, gz: 1, tint: 0x5a6b8a, flavor: 'glass towers' },
  { name: 'The Strip', gx: 3, gz: 1, tint: 0xc23b6e, flavor: 'casinos and clubs' },
  { name: 'Barrio Alto', gx: 0, gz: 2, tint: 0xb0703a, flavor: 'painted houses' },
  { name: 'Junction', gx: 1, gz: 2, tint: 0x6b6b6b, flavor: 'rail yards' },
  { name: 'Civic Center', gx: 2, gz: 2, tint: 0x8a8a9a, flavor: 'city hall' },
  { name: 'Sunset Keys', gx: 3, gz: 2, tint: 0xe07a5f, flavor: 'beachfront' },
  { name: 'Little Havana', gx: 0, gz: 3, tint: 0x3fb27a, flavor: 'cafes and dominoes' },
  { name: 'Airport Road', gx: 1, gz: 3, tint: 0x9a9a7a, flavor: 'hangars' },
  { name: 'The Palms', gx: 2, gz: 3, tint: 0x2f9e6e, flavor: 'resort hotels' },
  { name: 'South Docks', gx: 3, gz: 3, tint: 0x4a5a7a, flavor: 'container port' },
];

export function districtAt(x, z) {
  const gx = Math.floor((x + CITY_HALF) / CELL);
  const gz = Math.floor((z + CITY_HALF) / CELL);
  if (gx < 0 || gx > 3 || gz < 0 || gz > 3) return null;
  return DISTRICTS[gz * 4 + gx];
}

// Twelve story missions over seven days. Difficulty is a saw-tooth: each new
// system enters in a low-stakes mission, peaks, then the next mission drops
// back down before the next climb. Peaks at 4, 8 and 12; valleys at 5 and 9.
export const MISSIONS = [
  { id: 1, day: 1, name: 'First Ride', type: 'drive', difficulty: 2, wanted: 0, cash: 300, respect: 20, blurb: 'Maya needs a driver. Take the sedan across Downtown and do not scratch it.' },
  { id: 2, day: 1, name: 'Courier Run', type: 'timed', difficulty: 3, wanted: 0, cash: 450, respect: 25, blurb: 'Three drops, one clock. The Strip to the Marina before the timer dies.' },
  { id: 3, day: 2, name: 'Borrowed Wheels', type: 'steal', difficulty: 4, wanted: 1, cash: 500, respect: 30, blurb: 'Dex wants a fast car. Lift the coupe in North Point and bring it home.' },
  { id: 4, day: 2, name: 'The Pickup', type: 'escort', difficulty: 6, wanted: 2, cash: 800, respect: 45, blurb: 'Collect Lena from the docks with the police already watching. First real heat.' },
  { id: 5, day: 3, name: 'Cool Down', type: 'taxi', difficulty: 2, wanted: 0, cash: 350, respect: 20, blurb: 'A quiet fare across the city. Breathe. The crew is planning something big.' },
  { id: 6, day: 3, name: 'Midnight Run', type: 'timed', difficulty: 4, wanted: 1, cash: 650, respect: 35, blurb: 'Night delivery through the neon Strip. Fast, quiet, no headlights on the tail.' },
  { id: 7, day: 4, name: 'Turf Talk', type: 'combat', difficulty: 5, wanted: 2, cash: 750, respect: 40, blurb: 'Rival crew on Calle Verde. Drive-by, then vanish before the sirens close in.' },
  { id: 8, day: 4, name: 'Heat Wave', type: 'escape', difficulty: 7, wanted: 4, cash: 1100, respect: 60, blurb: 'Four stars, a helicopter overhead, roadblocks ahead. Lose them all.' },
  { id: 9, day: 5, name: 'Errand Boy', type: 'drive', difficulty: 3, wanted: 0, cash: 400, respect: 25, blurb: 'Groceries, a package, a favour for the fence. Small jobs keep the crew fed.' },
  { id: 10, day: 5, name: 'Silent Streets', type: 'stealth', difficulty: 5, wanted: 2, cash: 900, respect: 50, blurb: 'Cross the city without ever being seen. Break line of sight and stay gone.' },
  { id: 11, day: 6, name: 'The Getaway', type: 'escape', difficulty: 7, wanted: 3, cash: 1200, respect: 65, blurb: 'The practice run: full NOS, full speed, three stars, one perfect line home.' },
  { id: 12, day: 7, name: 'The Night Job', type: 'finale', difficulty: 9, wanted: 5, cash: 5000, respect: 200, blurb: 'The Meridian Vault. Five stars, helicopter, roadblocks. Reach the Marina safehouse.' },
];

export const DAYS_TOTAL = 7;
export function dayForMission(id) { return MISSIONS[id - 1].day; }
export function daysLeft(id) { return DAYS_TOTAL - MISSIONS[id - 1].day; }
export function missionById(id) { return MISSIONS.find(m => m.id === id) || null; }
export function nextMissionId(completed) {
  for (const m of MISSIONS) if (!completed.includes(m.id)) return m.id;
  return null;
}

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 25, price: 250, fireMs: 350 },
  { id: 'smg', name: 'SMG', damage: 14, price: 900, fireMs: 90 },
  { id: 'shotgun', name: 'Shotgun', damage: 70, price: 1400, fireMs: 800 },
];
export const AMMO_PRICE = 40;

export const UPGRADE_KINDS = ['engine', 'armor', 'nos', 'tires'];
export const UPGRADE_NAMES = { engine: 'Engine', armor: 'Armor', nos: 'NOS Kit', tires: 'Tires' };
export const UPGRADE_BASE = { engine: 600, armor: 500, nos: 700, tires: 400 };
export function upgradeCost(kind, level) {
  // level is the level being bought (1..3); cost climbs steeply.
  return Math.round(UPGRADE_BASE[kind] * Math.pow(1.8, level - 1));
}
export function upgradeEffect(kind, level) {
  if (kind === 'engine') return 1 + 0.12 * level;
  if (kind === 'armor') return 1 + 0.5 * level;
  if (kind === 'nos') return 1 + 0.6 * level;
  return 1 + 0.15 * level; // tires: grip
}

export const SHOPS = [
  { id: 'arms', name: 'Ironworks Arms', kind: 'weapons', x: -380, z: -420, district: 'Port Solano' },
  { id: 'garage', name: 'Pit Stop Garage', kind: 'garage', x: 120, z: 180, district: 'Civic Center' },
  { id: 'clinic', name: "Doc's Clinic", kind: 'health', x: 430, z: -330, district: 'North Point' },
];
export const SAFEHOUSES = [
  { id: 'marina', name: 'Marina Safehouse', x: 420, z: -450, district: 'Marina Bay' },
  { id: 'hills', name: 'Hills Safehouse', x: -450, z: 450, district: 'Little Havana' },
];
export const CLINIC_HEAL_PRICE = 150;

export function createState() {
  return {
    version: 1, cash: 500, respect: 0, completed: [], nextMission: 1,
    upgrades: { engine: 0, armor: 0, nos: 0, tires: 0 },
    weapons: { pistol: true, smg: false, shotgun: false },
    ammo: { pistol: 60, smg: 0, shotgun: 0 },
    activeWeapon: 'pistol', health: 100, playSeconds: 0, bestStunt: 0,
  };
}

// Wanted: crimes push stars up, hiding and time pull them down.
export const CRIME_HEAT = { bump: 1, hitCar: 1, hitPed: 2, stealCar: 1, shoot: 1, speedTrap: 0 };
export function wantedAfterCrime(wanted, crime) {
  return Math.max(0, Math.min(5, wanted + (CRIME_HEAT[crime] || 0)));
}
export function decayWanted(wanted, secondsHidden, losBroken) {
  if (wanted <= 0) return 0;
  if (!losBroken) return wanted;
  const drop = Math.floor(secondsHidden / 6);
  return Math.max(0, wanted - drop);
}
export function policeCount(wanted) {
  return [0, 1, 2, 3, 4, 5][wanted] || 0;
}
export function heliActive(wanted) { return wanted >= 4; }
export function roadblockActive(wanted) { return wanted >= 4; }

export function respectForMission(m, opts = {}) {
  let r = m.respect;
  if (opts.timeBonus) r += 10;
  if (opts.noDamage) r += 15;
  if (opts.stunts) r += Math.min(20, opts.stunts * 2);
  return r;
}
export function cashForMission(m, opts = {}) {
  let c = m.cash;
  if (opts.timeBonus) c += Math.round(m.cash * 0.2);
  return c;
}
export function stuntRespect(kind) {
  return { nearMiss: 3, drift: 2, airtime: 5, takedown: 8 }[kind] || 0;
}
export function completeMission(state, id, opts = {}) {
  const m = missionById(id);
  if (!m || state.completed.includes(id)) return null;
  const gain = { cash: cashForMission(m, opts), respect: respectForMission(m, opts) };
  state.cash += gain.cash;
  state.respect += gain.respect;
  state.completed.push(id);
  state.nextMission = nextMissionId(state.completed);
  return gain;
}

export function buyUpgrade(state, kind) {
  const level = (state.upgrades[kind] || 0) + 1;
  if (level > 3) return { ok: false, reason: 'maxed' };
  const cost = upgradeCost(kind, level);
  if (state.cash < cost) return { ok: false, reason: 'broke', cost };
  state.cash -= cost;
  state.upgrades[kind] = level;
  return { ok: true, cost, level };
}
export function buyWeapon(state, id) {
  const w = WEAPONS.find(x => x.id === id);
  if (!w) return { ok: false, reason: 'unknown' };
  if (state.weapons[id]) return { ok: false, reason: 'owned' };
  if (state.cash < w.price) return { ok: false, reason: 'broke', cost: w.price };
  state.cash -= w.price;
  state.weapons[id] = true;
  state.ammo[id] = 30;
  return { ok: true, cost: w.price };
}

export function serializeSave(state) {
  return JSON.stringify({ ...state, savedAt: Date.now() });
}
export function parseSave(text) {
  try {
    const d = JSON.parse(text);
    if (!d || d.version !== 1 || typeof d.cash !== 'number' || !Array.isArray(d.completed)) return null;
    const s = createState();
    Object.assign(s, d);
    return s;
  } catch { return null; }
}

// Deterministic mission targets from the mission id alone, so the sim and the
// 3D world always agree on where a mission sends the player. Targets snap to
// road intersections (multiples of 100), so every beacon is reachable by road
// and no mission asks the player to drive through a building.
export function missionTarget(id) {
  const rnd = mulberry32(hashStr('solano-target-' + id));
  const x = Math.round((rnd() * 2 - 1) * 4.8) * 100 || 0;
  const z = Math.round((rnd() * 2 - 1) * 4.8) * 100 || 0;
  const d = districtAt(x, z);
  return { x, z, district: d ? d.name : 'Downtown' };
}
export function objectiveText(m) {
  const t = missionTarget(m.id);
  const verbs = {
    drive: 'Drive to', timed: 'Reach', steal: 'Steal the car in', escort: 'Pick up the crew in',
    taxi: 'Drop the fare in', combat: 'Clear the rivals in', escape: 'Escape to',
    stealth: 'Slip through', finale: 'Reach the safehouse in',
  };
  return (verbs[m.type] || 'Go to') + ' ' + t.district;
}
export function starLabel(wanted) { return '★'.repeat(wanted) + '☆'.repeat(5 - wanted); }
