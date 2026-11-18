// The 3D view of Port Solano: Three.js, chase camera, procedural city.
//
// Everything is generated in code — no external assets, no network. The
// buildings are one InstancedMesh, the roads one merged geometry, the lamps
// and pedestrians instanced too, so the whole city draws in a few dozen
// draw calls. The camera is the shared chase camera from camera3d.js, the
// same one the screenshot painter uses, so the browser and the screenshots
// show the same view. Sun, sky and fog follow the in-game clock: dusk
// turns to neon night as the wanted level climbs.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { chaseCamera, isNight, skyColorFor } from './camera3d.js';
import { HELI } from './config.js';

const HELI_Y = HELI.hoverHeight;

function rgb(arr) {
  return new THREE.Color(arr[0] / 255, arr[1] / 255, arr[2] / 255);
}

function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a5566';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      ctx.fillStyle = (x + y) % 48 === 0 ? '#ffd166' : '#232833';
      ctx.fillRect(x, y, 9, 11);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Merge a list of axis-aligned quads (each {x0,z0,x1,z1,y, color}) into one
// BufferGeometry with vertex colours. Used for roads, sidewalks and dashes.
function mergeQuads(quads) {
  const positions = [];
  const colors = [];
  const indices = [];
  let base = 0;
  for (const q of quads) {
    const c = q.color;
    positions.push(q.x0, q.y, q.z0, q.x1, q.y, q.z0, q.x1, q.y, q.z1, q.x0, q.y, q.z1);
    for (let i = 0; i < 4; i += 1) colors.push(c[0], c[1], c[2]);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createWorld3D(container, simState) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x87b5e0, 90, 420);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 600);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2f28, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd98a, 1.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.25);
  moon.position.set(-80, 140, -100);
  scene.add(moon);

  const city = simState.city;
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Ground: one big slab, district-tinted by a second merged layer.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.width + 120, CITY.height + 120),
    new THREE.MeshLambertMaterial({ color: rgb(PALETTE.ground) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CITY.width / 2, -0.05, CITY.height / 2);
  scene.add(ground);

  // Roads + sidewalks + lane dashes, merged into one geometry.
  const quads = [];
  for (const d of city.districts) {
    quads.push({ x0: d.x, z0: d.z, x1: d.x + d.w, z1: d.z + d.h, y: 0.02, color: [0.16, 0.16, 0.18] });
  }
  for (const rx of city.roads.vertical) {
    quads.push({ x0: rx - city.halfRoad, z0: 0, x1: rx + city.halfRoad, z1: CITY.height, y: 0.06, color: [0.11, 0.11, 0.13] });
  }
  for (const rz of city.roads.horizontal) {
    quads.push({ x0: 0, z0: rz - city.halfRoad, x1: CITY.width, z1: rz + city.halfRoad, y: 0.06, color: [0.11, 0.11, 0.13] });
  }
  for (const rx of city.roads.vertical) {
    for (let z = 20; z < CITY.height; z += 24) {
      quads.push({ x0: rx - 0.4, z0: z, x1: rx + 0.4, z1: z + 10, y: 0.09, color: [0.85, 0.79, 0.48] });
    }
  }
  for (const rz of city.roads.horizontal) {
    for (let x = 20; x < CITY.width; x += 24) {
      quads.push({ x0: x, z0: rz - 0.4, x1: x + 10, z1: rz + 0.4, y: 0.09, color: [0.85, 0.79, 0.48] });
    }
  }
  const roadMesh = new THREE.Mesh(
    mergeQuads(quads),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  roadMesh.matrixAutoUpdate = false;
  scene.add(roadMesh);

  // Buildings: one InstancedMesh, one window texture, per-instance colour.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const boxMat = new THREE.MeshLambertMaterial({ map: windowTexture() });
  const buildings = new THREE.InstancedMesh(boxGeo, boxMat, city.buildings.length);
  buildings.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  city.buildings.forEach((b, i) => {
    dummy.position.set(b.x + b.w / 2, 0, b.z + b.h / 2);
    dummy.scale.set(b.w, b.height, b.h);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    const shade = b.shade === 'a' ? PALETTE.buildingA : b.shade === 'b' ? PALETTE.buildingB : PALETTE.buildingC;
    buildings.setColorAt(i, tmpColor.setRGB(shade[0] / 255, shade[1] / 255, shade[2] / 255));
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // Neon signs on a fifth of the buildings: one instanced emissive strip.
  const neonSpots = city.buildings.filter((b) => b.neon).slice(0, 40);
  const neon = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    Math.max(1, neonSpots.length),
  );
  neonSpots.forEach((b, i) => {
    dummy.position.set(b.x + b.w / 2, Math.min(b.height * 0.8, 24), b.z - 0.3);
    dummy.scale.set(Math.min(b.w * 0.7, 18), 1.1, 0.4);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    neon.setMatrixAt(i, dummy.matrix);
    const c = i % 2 === 0 ? PALETTE.neonPink : PALETTE.neonCyan;
    neon.setColorAt(i, tmpColor.setRGB(c[0] / 255, c[1] / 255, c[2] / 255));
  });
  neon.instanceMatrix.needsUpdate = true;
  if (neon.instanceColor) neon.instanceColor.needsUpdate = true;
  scene.add(neon);

  // Street lamps along the roads, instanced; they glow at night.
  const lampPositions = [];
  for (const rx of city.roads.vertical) {
    for (let z = 40; z < CITY.height; z += 80) lampPositions.push([rx + 8, z]);
  }
  for (const rz of city.roads.horizontal) {
    for (let x = 40; x < CITY.width; x += 80) lampPositions.push([x, rz + 8]);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 6, 5), lampMat, lampPositions.length);
  lampPositions.forEach((p, i) => {
    dummy.position.set(p[0], 6.5, p[1]);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });
  lamps.instanceMatrix.needsUpdate = true;
  scene.add(lamps);

  // Water at the south edge and the pier: flat coloured slabs.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(city.water.w, city.water.h),
    new THREE.MeshLambertMaterial({ color: rgb(PALETTE.water) }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(city.water.w / 2, 0.04, city.water.z + city.water.h / 2);
  scene.add(water);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(city.pier.w, 1.2, city.pier.h),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  );
  pier.position.set(city.pier.x + city.pier.w / 2, 0.6, city.pier.z + city.pier.h / 2);
  scene.add(pier);

  // --- Dynamic objects: cars, peds, police, heli, roadblocks, marker ---
  function makeCarMesh(bodyColor, withLightBar) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.85, 2.0),
      new THREE.MeshLambertMaterial({ color: bodyColor }),
    );
    body.position.y = 0.62;
    group.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.7, 1.7),
      new THREE.MeshLambertMaterial({ color: 0x14161f }),
    );
    cabin.position.set(-0.3, 1.35, 0);
    group.add(cabin);
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.35, 2.05),
      new THREE.MeshLambertMaterial({ color: 0x0c0c10 }),
    );
    skirt.position.y = 0.22;
    group.add(skirt);
    let light = null;
    if (withLightBar) {
      light = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.25, 1.5),
        new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
      );
      light.position.set(-0.3, 1.85, 0);
      group.add(light);
    }
    scene.add(group);
    return { group, light };
  }

  const carMeshes = new Map();
  function carMeshFor(car) {
    let mesh = carMeshes.get(car.id);
    if (mesh) return mesh;
    const isCop = car.kind === 'cop' || car.kind === 'target';
    const color = isCop
      ? 0x1e222c
      : car.kind === 'taxi'
        ? 0xf2c94c
        : car.kind === 'fast'
          ? 0xc74a3a
          : 0x7fa3c7;
    mesh = makeCarMesh(color, isCop);
    carMeshes.set(car.id, mesh);
    return mesh;
  }

  const playerMesh = makeCarMesh(0xe8b93a, false);
  const footMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 0.9, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0xf2c94c }),
  );
  footMesh.position.y = 1.1;
  scene.add(footMesh);

  const pedMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.45, 0.8, 3, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    Math.max(1, simState.peds.length),
  );
  pedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pedMesh);

  const heliGroup = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 1.6, 2.4),
    new THREE.MeshLambertMaterial({ color: 0x22242e }),
  );
  heliGroup.add(heliBody);
  const heliTail = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.7, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x22242e }),
  );
  heliTail.position.set(-4.4, 0.3, 0);
  heliGroup.add(heliTail);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.12, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x888888 }),
  );
  rotor.position.y = 1.1;
  heliGroup.add(rotor);
  const spot = new THREE.Mesh(
    new THREE.ConeGeometry(9, 55, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  spot.position.y = -27;
  heliGroup.add(spot);
  scene.add(heliGroup);

  const blockMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(7, 1.4, 1.2),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
    3,
  );
  scene.add(blockMesh);

  const markerRing = new THREE.Mesh(
    new THREE.TorusGeometry(6, 0.5, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c }),
  );
  markerRing.rotation.x = -Math.PI / 2;
  scene.add(markerRing);
  const markerBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  scene.add(markerBeam);

  let prevCam = null;
  let shake = 0;

  function resize() {
    const w = container.clientWidth || 1280;
    const h = container.clientHeight || 720;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function render(state, marker, dt, timeSec) {
    const p = state.player;
    const cam = chaseCamera(p.x, p.z, p.angle, prevCam, dt || 0.016);
    prevCam = cam;
    // A little shake on impacts: decays fast, scales with the last hit.
    if (shake > 0) shake = Math.max(0, shake - dt * 6);
    const shx = shake > 0 ? (Math.sin(timeSec * 61) * shake * 0.35) : 0;
    const shy = shake > 0 ? (Math.cos(timeSec * 53) * shake * 0.25) : 0;
    camera.position.set(cam.x + shx, cam.y + shy, cam.z);
    camera.lookAt(cam.lx, cam.ly, cam.lz);

    // Sky, fog and lights follow the clock.
    const sky = skyColorFor(state.clock);
    const skyColor = new THREE.Color(sky[0] / 255, sky[1] / 255, sky[2] / 255);
    scene.background = skyColor;
    scene.fog.color = skyColor;
    const night = isNight(state.clock);
    sun.intensity = night ? 0.25 : 1.4;
    moon.intensity = night ? 0.7 : 0.1;
    hemi.intensity = night ? 0.35 : 0.9;
    lampMat.color.setHex(night ? 0xffd166 : 0x555544);
    neon.visible = night || state.clock > 0.6;

    // Player: car or on foot.
    if (p.inCar) {
      playerMesh.group.visible = true;
      footMesh.visible = false;
      playerMesh.group.position.set(p.inCar.x, 0, p.inCar.z);
      playerMesh.group.rotation.y = -p.inCar.angle;
    } else {
      playerMesh.group.visible = false;
      footMesh.visible = true;
      footMesh.position.set(p.x, 1.1, p.z);
      footMesh.rotation.y = -p.angle;
    }

    // Traffic and parked cars.
    const seen = new Set();
    for (const car of state.cars) {
      const mesh = carMeshFor(car);
      seen.add(car.id);
      mesh.group.visible = !car.playerDriven;
      mesh.group.position.set(car.x, 0, car.z);
      mesh.group.rotation.y = -car.angle;
    }
    for (const [id, mesh] of carMeshes) {
      if (id !== undefined && !seen.has(id) && mesh !== playerMesh) {
        // Stale meshes (a car that left the sim) hide instead of lingering.
        mesh.group.visible = false;
      }
    }
    // Police cars, with flashing light bars.
    for (const cop of state.police) {
      const mesh = carMeshFor(cop);
      mesh.group.visible = cop.disabled <= 0;
      mesh.group.position.set(cop.x, 0, cop.z);
      mesh.group.rotation.y = -cop.angle;
      if (mesh.light) {
        const red = Math.floor(cop.siren / 0.45) % 2 === 0;
        mesh.light.material.color.setHex(red ? 0xff3b30 : 0x3b7bff);
      }
    }

    // Pedestrians, instanced.
    state.peds.forEach((ped, i) => {
      dummy.position.set(ped.x, ped.down > 0 ? 0.35 : 1.05, ped.z);
      dummy.scale.set(1, ped.down > 0 ? 0.5 : 1, 1);
      dummy.rotation.set(ped.down > 0 ? Math.PI / 2 : 0, -ped.angle, 0);
      dummy.updateMatrix();
      pedMesh.setMatrixAt(i, dummy.matrix);
      pedMesh.setColorAt(i, tmpColor.set(ped.color));
    });
    pedMesh.instanceMatrix.needsUpdate = true;
    if (pedMesh.instanceColor) pedMesh.instanceColor.needsUpdate = true;

    // Helicopter with its spotlight cone.
    const heli = state.heli;
    heliGroup.visible = heli.active;
    if (heli.active) {
      heliGroup.position.set(heli.x, HELI_Y, heli.z);
      heliGroup.rotation.y = -heli.angle;
      rotor.rotation.y = heli.rotor;
      spot.visible = true;
    }

    // Roadblocks.
    state.roadblocks.forEach((block, i) => {
      dummy.position.set(block.x, 0.7, block.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, -block.angle, 0);
      dummy.updateMatrix();
      blockMesh.setMatrixAt(i, dummy.matrix);
    });
    blockMesh.count = state.roadblocks.length;
    blockMesh.instanceMatrix.needsUpdate = true;

    // Mission marker: a pulsing ring and a beam of light.
    if (marker) {
      const pulse = 1 + Math.sin(timeSec * 4) * 0.18;
      markerRing.visible = true;
      markerBeam.visible = true;
      markerRing.position.set(marker.x, 0.4, marker.z);
      markerRing.scale.set(pulse, pulse, 1);
      markerBeam.position.set(marker.x, 30, marker.z);
    } else {
      markerRing.visible = false;
      markerBeam.visible = false;
    }

    renderer.render(scene, camera);
  }

  return {
    render,
    addShake(amount) {
      shake = Math.min(1.2, shake + amount);
    },
    drawCalls() {
      return renderer.info.render.calls;
    },
    triangles() {
      return renderer.info.render.triangles;
    },
    domElement: renderer.domElement,
  };
}
