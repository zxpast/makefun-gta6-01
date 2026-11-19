// Solano Heat — the city of Solano Bay. A seeded procedural town: sixteen
// named districts on a road grid, instanced towers, palms, lamps, a painted
// road texture, and golden-hour, dusk and night lighting moods.
import * as THREE from 'three';
import { CITY_HALF, CELL, DISTRICTS, mulberry32 } from './sim.js';

export const ROAD_STEP = 100;

function paintGround() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const g = canvas.getContext('2d');
  g.fillStyle = '#3d3d44';
  g.fillRect(0, 0, 1024, 1024);
  const toPx = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * 1024;
  // A faint wash over each district so the map reads as neighbourhoods.
  for (const d of DISTRICTS) {
    const x0 = toPx(d.gx * CELL - CITY_HALF);
    const z0 = toPx(d.gz * CELL - CITY_HALF);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.fillRect(x0, z0, (CELL / 1200) * 1024, (CELL / 1200) * 1024);
  }
  // City blocks.
  g.fillStyle = '#4c4c55';
  for (let x = -CITY_HALF; x < CITY_HALF; x += ROAD_STEP) {
    for (let z = -CITY_HALF; z < CITY_HALF; z += ROAD_STEP) {
      g.fillRect(toPx(x + 8), toPx(z + 8), ((ROAD_STEP - 16) / 1200) * 1024, ((ROAD_STEP - 16) / 1200) * 1024);
    }
  }
  // Dashed centre lines down every road.
  g.fillStyle = '#d8c25a';
  for (let v = -CITY_HALF; v <= CITY_HALF; v += ROAD_STEP) {
    for (let t = -CITY_HALF; t < CITY_HALF; t += 24) {
      g.fillRect(toPx(v) - 1, toPx(t), 2, 10);
      g.fillRect(toPx(t), toPx(v) - 1, 10, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function districtPlate(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(10,14,20,0.72)';
  g.beginPath();
  g.roundRect(6, 18, 500, 92, 18);
  g.fill();
  g.strokeStyle = '#f5c542';
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(60, 15, 1);
  return sprite;
}

export function buildCity(scene) {
  const rnd = mulberry32(20261119);
  const group = new THREE.Group();
  group.name = 'city';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshStandardMaterial({ map: paintGround(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Marina water in the north-east corner of the map.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x1e6f8e, roughness: 0.25, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(450, 0.5, -450);
  group.add(water);

  // Towers: a single instanced mesh, coloured per district tint.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const towerSpots = [];
  for (let bx = -CITY_HALF; bx < CITY_HALF; bx += ROAD_STEP) {
    for (let bz = -CITY_HALF; bz < CITY_HALF; bz += ROAD_STEP) {
      if (bx === 300 && bz === -500) continue; // the marina water
      const count = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < count; i++) {
        const w = 22 + rnd() * 30;
        const d = 22 + rnd() * 30;
        const h = 14 + rnd() * rnd() * 90 + (Math.abs(bx) < 200 && Math.abs(bz) < 200 ? 40 : 0);
        const x = bx + 14 + rnd() * (ROAD_STEP - 28 - w) + w / 2;
        const z = bz + 14 + rnd() * (ROAD_STEP - 28 - d) + d / 2;
        towerSpots.push({ x, z, w, d, h });
      }
    }
  }
  const towers = new THREE.InstancedMesh(boxGeo, boxMat, towerSpots.length);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  // One shared composer for every instanced mesh in the city: position and
  // scale in, matrix out, so the placement loops stay short.
  function placeAt(mesh, i, x, y, z, sx = 1, sy = 1, sz = 1) {
    pos.set(x, y, z);
    scl.set(sx, sy, sz);
    m4.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m4);
  }
  towerSpots.forEach((p, i) => {
    placeAt(towers, i, p.x, p.h / 2, p.z, p.w, p.h, p.d);
    const gx = Math.floor((p.x + CITY_HALF) / CELL);
    const gz = Math.floor((p.z + CITY_HALF) / CELL);
    const d = DISTRICTS[Math.min(15, Math.max(0, gz * 4 + gx))];
    col.setHex(d.tint).multiplyScalar(0.75 + rnd() * 0.5);
    towers.setColorAt(i, col);
  });
  towers.castShadow = true;
  towers.receiveShadow = true;
  group.add(towers);
  // Collision boxes for the car, kept on the group for the game loop.
  group.userData.colliders = towerSpots.map(p => ({ cx: p.x, cz: p.z, hw: p.w / 2, hd: p.d / 2 }));

  // Water tanks on a few tall rooftops.
  const tankGeo = new THREE.CylinderGeometry(3, 3, 8, 8);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const tanks = new THREE.InstancedMesh(tankGeo, tankMat, 24);
  for (let i = 0; i < 24; i++) {
    const p = towerSpots[Math.floor(rnd() * towerSpots.length)];
    placeAt(tanks, i, p.x, p.h + 4, p.z);
  }
  group.add(tanks);

  // Palms along the boulevards.
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 12, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const crownGeo = new THREE.ConeGeometry(6, 7, 7);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4f, roughness: 0.9 });
  const palmSpots = [];
  for (let v = -550; v <= 550; v += 100) {
    for (const off of [-46, 46]) {
      if (rnd() < 0.75) palmSpots.push([v + off, -550 + Math.floor(rnd() * 12) * 100]);
      if (rnd() < 0.75) palmSpots.push([-550 + Math.floor(rnd() * 12) * 100, v + off]);
    }
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    placeAt(trunks, i, x, 6, z);
    placeAt(crowns, i, x, 14, z);
  });
  group.add(trunks);
  group.add(crowns);

  // Street lamps: pole plus a glowing head.
  const poleGeo = new THREE.CylinderGeometry(0.35, 0.35, 9, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.6, metalness: 0.5 });
  const headGeo = new THREE.SphereGeometry(1.1, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.6 });
  const lampSpots = [];
  for (let v = -500; v <= 500; v += 100) {
    lampSpots.push([v, -450]);
    lampSpots.push([v, 450]);
    lampSpots.push([-450, v]);
    lampSpots.push([450, v]);
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    placeAt(poles, i, x, 4.5, z);
    placeAt(heads, i, x, 9.2, z);
  });
  group.add(poles);
  group.add(heads);

  // Floating district name plates, low enough to sit over the rooftops
  // instead of drifting across the top of the frame and the HUD banner.
  for (const d of DISTRICTS) {
    const plate = districtPlate(d.name);
    plate.position.set(d.gx * CELL - CITY_HALF + CELL / 2, 30, d.gz * CELL - CITY_HALF + CELL / 2);
    group.add(plate);
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
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  g.add(beam, ring);
  g.userData.ring = ring;
  return g;
}

export function setMood(scene, sun, hemi, mode) {
  // mode: 'day' | 'dusk' | 'night'
  if (mode === 'night') {
    scene.background = new THREE.Color(0x0b1026);
    scene.fog = new THREE.Fog(0x0b1026, 120, 900);
    sun.color.setHex(0x8fa8ff);
    sun.intensity = 0.7;
    sun.position.set(-300, 220, -200);
    hemi.intensity = 0.35;
  } else if (mode === 'dusk') {
    scene.background = new THREE.Color(0x2a1a3a);
    scene.fog = new THREE.Fog(0x3a2030, 150, 1100);
    sun.color.setHex(0xff8a3d);
    sun.intensity = 1.6;
    sun.position.set(-500, 90, 250);
    hemi.intensity = 0.55;
  } else {
    scene.background = new THREE.Color(0xffd9a0);
    scene.fog = new THREE.Fog(0xf2c98a, 200, 1400);
    sun.color.setHex(0xffe0b0);
    sun.intensity = 3.0;
    sun.position.set(400, 500, 200);
    hemi.intensity = 1.15;
  }
}
