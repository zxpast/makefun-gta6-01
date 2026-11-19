// Solano Heat — every tuning number, colour and district in one place.
// The world is a 960 x 640 metre city on a road grid; the sim steps at 60 Hz
// and nothing in the rules reads the clock, the network or the DOM, so the
// same seed always plays the same game.

/** The simulation's fixed step, in seconds. */
export const STEP = 1 / 60;

/** The city footprint, in metres. x runs west-east, z runs north-south. */
export const WORLD = { width: 960, height: 640 };

/** Roads run every 80 m; each road is 10 m wide. Avenues run north-south. */
export const GRID = { spacing: 80, roadWidth: 10 };

/** Six districts, each a rectangle of the city by name. */
export const DISTRICTS = [
  { name: 'North Hills', x0: 0, z0: 0, x1: 480, z1: 200 },
  { name: 'Downtown', x0: 480, z0: 0, x1: 960, z1: 200 },
  { name: 'Sunset Pier', x0: 0, z0: 200, x1: 320, z1: 420 },
  { name: 'Marina', x0: 320, z0: 200, x1: 640, z1: 420 },
  { name: 'Eastside', x0: 640, z0: 200, x1: 960, z1: 420 },
  { name: 'The Docks', x0: 0, z0: 420, x1: 960, z1: 640 },
];

/** The player on foot. */
export const PLAYER = {
  walkSpeed: 4.5,
  runSpeed: 7.5,
  radius: 0.9,
  maxHealth: 100,
  punchDamage: 12,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

/** Cars the player can steal or drive. */
export const CAR = {
  accel: 15,
  brake: 26,
  reverseMax: 9,
  baseTopSpeed: 27,
  engineBonus: 6,
  steerRate: 2.1,
  length: 4.4,
  width: 2.0,
  nosBoost: 12,
  nosSeconds: 3,
  stealRange: 3.5,
};

/** Traffic and pedestrians. */
export const TRAFFIC = { cars: 16, speed: 11, peds: 28, pedSpeed: 1.4 };

/** The wanted system: 0 to 5 stars. */
export const WANTED = {
  max: 5,
  stealStars: 1,
  hitPedStars: 1,
  shootStars: 1,
  ramCopStars: 1,
  /** Seconds with no police line of sight before the trail goes cold. */
  loseSightSeconds: 6,
  /** Seconds of cold trail before one star fades. */
  fadeSeconds: 8,
  /** Distance under which a cop keeps the heat alive. */
  nearDistance: 120,
};

/** Police cruisers. A stock car tops out at 27 m/s, so the police (30)
 * catch it; with the engine tune (+6) or NOS the player pulls away.
 * That gap is the chase balance — do not close it by accident. */
export const POLICE = {
  topSpeed: 30,
  accel: 17,
  ramCooldown: 1,
  ramSlow: 0.94,
  bustDistance: 3.2,
  bustStillSpeed: 2,
  bustSeconds: 2.5,
  /** Cruisers per wanted level, index = stars. */
  countByStars: [0, 1, 2, 3, 3, 4],
};

/** The police helicopter, up at 4 stars and above. */
export const HELI = {
  altitude: 35,
  followDistance: 26,
  speed: 24,
  spotlightRange: 55,
};

/** Roadblocks, up at 4 stars and above. */
export const ROADBLOCK = { aheadDistance: 70, cars: 2, cooldown: 25 };

/** Weapons: fists, pistol, SMG, shotgun. */
export const WEAPONS = [
  { name: 'Fists', damage: 12, range: 2.2, rate: 0.45, ammo: Infinity, price: 0 },
  { name: 'Pistol', damage: 26, range: 70, rate: 0.38, ammo: 24, price: 500, ammoPrice: 100, ammoPack: 24 },
  { name: 'SMG', damage: 13, range: 55, rate: 0.09, ammo: 90, price: 900, ammoPrice: 150, ammoPack: 60 },
  { name: 'Shotgun', damage: 9, range: 26, rate: 0.85, ammo: 12, price: 800, ammoPrice: 120, ammoPack: 12, pellets: 5 },
];

/** The Eastside Garage: what money buys. */
export const GARAGE = {
  armorPrice: 800,
  armorBonus: 60,
  enginePrice: 1200,
  nosPrice: 600,
  nosRefillPrice: 100,
};

/** The three radio stations, all synthesised live. */
export const RADIO = [
  { name: 'SOL FM', bpm: 112, root: 110, bright: true },
  { name: 'NEON NIGHTS', bpm: 96, root: 98, bright: false },
  { name: 'PIER TALK', bpm: 84, root: 130, bright: true },
];

/** The game clock: one game minute every 4 real seconds. Starts mid-afternoon. */
export const CLOCK = { startHours: 15, startMinutes: 20, minutesPerSecond: 0.25 };

/** Cash the story starts with. */
export const START_CASH = 200;

/** How far a waypoint counts as reached, in metres. The autopilot shifts
 * the final route node at 4 m, so the radius must stay above 4 m: at 4 m or
 * less the car stops short of the waypoint and oscillates there forever. */
export const WAYPOINT_RADIUS = 5;

/** Where the player starts: the Marina kerb, on foot. */
export const SPAWN = { x: 480, z: 360, angle: 0 };

export const PALETTE = {
  skyDay: '#7fb2e0',
  skyDusk: '#e07840',
  skyNight: '#0d1526',
  sun: '#ffd76a',
  road: '#2e3138',
  roadLine: '#d8c95a',
  sidewalk: '#555a63',
  building: '#7a6a58',
  buildingDark: '#4c4438',
  buildingLit: '#f2c94c',
  neonPink: '#ff5da2',
  neonCyan: '#37e0d8',
  player: '#4fc3f7',
  playerCar: '#e8b23a',
  trafficCar: '#8b93a3',
  copCar: '#2f6fd0',
  copLight: '#ff3b30',
  heli: '#3a3f4a',
  spotlight: '#fff3b0',
  ped: '#c98a5a',
  marker: '#37e0a0',
  cash: '#f2c94c',
  text: '#eef1f5',
  muted: '#9aa3b2',
  panel: '#161a22',
  star: '#ffd76a',
  health: '#58d68d',
  wanted: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'solano-heat.save.v1';
