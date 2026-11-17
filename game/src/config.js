// Solano Heat — every tuning number, colour and district in one place.
//
// The world is a fixed-size city (3200 by 2400) that the camera scrolls over;
// the renderer scales the 1280x720 view to the window, so no rule below depends
// on the screen size. Nothing here touches the browser: it is plain data.
export const STEP = 1 / 60;

export const CITY = { width: 3200, height: 2400, roadGap: 320, roadWidth: 64 };

export const VIEW = { width: 1280, height: 720 };

/** Six districts, each a named rectangle the HUD reports and missions use. */
export const DISTRICTS = [
  { name: 'North Hills', x: 1400, y: 0, w: 1200, h: 560, tint: '#2c3a2e' },
  { name: 'Sunset Pier', x: 0, y: 640, w: 640, h: 640, tint: '#3a2c3a' },
  { name: 'Downtown', x: 1120, y: 880, w: 960, h: 640, tint: '#33302a' },
  { name: 'Eastside', x: 2560, y: 640, w: 640, h: 1120, tint: '#2e3338' },
  { name: 'Marina', x: 1120, y: 1760, w: 960, h: 640, tint: '#26333a' },
  { name: 'Docks', x: 0, y: 1760, w: 640, h: 640, tint: '#3a3026' },
];

export const ON_FOOT = {
  walk: 230,
  run: 350,
  radius: 13,
  punchReach: 46,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 430,
  brake: 700,
  reverseTop: 170,
  topSpeed: 540,
  fastTopSpeed: 640,
  steer: 2.5,
  grip: 6.5,
  length: 52,
  width: 26,
  stealRange: 70,
};

export const TRAFFIC = { cars: 26, peds: 40, cruise: 150, cruiseJitter: 60 };

export const POLICE = {
  spawnAtWanted: 2,
  maxCars: 5,
  chaseSpeed: 580,
  ramDamage: 8,
  bustRange: 46,
  bustFine: 200,
};

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  punch: 1,
  decaySeconds: 12,
  max: 5,
};

/** A game minute passes every real second; the day starts at eight in the evening. */
export const CLOCK = { startHour: 20, startMinute: 0, minutesPerSecond: 1 };

export const SAVE_KEY = 'solano-heat.save.v1';

export const PALETTE = {
  backdrop: '#0d0a14',
  ground: '#23201f',
  block: '#2e2a33',
  road: '#1a1820',
  lane: '#8a7f5a',
  sidewalk: '#3a3540',
  buildingA: '#4a3f55',
  buildingB: '#54423a',
  buildingC: '#3d4a42',
  roof: '#2c2530',
  water: '#14283d',
  park: '#243626',
  player: '#f2c94c',
  playerCar: '#e8b93a',
  trafficCar: '#7fa3c7',
  taxiCar: '#f2c94c',
  copCar: '#20242e',
  copLight: '#e5534b',
  ped: '#c98a7a',
  marker: '#f2c94c',
  markerDone: '#6fce7e',
  panel: 'rgba(12, 10, 18, 0.88)',
  text: '#f2ede4',
  muted: '#a89f92',
  danger: '#e5534b',
  good: '#6fce7e',
  gold: '#f2c94c',
  sky: '#1b1426',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
