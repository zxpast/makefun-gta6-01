// Solano Heat, seen: the Three.js world. A dusk-lit bay city built from the
// city data — instanced towers, a painted ground plane with real streets,
// chase camera, and a helicopter whose spotlight cone stays in the frame.
// Everything expensive is built once; per frame only positions move.

import * as THREE from 'three';
import { HALF, PITCH, ROAD, BLOCK, DISTRICTS, districtCenter } from './city.js';

export function makeRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low' });
  renderer.setPixelRatio(quality === 'low' ? 0.5 : Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

function paintGround(city, quality) {
  const size = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const scale = size / (HALF * 2 + 40);
  const toPx = (v) => (v + HALF + 20) * scale;
  // Asphalt base.
  ctx.fillStyle = '#2f333a';
  ctx.fillRect(0, 0, size, size);
  // District tint washes, faint so the minimap labels stay readable.
  DISTRICTS.forEach((d, i) => {
    const c = districtCenter(i);
    ctx.fillStyle = `#${d.tint.toString(16).padStart(6, '0')}`;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(toPx(c.x - PITCH), toPx(c.z - PITCH), PITCH * 2 * scale, PITCH * 2 * scale);
  });
  ctx.globalAlpha = 1;
  // Blocks: slightly lighter slabs between the roads.
  ctx.fillStyle = '#3b4048';
  for (let bx = 0; bx < 8; bx += 1) {
    for (let bz = 0; bz < 8; bz += 1) {
      ctx.fillRect(toPx(-HALF + bx * PITCH + ROAD), toPx(-HALF + bz * PITCH + ROAD), BLOCK * scale, BLOCK * scale);
    }
  }
  // Centre dashes down every street.
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = Math.max(1, 0.35 * scale);
  ctx.setLineDash([6 * scale / 3.3, 6 * scale / 3.3]);
  for (let i = 0; i <= 8; i += 1) {
    const p = toPx(-HALF + i * PITCH + ROAD / 2);
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  ctx.setLineDash([]);
  // The bay: water along the south edge, sand where it meets the city.
  ctx.fillStyle = '#16324a';
  ctx.fillRect(0, toPx(HALF - 4), size, size - toPx(HALF - 4));
  ctx.fillStyle = '#8a7a5a';
  ctx.fillRect(0, toPx(HALF - 8), size, 4 * scale);
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeCarMesh(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x101418 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glass);
  cabin.position.set(0, 1.2, -0.25);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const wx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    lamp.position.set(wx, 0.6, 2.22);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const wx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    tail.position.set(wx, 0.6, -2.22);
    group.add(tail);
  }
  return group;
}

export function makeWalkerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc23b2a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.5), jacket);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 1.85;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
  for (const lx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), legMat);
    leg.position.set(lx, 0.35, 0);
    group.add(leg);
  }
  return group;
}

export function makeHeliMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6a7a9a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5.2), bodyMat);
  group.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 5), bodyMat);
  tail.position.set(0, 0.3, -4.6);
  group.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  group.add(rotor);
  // The spotlight beam is a separate mesh (makeSpotMesh): it has to lean
  // from the helicopter down onto the car, so it is aimed every frame.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lamp.position.set(0, -0.9, 2.4);
  group.add(lamp);
  // A red beacon on the belly, so the helicopter reads against the night sky.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  beacon.position.set(0, 1.1, 0);
  beacon.name = 'beacon';
  group.add(beacon);
  return group;
}

