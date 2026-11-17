// Solano Heat — tuning constants and shared tables. One job: every number the
// rest of the game reads, in one place, so a tweak never hides in a draw call.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const WORLD_W = 4800;
export const WORLD_H = 3600;
export const STEP = 1 / 60;
export const ROAD_W = 96;
export const BLOCK = 400;

// Avenues (vertical roads) and streets (horizontal roads) of Port Solano.
export const AVENUES = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400];
export const STREETS = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100];
export const BEACH_X = 260; // west of this: sand, then the sea
export const SEA_X = 140;

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  sprintSpeed: 265,
  health: 100,
  armor: 50,
  punchDamage: 12,
};

export const CAR = {
  accel: 520,
  brake: 760,
  reverseAccel: 300,
  maxSpeed: 430,
  maxReverse: 150,
  steer: 2.6,
  grip: 3.2,
  length: 46,
  width: 22,
  health: 100,
};

export const WANTED_MAX = 5;
export const WANTED_DECAY_SECONDS = 14; // hidden from police: one star per this long
export const POLICE_PER_STAR = 2;

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.35, range: 46, ammo: Infinity, auto: false },
  pistol: { name: 'P9 Pistol', damage: 26, rate: 0.28, range: 420, ammo: 120, auto: false },
  smg: { name: 'VK-9 SMG', damage: 13, rate: 0.09, range: 380, ammo: 240, auto: true },
  shotgun: { name: 'Boomstick', damage: 18, rate: 0.85, range: 300, ammo: 40, auto: false, pellets: 6, spread: 0.24 },
};

export const CAR_COLORS = [
  '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad',
  '#ecf0f1', '#2c3e50', '#16a085', '#d35400', '#7f8c8d', '#b03a2e',
];
export const CAR_NAMES = [
  'Comet', 'Vagabond', 'Sunrunner', 'Marlin', 'Duchess', 'Prowler',
  'Island Cruiser', 'Nightjar', 'Bayside', 'Tornado', 'Cortez', 'Pelican',
];
export const PED_NAMES = [
  'Mara', 'Tomas', 'Iris', 'Deacon', 'Priya', 'Otto', 'Lena', 'Rafi',
  'June', 'Silas', 'Nadia', 'Cole', 'Bea', 'Hugo', 'Tessa', 'Marco',
];
export const BUILDING_COLORS = ['#b98a5e', '#7d8aa0', '#a08a7d', '#6b7f6e', '#93706b', '#5e6b7a', '#c2a878', '#8a7f9e'];
export const NEON_SIGNS = ['TACOS', 'HOTEL', '24H', 'BAR', 'PIER', 'GYM', 'CLUB', 'PAWN', 'DINE', 'MOTEL'];

export const DISTRICTS = [
  { name: 'The Boardwalk', x0: 0, y0: 0, x1: 600, y1: 3600 },
  { name: 'Old Town', x0: 600, y0: 0, x1: 1800, y1: 1800 },
  { name: 'Marina District', x0: 600, y0: 1800, x1: 1800, y1: 3600 },
  { name: 'Downtown', x0: 1800, y0: 0, x1: 3200, y1: 1800 },
  { name: 'The Docks', x0: 1800, y0: 1800, x1: 3200, y1: 3600 },
  { name: 'North Hills', x0: 3200, y0: 0, x1: 4800, y1: 1800 },
  { name: 'Eastside', x0: 3200, y0: 1800, x1: 4800, y1: 3600 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Port Solano';
}

// In-game clock: one game hour per 90 real seconds, starting at 17:40.
export const CLOCK_START_MINUTES = 17 * 60 + 40;
export const CLOCK_RATE = 60 / 90; // game minutes per real second
