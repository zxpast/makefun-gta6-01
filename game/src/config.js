// Every tuning number in one place. Port Solano is a 960 by 640 metre city
// on an 80-metre road grid, driven in real 3D: the numbers below are metres,
// metres per second and radians, and no rule depends on the screen size.
// Nothing in here touches the browser; it is plain data the simulation,
// the Three.js renderer and the screenshot painter all read.
export const STEP = 1 / 60;

export const CITY = {
  width: 960,
  height: 640,
  roadGap: 80,
  roadWidth: 12,
  blockMargin: 7,
};

// Six districts in a 3 by 2 layout. Each carries its own building height
// band and ground tint, so Downtown reads tall and dark and the Marina low
// and pale, both in 3D and on the minimap.
export const DISTRICTS = [
  { name: 'North Hills', x: 0, z: 0, w: 320, h: 320, minH: 8, maxH: 26, tint: '#2e4030' },
  { name: 'Downtown', x: 320, z: 0, w: 320, h: 320, minH: 30, maxH: 85, tint: '#3a3230' },
  { name: 'Eastside', x: 640, z: 0, w: 320, h: 320, minH: 10, maxH: 34, tint: '#32363c' },
  { name: 'Sunset Pier', x: 0, z: 320, w: 320, h: 320, minH: 6, maxH: 18, tint: '#40304a' },
  { name: 'Marina', x: 320, z: 320, w: 320, h: 320, minH: 8, maxH: 24, tint: '#24383e' },
  { name: 'Docks', x: 640, z: 320, w: 320, h: 320, minH: 10, maxH: 30, tint: '#40372a' },
];

export const PLAYER = {
  walk: 4.2,
  run: 7.0,
  radius: 0.6,
  punchReach: 1.6,
  punchCooldown: 0.45,
  health: 100,
};

export const CAR = {
  accel: 14,
  brake: 26,
  reverseTop: 8,
  topSpeed: 34,
  fastTopSpeed: 40,
  steer: 2.1,
  grip: 5.0,
  length: 4.4,
  width: 2.0,
  stealRange: 4.5,
  offroadFactor: 0.55,
};

export const TRAFFIC = { cars: 24, peds: 36, cruise: 9, cruiseJitter: 3 };

export const POLICE = {
  maxCars: 5,
  chaseSpeed: 37,
  ramDamage: 9,
  bustRange: 3.2,
  bustFine: 200,
  spawnEvery: 4,
  // Line of sight: a cop that cannot see the player for this long loses
  // the trail, and the wanted level starts to cool down.
  loseSightSeconds: 6,
  sightRange: 150,
};

export const HELI = {
  hoverHeight: 55,
  followLag: 0.6,
  rotorSpeed: 28,
  spotlightRange: 90,
};

export const ROADBLOCK = {
  count: 3,
  damage: 14,
  slowFactor: 0.35,
};

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  punch: 1,
  decaySeconds: 14,
  max: 5,
};

export const NOS = {
  capacity: 100,
  drain: 34,
  boost: 1.45,
  refillCost: 100,
};

export const GARAGE = {
  armorCost: 800,
  speedCost: 1200,
  nosCost: 600,
  armorHealth: 60,
  speedBonus: 6,
};

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 12, rate: 0.32, range: 42, ammo: -1, cost: 0 },
  { id: 'smg', name: 'SMG', damage: 7, rate: 0.09, range: 46, ammo: 120, cost: 300 },
  { id: 'shotgun', name: 'Shotgun', damage: 9, rate: 0.85, range: 26, ammo: 24, cost: 500, pellets: 6 },
];

export const RADIO = [
  { id: 'solfm', name: 'SOL FM', mood: 'mellow', bpm: 92 },
  { id: 'neon', name: 'NEON NIGHTS', mood: 'drive', bpm: 122 },
  { id: 'pier', name: 'PIER TALK', mood: 'talk', bpm: 70 },
];

export const SAVE_KEY = 'solano-heat-3d.save.v1';

// 0 = dawn, 0.5 = noon, 0.75 = sunset, 1 = night. The game starts at dusk.
export const CLOCK = { start: 0.72, dayLength: 600 };

export const PALETTE = {
  skyDay: [0x87, 0xb5, 0xe0],
  skyDusk: [0xf2, 0x7d, 0x4a],
  skyNight: [0x0e, 0x0c, 0x22],
  sun: [0xff, 0xd9, 0x8a],
  ground: [0x2a, 0x2a, 0x2e],
  road: [0x1c, 0x1c, 0x22],
  lane: [0xd8, 0xc9, 0x7a],
  buildingA: [0x6b, 0x5a, 0x72],
  buildingB: [0x72, 0x5f, 0x4e],
  buildingC: [0x4e, 0x62, 0x58],
  windowLit: [0xff, 0xc9, 0x5e],
  windowDark: [0x2a, 0x32, 0x44],
  water: [0x1a, 0x3a, 0x55],
  park: [0x2c, 0x4a, 0x2e],
  player: [0xf2, 0xc9, 0x4c],
  playerCar: [0xe8, 0xb9, 0x3a],
  trafficCar: [0x7f, 0xa3, 0xc7],
  taxiCar: [0xf2, 0xc9, 0x4c],
  copCar: [0x1e, 0x22, 0x2c],
  copRed: [0xff, 0x3b, 0x30],
  copBlue: [0x3b, 0x7b, 0xff],
  ped: [0xc9, 0x8a, 0x7a],
  marker: [0xf2, 0xc9, 0x4c],
  neonPink: [0xff, 0x4d, 0x9d],
  neonCyan: [0x4d, 0xe0, 0xff],
  text: '#f2ede4',
  muted: '#a89f92',
  danger: '#e5534b',
  good: '#6fce7e',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