// The helicopter's spotlight: a cone of unit height, stretched each frame
// from the helicopter to the player, plus the pool of light on the ground.
export function makeSpotMesh() {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(5, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.name = 'cone';
  group.add(cone);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.name = 'pool';
  group.add(pool);
  group.visible = false;
  return group;
}

export function makeWorld(city, quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1f33);
  scene.fog = new THREE.Fog(0x2a1f33, 200, 560);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x1a2433, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb37a, 1.5);
  sun.position.set(120, 180, -80);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40),
    new THREE.MeshLambertMaterial({ map: paintGround(city, quality) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const towers = new THREE.InstancedMesh(box, mat, city.buildings.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  city.buildings.forEach((b, i) => {
    m4.compose(
      new THREE.Vector3(b.x, b.h / 2, b.z),
      q,
      new THREE.Vector3(b.w, b.h, b.d),
    );
    towers.setMatrixAt(i, m4);
    col.setHex(b.tint).multiplyScalar(b.shade);
    towers.setColorAt(i, col);
  });
  towers.instanceMatrix.needsUpdate = true;
  if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
  scene.add(towers);

  // Street lamps at every other intersection, for the dusk mood. Five a
  // side makes twenty-five lamps; the instance count matches exactly, so no
  // lamp is ever left at the origin with an identity matrix.
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lampCount = 25;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampCount);
  let li = 0;
  for (let i = 0; i <= 8; i += 2) {
    for (let j = 0; j <= 8; j += 2) {
      const p = { x: -HALF + i * PITCH + ROAD / 2 + 5, z: -HALF + j * PITCH + ROAD / 2 + 5 };
      m4.compose(new THREE.Vector3(p.x, 3, p.z), q, new THREE.Vector3(1, 1, 1));
      lamps.setMatrixAt(li, m4);
      m4.compose(new THREE.Vector3(p.x, 6.1, p.z), q, new THREE.Vector3(1, 1, 1));
      bulbs.setMatrixAt(li, m4);
      li += 1;
    }
  }
  lamps.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  scene.add(lamps);
  scene.add(bulbs);

  // One shared particle cloud, refilled every frame from the effects pool.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(240 * 3);
  const pCol = new Float32Array(240 * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 8, -14);

  return {
    scene, camera, points, pPos, pCol, pGeo,
    camPos: new THREE.Vector3(0, 8, -14),
    camLook: new THREE.Vector3(0, 1, 0),
  };
}

export function updateWorld(world, game, dt) {
  const { scene, camera } = world;
  const player = game.player;
  const focus = game.onFoot ? game.walker : player;
  // Chase camera: behind and above, eased toward its target so a hard turn
  // swings the view instead of snapping it.
  const back = game.onFoot ? 8 : 13.5;
  const up = game.onFoot ? 3.6 : 5.6;
  const tx = focus.x - Math.sin(focus.heading) * back;
  const tz = focus.z - Math.cos(focus.heading) * back;
  const k = Math.min(1, dt * 5);
  world.camPos.x += (tx - world.camPos.x) * k;
  world.camPos.y += (up - world.camPos.y) * k;
  world.camPos.z += (tz - world.camPos.z) * k;
  const lx = focus.x + Math.sin(focus.heading) * 11;
  const lz = focus.z + Math.cos(focus.heading) * 11;
  world.camLook.x += (lx - world.camLook.x) * k;
  world.camLook.y += (1.4 - world.camLook.y) * k;
  world.camLook.z += (lz - world.camLook.z) * k;
  const shake = game.effects ? game.effects.shake : 0;
  camera.position.set(
    world.camPos.x + (Math.random() - 0.5) * shake,
    world.camPos.y + (Math.random() - 0.5) * shake * 0.6,
    world.camPos.z,
  );
  camera.lookAt(world.camLook.x, world.camLook.y, world.camLook.z);

  // Player car and walker meshes track their bodies.
  if (game.playerMesh) {
    game.playerMesh.position.set(player.x, 0, player.z);
    game.playerMesh.rotation.y = player.heading;
    game.playerMesh.visible = !game.onFoot;
  }
  if (game.walkerMesh) {
    game.walkerMesh.position.set(game.walker.x, 0, game.walker.z);
    game.walkerMesh.rotation.y = game.walker.heading;
    game.walkerMesh.visible = game.onFoot;
  }
  if (game.trafficMeshes) {
    game.traffic.forEach((car, i) => {
      const mesh = game.trafficMeshes[i];
      if (!mesh) return;
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
    });
  }
  if (game.policeMeshes) {
    game.police.cars.forEach((car, i) => {
      const mesh = game.policeMeshes[i];
      if (!mesh) return;
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
    });
    game.policeMeshes.forEach((mesh, i) => {
      mesh.visible = i < game.police.cars.length;
    });
  }
  if (game.heliMesh) {
    const h = game.police.heli;
    game.heliMesh.visible = !!h;
    if (h) {
      game.heliMesh.position.set(h.x, h.y, h.z);
      game.heliMesh.rotation.y = h.heading;
      const rotor = game.heliMesh.getObjectByName('rotor');
      if (rotor) rotor.rotation.y = h.rotor;
    }
  }
  // Roadblocks: three cruisers parked across the street ahead.
  if (game.roadblockMeshes) {
    game.roadblockMeshes.forEach((mesh, i) => {
      const block = game.police.roadblocks[i];
      mesh.visible = !!block;
      if (block) {
        mesh.position.set(block.x, 0, block.z);
        mesh.rotation.y = block.heading;
      }
    });
  }
  // Spotlight: a beam from the helicopter down onto the player, aimed every
  // frame so the pool of light sits on the car, not on empty road.
  if (game.spotMesh) {
    const h = game.police.heli;
    game.spotMesh.visible = !!h;
    if (h) {
      const dx = h.x - player.x;
      const dy = h.y - 0;
      const dz = h.z - player.z;
      const len = Math.hypot(dx, dy, dz);
      const cone = game.spotMesh.getObjectByName('cone');
      const pool = game.spotMesh.getObjectByName('pool');
      if (cone) {
        cone.position.set((h.x + player.x) / 2, h.y / 2, (h.z + player.z) / 2);
        cone.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(dx / len, dy / len, dz / len),
        );
        cone.scale.set(1, len, 1);
      }
      if (pool) pool.position.set(player.x, 0.15, player.z);
    }
  }
  // Particles: refill the cloud from the live pool.
  const parts = game.effects ? game.effects.particles : [];
  const n = Math.min(parts.length, 240);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i += 1) {
    const p = parts[i];
    world.pPos[i * 3] = p.x;
    world.pPos[i * 3 + 1] = p.y;
    world.pPos[i * 3 + 2] = p.z;
    tmp.setHex(p.color);
    world.pCol[i * 3] = tmp.r;
    world.pCol[i * 3 + 1] = tmp.g;
    world.pCol[i * 3 + 2] = tmp.b;
  }
  world.pGeo.setDrawRange(0, n);
  world.pGeo.attributes.position.needsUpdate = true;
  world.pGeo.attributes.color.needsUpdate = true;
  // Night jobs darken the sky; day jobs keep the dusk glow.
  const night = game.night ? 0x0d1420 : 0x2a1f33;
  scene.background.setHex(night);
  scene.fog.color.setHex(night);
}
