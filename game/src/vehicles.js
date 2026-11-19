// Solano Heat — cars and people. Low-poly cars built from boxes, traffic
// that loops the road grid in its own lane, pedestrians on the sidewalks,
// and the police helicopter with its spotlight.
import * as THREE from 'three';
import { mulberry32 } from './sim.js';

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.18, -0.2);
  cabin.castShadow = true;
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w);
    wheels.push(w);
  }
  // Headlights and taillights are the same pair of small boxes, front and
  // back, differing only in material and which end of the car they sit on.
  const lampPair = (mat, z) => {
    for (const x of [-0.7, 0.7]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), mat);
      lamp.position.set(x, 0.72, z);
      g.add(lamp);
    }
  };
  lampPair(new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.2 }), 2.22);
  lampPair(new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 0.8 }), -2.22);
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2244cc, emissive: 0x2244cc, emissiveIntensity: 1.4 }));
    bar.position.set(0, 1.55, -0.2);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeHeliMesh() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x1c2f4a, roughness: 0.4, metalness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 5.2), hullMat);
  hull.castShadow = true;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.6 }));
  glass.position.set(0, 0.4, 2.0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5.0), hullMat);
  tail.position.set(0, 0.3, -4.6);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.2), hullMat);
  fin.position.set(0, 0.8, -6.8);
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(9.5, 0.08, 0.5);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
  const b1 = new THREE.Mesh(bladeGeo, bladeMat);
  const b2 = new THREE.Mesh(bladeGeo, bladeMat);
  b2.rotation.y = Math.PI / 2;
  rotor.add(b1, b2);
  rotor.position.y = 1.3;
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  for (const x of [-1.1, 1.1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.4), skidMat);
    skid.position.set(x, -1.15, 0.4);
    g.add(skid);
  }
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 26, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -14;
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.5 }),
  );
  beacon.position.set(0, 1.4, -6.8);
  const spot = new THREE.SpotLight(0xffe9a0, 900, 120, 0.32, 0.45, 1.2);
  spot.position.set(0, -1, 1);
  g.add(hull, glass, tail, fin, rotor, cone, beacon, spot);
  g.userData.rotor = rotor;
  g.userData.spot = spot;
  g.userData.cone = cone;
  g.userData.beacon = beacon;
  return g;
}

// Arcade car: speed, heading, drift on the handbrake, NOS boost, damage.
export class PlayerCar {
  constructor(mesh) {
    this.mesh = mesh;
    // Spawn on the road crossing at the city centre, facing down the road.
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.damage = 0;
    this.nos = 100;
    this.drifting = false;
    this.airborne = 0;
  }
  get pos() { return { x: this.x, z: this.z }; }
  update(dt, input, mods) {
    const fwd = input.axis(['s', 'ArrowDown'], ['w', 'ArrowUp']);
    const steer = input.axis(['a', 'ArrowLeft'], ['d', 'ArrowRight']);
    const handbrake = input.down(' ');
    const boosting = input.down('shift') && this.nos > 0 && this.speed > 8;
    const topSpeed = 42 * mods.engine;
    const accel = (fwd > 0 ? 26 : 0) * mods.engine;
    if (fwd > 0) this.speed = Math.min(topSpeed, this.speed + accel * dt);
    else if (fwd < 0) this.speed = Math.max(-14, this.speed - 30 * dt);
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    if (boosting) {
      this.speed = Math.min(topSpeed * 1.5, this.speed + 34 * dt);
      this.nos -= 34 * dt;
    } else {
      this.nos = Math.min(100, this.nos + 6 * dt);
    }
    const grip = mods.tires;
    const turnRate = (handbrake ? 2.6 : 1.7) * (this.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(this.speed) / 12);
    this.heading += steer * turnRate * dt * (handbrake ? 1.4 : 1) * grip;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    this.drifting = handbrake && Math.abs(this.speed) > 10 && steer !== 0;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
    this.x = Math.max(-590, Math.min(590, this.x));
    this.z = Math.max(-590, Math.min(590, this.z));
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels || [];
    for (const w of wheels) w.rotation.x += this.speed * dt * 2.6;
    if (wheels[0]) wheels[0].rotation.y = steer * 0.32;
    if (wheels[1]) wheels[1].rotation.y = steer * 0.32;
    return { nos: boosting, speedKmh: Math.abs(this.speed) * 3.2 };
  }
  damageBy(amount, armorMod) {
    this.damage = Math.min(100, this.damage + amount / armorMod);
    return this.damage;
  }
  repair() { this.damage = 0; }
}

const TRAFFIC_COLORS = [0xc0c0c0, 0x8a2f2f, 0x2f5a8a, 0x5a8a2f, 0xd8b13c, 0x777777, 0x3a3a3a, 0x9a6a3f];
export class Traffic {
  constructor(scene) {
    this.cars = [];
    const rnd = mulberry32(777);
    for (let i = 0; i < 14; i++) {
      const mesh = makeCarMesh(TRAFFIC_COLORS[i % TRAFFIC_COLORS.length]);
      scene.add(mesh);
      const horizontal = rnd() < 0.5;
      const dir = rnd() < 0.5 ? 1 : -1;
      const road = (Math.floor(rnd() * 12) - 6) * 100;
      // Right-hand traffic: each direction keeps to its own lane, so
      // oncoming cars pass 6 units apart and never sideswipe each other
      // (or the player driving in its own lane).
      const lane = road + (horizontal ? (dir > 0 ? 3 : -3) : (dir > 0 ? -3 : 3));
      this.cars.push({ mesh, horizontal, lane, t: rnd() * 1200 - 600, dir, speed: 9 + rnd() * 7 });
    }
  }
  update(dt) {
    for (const c of this.cars) {
      c.t += c.speed * c.dir * dt;
      if (c.t > 600) c.t = -600;
      if (c.t < -600) c.t = 600;
      if (c.horizontal) {
        c.mesh.position.set(c.t, 0, c.lane);
        c.mesh.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        c.mesh.position.set(c.lane, 0, c.t);
        c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI;
      }
      const wheels = c.mesh.userData.wheels || [];
      for (const w of wheels) w.rotation.x += c.speed * dt * 2.6;
    }
  }
}

export class Pedestrians {
  constructor(scene) {
    this.walkers = [];
    const rnd = mulberry32(4242);
    const palette = [0xe07a5f, 0x5f8ae0, 0x8ae07a, 0xd8d8d8, 0xe0c25f, 0xb25fe0];
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4),
        new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.9 }));
      shirt.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8a075, roughness: 0.8 }));
      head.position.y = 1.75;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 }));
      legs.position.y = 0.4;
      g.add(shirt, head, legs);
      scene.add(g);
      const horizontal = rnd() < 0.5;
      const lane = (Math.floor(rnd() * 12) - 6) * 100 + 8;
      this.walkers.push({
        mesh: g, horizontal, lane, t: rnd() * 1200 - 600,
        dir: rnd() < 0.5 ? 1 : -1, speed: 1.2 + rnd() * 0.8, phase: rnd() * 6,
      });
    }
  }
  update(dt, time) {
    for (const w of this.walkers) {
      w.t += w.speed * w.dir * dt;
      if (w.t > 590) w.t = -590;
      if (w.t < -590) w.t = 590;
      if (w.horizontal) {
        w.mesh.position.set(w.t, 0, w.lane);
        w.mesh.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        w.mesh.position.set(w.lane, 0, w.t);
        w.mesh.rotation.y = w.dir > 0 ? 0 : Math.PI;
      }
      w.mesh.position.y = Math.abs(Math.sin(time * 5 + w.phase)) * 0.08;
    }
  }
}
