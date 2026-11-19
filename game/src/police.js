// Solano Heat — the wanted system. Police cars chase and ram, lose the
// player when line of sight breaks, roadblocks spawn ahead at four stars,
// and the police helicopter joins at four stars and stays inside the chase
// camera's view.
import * as THREE from 'three';
import { makeCarMesh, makeHeliMesh } from './vehicles.js';
import { policeCount, heliActive, roadblockActive, decayWanted } from './sim.js';

// Keep a heading difference in (-PI, PI] so cars always turn the short way.
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.heli = null;
    this.heliMesh = null;
    this.roadblocks = [];
    this.hiddenTime = 0;
    this.bustTimer = 0;
    this.lastSeen = 0;
    for (let i = 0; i < 5; i++) {
      const mesh = makeCarMesh(0x1a1a22, { police: true });
      mesh.visible = false;
      scene.add(mesh);
      this.cars.push({ mesh, x: 0, z: 0, heading: 0, speed: 0, active: false, sirenPhase: i * 1.3 });
    }
  }
  spawnHeli() {
    if (this.heliMesh) return;
    this.heliMesh = makeHeliMesh();
    this.scene.add(this.heliMesh);
    this.heli = { x: 0, z: -60, y: 30, angle: 0 };
  }
  removeHeli() {
    if (!this.heliMesh) return;
    this.scene.remove(this.heliMesh);
    this.heliMesh = null;
    this.heli = null;
  }
  spawnRoadblock(px, pz, heading) {
    this.clearRoadblocks();
    const cx = px + Math.sin(heading) * 42;
    const cz = pz + Math.cos(heading) * 42;
    this.roadblockCenter = { x: cx, z: cz };
    for (const off of [-4, 0, 4]) {
      const mesh = makeCarMesh(0x1a1a22, { police: true });
      const ax = Math.cos(heading);
      const az = -Math.sin(heading);
      const x = px + Math.sin(heading) * 42 + ax * off;
      const z = pz + Math.cos(heading) * 42 + az * off;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading + Math.PI / 2;
      this.scene.add(mesh);
      this.roadblocks.push(mesh);
    }
  }
  clearRoadblocks() {
    for (const m of this.roadblocks) this.scene.remove(m);
    this.roadblocks = [];
  }
  // Returns events for the game loop: { busted, spotted, heliVisible }.
  update(dt, player, wanted, time) {
    const ev = { busted: false, spotted: false, heliVisible: false };
    const want = policeCount(wanted);
    let nearest = 1e9;
    this.cars.forEach((c, i) => {
      if (i >= want) {
        c.active = false;
        c.mesh.visible = false;
        return;
      }
      if (!c.active) {
        // Join the chase from behind the player, not head-on: a police car
        // spawning ahead drives straight into the camera and blocks the
        // view. Spawn within sight range and slightly faster than the
        // player, or the chase falls behind at once and the heat decays.
        const a = player.heading + Math.PI + (Math.random() - 0.5) * Math.PI * 0.8;
        c.x = player.x + Math.sin(a) * 55;
        c.z = player.z + Math.cos(a) * 55;
        c.speed = 20;
        c.active = true;
        c.mesh.visible = true;
      }
      const dx = player.x - c.x;
      const dz = player.z - c.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      const targetHeading = Math.atan2(dx, dz);
      const dh = wrapAngle(targetHeading - c.heading);
      c.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, dh));
      c.speed = Math.min(44, c.speed + 10 * dt);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const bar = c.mesh.userData.lightBar;
      if (bar) {
        const on = Math.sin(time * 9 + c.sirenPhase) > 0;
        bar.material.emissive.setHex(on ? 0x2244ff : 0xff2222);
        bar.material.color.setHex(on ? 0x2244ff : 0xff2222);
      }
      if (dist < 3.2) ev.spotted = true;
    });
    // Line of sight: the player counts as seen while any police car is close.
    if (nearest < 55) {
      this.hiddenTime = 0;
      this.lastSeen = time;
    } else {
      this.hiddenTime += dt;
    }
    // Busted: slow and surrounded.
    if (wanted > 0 && nearest < 4 && Math.abs(player.speed) < 2) {
      this.bustTimer += dt;
      if (this.bustTimer > 2.5) ev.busted = true;
    } else {
      this.bustTimer = 0;
    }
    // Helicopter: flies ahead of the player, low enough to stay in the
    // chase camera's frame, spotlight locked on the player's car.
    if (heliActive(wanted)) {
      this.spawnHeli();
      const h = this.heli;
      h.angle += dt * 0.35;
      const ax = Math.sin(player.heading);
      const az = Math.cos(player.heading);
      // Low and close ahead: at 14 units up and 18 ahead the helicopter
      // stays inside the chase camera's frame instead of hovering above it.
      const tx = player.x + ax * 18 + Math.sin(h.angle) * 5;
      const tz = player.z + az * 18 + Math.cos(h.angle) * 5;
      h.x += (tx - h.x) * Math.min(1, dt * 1.6);
      h.z += (tz - h.z) * Math.min(1, dt * 1.6);
      h.y += (14 - h.y) * Math.min(1, dt);
      this.heliMesh.position.set(h.x, h.y, h.z);
      this.heliMesh.rotation.y = Math.atan2(player.x - h.x, player.z - h.z);
      this.heliMesh.userData.rotor.rotation.y += dt * 22;
      const beacon = this.heliMesh.userData.beacon;
      if (beacon) beacon.material.emissiveIntensity = Math.sin(time * 6) > 0 ? 2.5 : 0.2;
      this.heliMesh.userData.spot.target.position.set(player.x, 0, player.z);
      this.heliMesh.userData.spot.target.updateMatrixWorld();
      ev.heliVisible = true;
    } else {
      this.removeHeli();
    }
    // Roadblocks: one wall of cars ahead of the player's direction, moved
    // ahead again once the player has driven past it, so the chase always
    // has a wall to face.
    if (roadblockActive(wanted)) {
      if (this.roadblocks.length === 0) {
        this.spawnRoadblock(player.x, player.z, player.heading);
      } else if (this.roadblockCenter && Math.hypot(player.x - this.roadblockCenter.x, player.z - this.roadblockCenter.z) > 90) {
        this.spawnRoadblock(player.x, player.z, player.heading);
      }
    } else if (this.roadblocks.length) {
      this.clearRoadblocks();
    }
    ev.hiddenSeconds = this.hiddenTime;
    return ev;
  }
  decayCheck(wanted, dt) {
    if (wanted <= 0) return wanted;
    return decayWanted(wanted, this.hiddenTime, this.hiddenTime > 2);
  }
}
