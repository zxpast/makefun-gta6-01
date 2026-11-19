// Solano Heat — the city of Solano Bay. A deterministic procedural city:
// sixteen named districts on a road grid, instanced buildings, palms, lamps,
// a canvas road texture, and golden-hour / dusk / night lighting moods.
import * as THREE from 'three';
import { CITY_HALF, CELL, DISTRICTS, mulberry32 } from './sim.js';

export const ROAD_STEP = 100;

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#3d3d44'; g.fillRect(0, 0, 1024, 1024);
  const px = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * 1024;
  // District washes.
  for (const d of DISTRICTS) {
    const x0 = px(d.gx * CELL - CITY_HALF), z0 = px(d.gz * CELL - CITY_HALF);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.fillRect(x0, z0, CELL / 1200 * 1024, CELL / 1200 * 1024);
  }
  // Blocks.
  g.fillStyle = '#4c4c55';
  for (let x = -CITY_HALF; x < CITY_HALF; x += ROAD_STEP) {
    for (let z = -CITY_HALF; z < CITY_HALF; z += ROAD_STEP) {
      g.fillRect(px(x + 8), px(z + 8), (ROAD_STEP - 16) / 1200 * 1024, (ROAD_STEP - 16) / 1200 * 1024);
    }
  }
  // Road centre dashes.
  g.fillStyle = '#d8c25a';
  for (let v = -CITY_HALF; v <= CITY_HALF; v += ROAD_STEP) {
    for (let t = -CITY_HALF; t < CITY_HALF; t += 24) {
      g.fillRect(px(v) - 1, px(t), 2, 10);
      g.fillRect(px(t), px(v) - 1, 10, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,20,0.72)';
  g.beginPath(); g.roundRect(6, 18, 500, 92, 18); g.fill();
  g.strokeStyle = '#f5c542'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#ffffff'; g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 66);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(60, 15, 1);
  return s;
}

export function buildCity(scene) {
  const rnd = mulberry32(20261119);
  const group = new THREE.Group();
  group.name = 'city';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Marina water at the north-east corner.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x1e6f8e, roughness: 0.25, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(450, 0.5, -450);
  group.add(water);

  // Buildings: one InstancedMesh, colour per district tint.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const placements = [];
  for (let bx = -CITY_HALF; bx < CITY_HALF; bx += ROAD_STEP) {
    for (let bz = -CITY_HALF; bz < CITY_HALF; bz += ROAD_STEP) {
      if (bx === 300 && bz === -500) continue; // marina water
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = 22 + rnd() * 30, d = 22 + rnd() * 30;
        const h = 14 + rnd() * rnd() * 90 + (Math.abs(bx) < 200 && Math.abs(bz) < 200 ? 40 : 0);
        const x = bx + 14 + rnd() * (ROAD_STEP - 28 - w) + w / 2;
        const z = bz + 14 + rnd() * (ROAD_STEP - 28 - d) + d / 2;
        placements.push({ x, z, w, d, h });
      }
    }
  }
  const inst = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    pos.set(p.x, p.h / 2, p.z); sc.set(p.w, p.h, p.d);
    m4.compose(pos, q, sc); inst.setMatrixAt(i, m4);
    const gx = Math.floor((p.x + CITY_HALF) / CELL), gz = Math.floor((p.z + CITY_HALF) / CELL);
    const d = DISTRICTS[Math.min(15, Math.max(0, gz * 4 + gx))];
    col.setHex(d.tint).multiplyScalar(0.75 + rnd() * 0.5);
    inst.setColorAt(i, col);
  });
  inst.castShadow = true; inst.receiveShadow = true;
  group.add(inst);
  // Collision boxes for the car, on the group so the game loop can read them.
  group.userData.colliders = placements.map(p => ({ cx: p.x, cz: p.z, hw: p.w / 2, hd: p.d / 2 }));

  // Rooftop water towers on a few tall buildings.
  const towerGeo = new THREE.CylinderGeometry(3, 3, 8, 8);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, 24);
  for (let i = 0; i < 24; i++) {
    const p = placements[Math.floor(rnd() * placements.length)];
    pos.set(p.x, p.h + 4, p.z); sc.set(1, 1, 1);
    m4.compose(pos, q, sc); towers.setMatrixAt(i, m4);
  }
  group.add(towers);

  // Palms along the boulevards.
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 12, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(6, 7, 7);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4f, roughness: 0.9 });
  const palmSpots = [];
  for (let v = -550; v <= 550; v += 100) {
    for (const off of [-46, 46]) {
      if (rnd() < 0.75) palmSpots.push([v + off, -550 + Math.floor(rnd() * 12) * 100]);
      if (rnd() < 0.75) palmSpots.push([-550 + Math.floor(rnd() * 12) * 100, v + off]);
    }
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    pos.set(x, 6, z); sc.set(1, 1, 1); m4.compose(pos, q, sc); trunks.setMatrixAt(i, m4);
    pos.set(x, 14, z); m4.compose(pos, q, sc); leaves.setMatrixAt(i, m4);
  });
  group.add(trunks); group.add(leaves);

  // Street lamps: pole + glowing head.
  const poleGeo = new THREE.CylinderGeometry(0.35, 0.35, 9, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.6, metalness: 0.5 });
  const headGeo = new THREE.SphereGeometry(1.1, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.6 });
  const lampSpots = [];
  for (let v = -500; v <= 500; v += 100) {
    lampSpots.push([v, -450]); lampSpots.push([v, 450]);
    lampSpots.push([-450, v]); lampSpots.push([450, v]);
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    pos.set(x, 4.5, z); sc.set(1, 1, 1); m4.compose(pos, q, sc); poles.setMatrixAt(i, m4);
    pos.set(x, 9.2, z); m4.compose(pos, q, sc); heads.setMatrixAt(i, m4);
  });
  group.add(poles); group.add(heads);

  // Floating district name plates, low enough to sit over the rooftops
  // instead of floating across the top of the frame and the HUD banner.
  for (const d of DISTRICTS) {
    const s = labelSprite(d.name);
    s.position.set(d.gx * CELL - CITY_HALF + CELL / 2, 30, d.gz * CELL - CITY_HALF + CELL / 2);
    group.add(s);
  }

  scene.add(group);
  return group;
}

export function makeBeacon(color = 0xf5c542) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4, 6, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  g.add(beam); g.add(ring);
  g.userData.ring = ring;
  return g;
}

export function setMood(scene, sun, hemi, mode) {
  // mode: 'day' | 'dusk' | 'night'
  if (mode === 'night') {
    scene.background = new THREE.Color(0x0b1026);
    scene.fog = new THREE.Fog(0x0b1026, 120, 900);
    sun.color.setHex(0x8fa8ff); sun.intensity = 0.7;
    sun.position.set(-300, 220, -200);
    hemi.intensity = 0.35;
  } else if (mode === 'dusk') {
    scene.background = new THREE.Color(0x2a1a3a);
    scene.fog = new THREE.Fog(0x3a2030, 150, 1100);
    sun.color.setHex(0xff8a3d); sun.intensity = 1.6;
    sun.position.set(-500, 90, 250);
    hemi.intensity = 0.55;
  } else {
    scene.background = new THREE.Color(0xffd9a0);
    scene.fog = new THREE.Fog(0xf2c98a, 200, 1400);
    sun.color.setHex(0xffe0b0); sun.intensity = 3.0;
    sun.position.set(400, 500, 200);
    hemi.intensity = 1.15;
  }
}
