// Solano Heat — the one place every number lives. Port Solano is 960 by
// 640 metres, x east, z south, y up. Roads run on a 120 m grid and the
// buildings fill the blocks between them. Nothing here touches the DOM.
export const STEP = 1 / 60;

export const CITY = { width: 960, height: 640, roadGap: 120, roadHalf: 7, margin: 60 };

export const DISTRICTS = [
  { name: 'North Hills', x0: 0, z0: 0, x1: 480, z1: 200, tint: 0x2e4a3a },
  { name: 'Downtown', x0: 480, z0: 0, x1: 960, z1: 240, tint: 0x3a3a4a },
  { name: 'Eastside', x0: 480, z0: 240, x1: 960, z1: 420, tint: 0x4a3a2e },
  { name: 'Sunset Pier', x0: 0, z0: 420, x1: 480, z1: 640, tint: 0x4a2e3a },
  { name: 'Marina', x0: 480, z0: 420, x1: 720, z1: 640, tint: 0x2e3a4a },
  { name: 'The Docks', x0: 720, z0: 420, x1: 960, z1: 640, tint: 0x3a352a },
];

export const PLAYER = {
  walkSpeed: 5, runSpeed: 9, radius: 0.9, health: 100,
  enterRange: 4.5, punchRange: 2.2, punchDamage: 12, punchCooldown: 0.45,
};

export const CAR = {
  accel: 16, brake: 30, reverseAccel: 10, maxSpeed: 34, maxReverse: 9,
  steer: 1.9, grip: 6, length: 4.4, width: 2, drag: 0.35,
  nosBoost: 16, nosDrain: 35,
};

export const TRAFFIC_COUNT = 22;
export const PED_COUNT = 36;
export const PARKED_COUNT = 14;

export const WANTED = {
  max: 5, decayPerSecond: 0.045, quietSeconds: 6,
  bustRange: 3.2, bustSpeed: 2.5,
  policePerStar: [0, 2, 3, 4, 5, 6], heliAt: 4, roadblockAt: 4,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 2.2, rate: 0.45, auto: false },
  pistol: { name: 'Pistol', damage: 22, range: 42, rate: 0.32, auto: false, price: 300, ammoPrice: 60 },
  smg: { name: 'SMG', damage: 11, range: 38, rate: 0.09, auto: true, price: 900, ammoPrice: 120 },
  shotgun: { name: 'Shotgun', damage: 55, range: 24, rate: 0.85, auto: false, price: 1200, ammoPrice: 180 },
};

export const GARAGE = {
  armor: { name: 'Body Armor', price: 800, bonus: 60 },
  engine: { name: 'Engine Tune', price: 1200, bonus: 6 },
  nos: { name: 'NOS Kit', price: 600, refill: 100 },
};

export const ECONOMY = {
  startCash: 150, taxiFare: 120, courierPay: 200, vigilantePay: 250, repoPay: 500,
};

export const SAVE_KEY = 'solano-heat.save.v5';

export const PALETTE = {
  skyDay: '#7fb2e5', skyDusk: '#e8865a', skyNight: '#0d1026',
  road: '#2b2f36', roadLine: '#d8c25a', sidewalk: '#555a63',
  building: '#8a7f74', buildingDark: '#5d564e', glass: '#9fc6e8',
  grass: '#4a7a3f', water: '#2e6f8e', sand: '#c9b078',
  playerCar: '#e8b13c', policeCar: '#2a4fd0', heli: '#1c2733',
  marker: '#ffcf3d', text: '#f2f4f7', muted: '#9aa3ad', panel: 'rgba(12,16,24,0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** One in-game minute per real second; the game opens at 17:00, sunset. */
export const CLOCK = { startMinutes: 17 * 60, minutesPerSecond: 1 };
