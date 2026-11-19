// Solano Heat — the 3D renderer (Three.js, vendored under game/vendor).
// The city is built once from the shared city data: instanced towers, road
// strips, the pier and the docks. Cars, cops, pedestrians, the helicopter
// and roadblocks are pooled meshes moved every frame. Lighting follows the
// game clock: noon sun, orange dusk, neon night.
import * as THREE from '../vendor/three/three.module.min.js';
import { CITY, PALETTE } from './config.js';
import { chaseCamera } from './camera3d.js';

const CAR_BODY = { sedan: [4.4, 1.1], coupe: [4.0, 0.95], van: [4.8, 1.7], pickup: [4.6, 1.2] };

export function createWorld3d(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDay);
  scene.fog = new THREE.Fog(0x1a2233, 90, 320);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 600);

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3230, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const nightGlow = new THREE.AmbientLight(0x334466, 0.5);
  scene.add(nightGlow);

  // Ground: one big plane, grass-dark, with the water on the west edge.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.width + 400, CITY.height + 400),
    new THREE.MeshLambertMaterial({ color: 0x39543a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CITY.width / 2, -0.1, CITY.height / 2);
  scene.add(ground);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, CITY.height + 400),
    new THREE.MeshLambertMaterial({ color: 0x2e6f8e }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-40, 0.05, CITY.height / 2);
  scene.add(water);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(26, CITY.height + 400),
    new THREE.MeshLambertMaterial({ color: 0xc9b078 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(28, 0.02, CITY.height / 2);
  scene.add(sand);

  // Roads: dark strips with a pale centre line, plus sidewalks as a frame.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x555a63 });
  for (const x of city.verticals) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, CITY.height), roadMat);
    strip.position.set(x, 0.05, CITY.height / 2);
    scene.add(strip);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, CITY.height - 20), lineMat);
    line.position.set(x, 0.06, CITY.height / 2);
    scene.add(line);
  }
  for (const z of city.horizontals) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(CITY.width, 0.2, 14), roadMat);
    strip.position.set(CITY.width / 2, 0.05, z);
    scene.add(strip);
    const line = new THREE.Mesh(new THREE.BoxGeometry(CITY.width - 20, 0.22, 0.5), lineMat);
    line.position.set(CITY.width / 2, 0.06, z);
    scene.add(line);
  }
  for (let ix = 0; ix < city.verticals.length - 1; ix += 1) {
    for (let iz = 0; iz < city.horizontals.length - 1; iz += 1) {
      const walk = new THREE.Mesh(
        new THREE.BoxGeometry(city.verticals[ix + 1] - city.verticals[ix] - 14, 0.3, city.horizontals[iz + 1] - city.horizontals[iz] - 14),
        walkMat,
      );
      walk.position.set(
        (city.verticals[ix] + city.verticals[ix + 1]) / 2, 0.02,
        (city.horizontals[iz] + city.horizontals[iz + 1]) / 2,
      );
      scene.add(walk);
    }
  }

  // Buildings: one instanced mesh, one colour per tower, heights from the city.
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, city.buildings.length);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  city.buildings.forEach((b, i) => {
    matrix.makeScale(b.w, b.h, b.d);
    matrix.setPosition(b.x, b.h / 2, b.z);
    towers.setMatrixAt(i, matrix);
    colour.setHex(0x8a7f74).multiplyScalar(b.shade);
    towers.setColorAt(i, colour);
  });
  towers.instanceMatrix.needsUpdate = true;
  scene.add(towers);
  // Rooftop beacons on the tallest towers, lit at night.
  const beacons = [];
  for (const b of city.buildings) {
    if (b.h < 38) continue;
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4a3d }),
    );
    beacon.position.set(b.x, b.h + 1, b.z);
    scene.add(beacon);
    beacons.push(beacon);
  }

  // Neon strips over the Pier, on at night.
  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(90, 1.2, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xff5ad8 }),
  );
  neon.position.set(120, 14, 520);
  scene.add(neon);
  const neon2 = neon.clone();
  neon2.material = new THREE.MeshBasicMaterial({ color: 0x3de8ff });
  neon2.position.set(120, 18, 560);
  scene.add(neon2);

  // Pooled meshes: one builder for every car-shaped thing.
  function makeCar(colorHex) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.9, 4.4),
      new THREE.MeshLambertMaterial({ color: colorHex }),
    );
    body.position.y = 0.65;
    group.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.7, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
    );
    cabin.position.set(0, 1.35, -0.2);
    group.add(cabin);
    return group;
  }
  function makePed(shirtHex) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.45),
      new THREE.MeshLambertMaterial({ color: shirtHex }),
    );
    body.position.y = 1.05;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8a878 }),
    );
    head.position.y = 1.85;
    group.add(head);
    return group;
  }

  const playerCar = makeCar(0xe8b13c);
  scene.add(playerCar);
  const playerPed = makePed(0xe8b13c);
  scene.add(playerPed);
  const trafficPool = [];
  for (let i = 0; i < 30; i += 1) {
    const m = makeCar(0x888888);
    m.visible = false;
    scene.add(m);
    trafficPool.push(m);
  }
  const copPool = [];
  for (let i = 0; i < 8; i += 1) {
    const m = makeCar(0x2a4fd0);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    bar.position.y = 1.85;
    m.add(bar);
    m.visible = false;
    scene.add(m);
    copPool.push(m);
  }
  const pedPool = [];
  for (let i = 0; i < 40; i += 1) {
    const m = makePed(0x888888);
    m.visible = false;
    scene.add(m);
    pedPool.push(m);
  }
  const blockPool = [];
  for (let i = 0; i < 4; i += 1) {
    const g = new THREE.Group();
    for (let k = -1; k <= 1; k += 1) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.6, 8),
        new THREE.MeshLambertMaterial({ color: 0xe85a2e }),
      );
      cone.position.set(k * 2.2, 0.8, 0);
      g.add(cone);
    }
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.5, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xd8d3c8 }),
    );
    bar.position.y = 1.1;
    g.add(bar);
    g.visible = false;
    scene.add(g);
    blockPool.push(g);
  }

  // Helicopter with a spotlight that tracks the player.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.4, 5.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  heli.add(heliBody);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x22242a }),
  );
  rotor.position.y = 0.9;
  heli.add(rotor);
  const spot = new THREE.SpotLight(0xfff2c8, 0, 120, 0.32, 0.5, 1.2);
  spot.position.set(0, -0.8, 0);
  heli.add(spot);
  const spotTarget = new THREE.Object3D();
  scene.add(spotTarget);
  spot.target = spotTarget;
  heli.visible = false;
  scene.add(heli);

  // Mission marker: a gold beam the player can see across the city.
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf3d, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  beam.position.y = 30;
  marker.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.35, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffcf3d }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  marker.add(ring);
  marker.visible = false;
  scene.add(marker);

  function placeCar(mesh, car) {
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.angle;
    mesh.visible = true;
  }

  function draw(state, time) {
    const p = state.player;
    const cam = chaseCamera(p.x, p.z, p.angle, p.speed);
    camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
    camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 720;
    if (camera.aspect !== w / h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    // Light follows the clock: noon white, dusk orange, night blue + neon.
    const m = state.clockMinutes;
    const day = m < 360 || m >= 1140 ? 0 : m < 480 ? (m - 360) / 120 : m < 1020 ? 1 : 1 - (m - 1020) / 120;
    const dusk = Math.max(0, 1 - Math.abs(day - 0.35) / 0.35);
    sun.intensity = 0.25 + day * 1.5;
    sun.color.setHSL(0.09 + day * 0.02, 0.7, 0.55 + day * 0.15);
    hemi.intensity = 0.3 + day * 0.7;
    nightGlow.intensity = day < 0.3 ? 0.7 : 0.15;
    scene.background.setHSL(0.58 - dusk * 0.45, 0.6, 0.08 + day * 0.5);
    scene.fog.color.copy(scene.background);
    neon.visible = day < 0.35;
    neon2.visible = day < 0.35;
    for (const b of beacons) b.visible = day < 0.3;

    if (state.car) {
      placeCar(playerCar, state.car);
      playerPed.visible = false;
    } else {
      playerCar.visible = false;
      playerPed.position.set(p.x, 0, p.z);
      playerPed.rotation.y = p.angle;
      playerPed.visible = true;
    }
    state.traffic.forEach((t, i) => {
      if (i >= trafficPool.length) return;
      const mesh = trafficPool[i];
      mesh.children[0].material.color.setHex(t.color);
      placeCar(mesh, t);
    });
    for (let i = state.traffic.length; i < trafficPool.length; i += 1) trafficPool[i].visible = false;
    state.police.forEach((c, i) => {
      if (i >= copPool.length) return;
      placeCar(copPool[i], c);
    });
    for (let i = state.police.length; i < copPool.length; i += 1) copPool[i].visible = false;
    state.peds.forEach((ped, i) => {
      if (i >= pedPool.length) return;
      const mesh = pedPool[i];
      mesh.children[0].material.color.setHex(ped.shirt);
      mesh.position.set(ped.x, ped.down ? 0.4 : 0, ped.z);
      mesh.rotation.y = ped.angle;
      mesh.rotation.z = ped.down ? Math.PI / 2 : 0;
      mesh.visible = true;
    });
    for (let i = state.peds.length; i < pedPool.length; i += 1) pedPool[i].visible = false;
    state.roadblocks.forEach((rb, i) => {
      if (i >= blockPool.length) return;
      const g = blockPool[i];
      g.position.set(rb.x, 0, rb.z);
      g.rotation.y = rb.angle;
      g.visible = true;
    });
    for (let i = state.roadblocks.length; i < blockPool.length; i += 1) blockPool[i].visible = false;

    if (state.heli.active) {
      heli.visible = true;
      heli.position.set(state.heli.x, state.heli.alt, state.heli.z);
      heli.rotation.y = state.heli.angle;
      rotor.rotation.y = time * 22;
      spot.intensity = 900;
      spotTarget.position.set(p.x, 0, p.z);
    } else {
      heli.visible = false;
      spot.intensity = 0;
    }

    if (state.marker) {
      marker.visible = true;
      marker.position.set(state.marker.x, 0, state.marker.z);
      ring.rotation.z = time * 1.5;
    } else {
      marker.visible = false;
    }

    renderer.render(scene, camera);
  }

  return { draw, renderer, scene, camera };
}
