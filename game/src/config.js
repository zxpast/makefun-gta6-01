// Every tuning number, colour and place in one place. Port Solano is a 960 by 640 metre
// open world: six districts on a road grid, and nothing below depends on the screen size.
export const STEP = 1 / 60;

export const WORLD = { width: 960, depth: 640, roadSpacing: 160, roadWidth: 14 };

export const DISTRICTS = [
  { name: 'North Hills', x0: -480, z0: -320, x1: -160, z1: -80, tint: '#3d5a4a' },
  { name: 'Downtown', x0: -160, z0: -160, x1: 160, z1: 160, tint: '#4a4a58' },
  { name: 'Eastside', x0: 160, z0: -320, x1: 480, z1: 80, tint: '#5a4a3d' },
  { name: 'Sunset Pier', x0: -480, z0: 80, x1: -160, z1: 320, tint: '#5a3d4a' },
  { name: 'Marina', x0: -160, z0: 160, x1: 160, z1: 320, tint: '#3d4a5a' },
  { name: 'the Docks', x0: 160, z0: 80, x1: 480, z1: 320, tint: '#4a3d3d' },
];

// Places the missions and the garage point at. Every place sits ON a road (a road
// centreline), so a route's last leg follows the road instead of cutting through
// a block — a target inside a block is unreachable behind its buildings.
export const PLACES = {
  downtown: { x: 0, z: 0, label: 'Downtown' },
  northHills: { x: -320, z: -280, label: 'North Hills' },
  eastside: { x: 320, z: -140, label: 'Eastside' },
  pier: { x: -320, z: 280, label: 'Sunset Pier' },
  marina: { x: 0, z: 280, label: 'Marina' },
  docks: { x: 320, z: 280, label: 'the Docks' },
  safehouse: { x: -80, z: -80, label: 'Safehouse' },
  garage: { x: 240, z: -80, label: 'Eastside Garage' },
};

export const SPAWN = { x: -80, z: -80, angle: 0 };

export const PLAYER = {
  walkSpeed: 6, runSpeed: 9, radius: 0.9, health: 100, punchDamage: 12, punchRange: 2.2,
};

export const CAR = {
  accel: 14, brake: 26, reverseAccel: 10, maxSpeed: 34, maxReverse: 10,
  steer: 1.9, steerSpeed: 2.4, grip: 6, radius: 2.2, length: 4.4, width: 2,
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 40;

export const POLICE = {
  accel: 16, maxSpeed: 26, ramDamage: 3, ramCooldown: 3, ramSlow: 0.94,
  bustRange: 3.2, bustTime: 2.5, spawnDistance: 100,
};

export const HELI = { altitude: 35, speed: 24, radius: 3, spotlight: 26 };

export const WANTED = {
  max: 5, loseSightSeconds: 3, fadeSeconds: 4, stealHeat: 1, hitHeat: 1, shootHeat: 1,
};

export const ROADBLOCK = { atWanted: 4, ahead: 90, gapSeconds: 14, carCount: 2 };

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 2.2, rate: 0.45, auto: false },
  pistol: { name: 'Pistol', damage: 34, range: 46, rate: 0.32, auto: false, price: 300, ammoPrice: 40 },
  smg: { name: 'SMG', damage: 16, range: 38, rate: 0.09, auto: true, price: 800, ammoPrice: 60 },
  shotgun: { name: 'Shotgun', damage: 22, range: 22, rate: 0.85, auto: false, pellets: 6, price: 900, ammoPrice: 80 },
};

export const GARAGE = {
  armor: { name: 'Armor', price: 800, health: 60 },
  engine: { name: 'Engine tune', price: 1200, speed: 6 },
  nos: { name: 'NOS kit', price: 600, refill: 100 },
};

export const NOS = { boost: 14, drain: 0.45, refill: 1 };

export const RADIO = [
  { name: 'SOL FM', tempo: 112, wave: 'sawtooth', root: 110 },
  { name: 'NEON NIGHTS', tempo: 96, wave: 'square', root: 98 },
  { name: 'PIER TALK', tempo: 80, wave: 'triangle', root: 87.3 },
];

export const CLOCK = { startHour: 15, startMinute: 20, minutesPerSecond: 0.4 };

export const CAMERA = { distance: 11, height: 4.6, lookAhead: 8, fov: 62, smooth: 7 };

export const COLORS = {
  skyDay: '#7fb2e5', skyDusk: '#e8804a', skyNight: '#10182b',
  sun: '#ffd27f', road: '#33363d', roadLine: '#d8c25a', sidewalk: '#55565e',
  grass: '#3f6b3a', water: '#2a5a7a', neonPink: '#ff4fd8', neonCyan: '#37e6ff',
  playerCar: '#e8b13a', policeCar: '#e8e8e8', heliBody: '#22262e',
  buildingA: '#6b5a4e', buildingB: '#4e5a6b', buildingC: '#5a6b4e', buildingD: '#6b4e5a',
  hud: '#eef1f5', hudMuted: '#9aa3b2', panel: 'rgba(12,16,24,0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const SAVE_KEY = 'solano-heat.save.v1';
export const SHOT_SEED = 7;
