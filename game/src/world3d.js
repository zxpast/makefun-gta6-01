// The 3D view: Three.js renders the city the sim rules over. Buildings are one
// instanced mesh, cars are small box groups, the helicopter carries a spotlight cone,
// and the camera is the same chase camera the screenshot painter uses.
import * as THREE from 'three';
import { CAMERA, COLORS, HELI, WORLD } from './config.js';
import { chaseCamera } from './camera3d.js';

function hex(color) {
  return new THREE.Color(color);
}

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: hex(color) }));
  mesh.castShadow = false;
  return mesh;
}

function makeCar(color) {
  const group = new THREE.Group();
  const body = box(2, 0.7, 4.4, color);
  body.position.y = 0.55;
  group.add(body);
  const cabin = box(1.7, 0.6, 2.2, '#1c2733');
  cabin.position.set(0, 1.15, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.BoxGeometry(0.35, 0.7, 0.7);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, 0.35, z);
    group.add(wheel);
  }
  return group;
}

export function createWorld3d(canvas, sim) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.skyDay);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 1200);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const city = sim.city;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width + 120, WORLD.depth + 120),
    new THREE.MeshLambertMaterial({ color: hex(COLORS.grass) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Roads: dark strips with a dashed centre line.
  const roadMat = new THREE.MeshLambertMaterial({ color: hex(COLORS.road) });
  const lineMat = new THREE.MeshLambertMaterial({ color: hex(COLORS.roadLine) });
  for (const x of city.roadsX) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(14, WORLD.depth), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.02, 0);
    scene.add(strip);
    for (let z = -280; z <= 280; z += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 8), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.04, z);
      scene.add(dash);
    }
  }
  for (const z of city.roadsZ) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, 14), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.02, z);
    scene.add(strip);
    for (let x = -440; x <= 440; x += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.5), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.04, z);
      scene.add(dash);
    }
  }

  // Buildings, one instanced mesh; neon buildings get a glowing sign strip.
  const buildings = city.buildings;
  const buildingMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    buildings.length,
  );
  const dummy = new THREE.Object3D();
  buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    buildingMesh.setMatrixAt(i, dummy.matrix);
    buildingMesh.setColorAt(i, hex(b.color));
  });
  scene.add(buildingMesh);
  const neonMat = new THREE.MeshBasicMaterial({ color: hex(COLORS.neonPink) });
  for (const b of buildings) {
    if (!b.neon) continue;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.7, 0.5, 0.3), neonMat);
    sign.position.set(b.x, b.h + 0.4, b.z + b.d / 2 + 0.2);
    scene.add(sign);
  }

  // The player's car, police cars, traffic and parked cars.
  const playerCar = makeCar(COLORS.playerCar);
  scene.add(playerCar);
  const policeCars = [];
  for (let i = 0; i < 5; i += 1) {
    const cop = makeCar(COLORS.policeCar);
    const bar = box(1.4, 0.25, 0.5, '#2244ff');
    bar.position.set(0, 1.55, -0.2);
    cop.add(bar);
    cop.visible = false;
    scene.add(cop);
    policeCars.push(cop);
  }
  // Roadblocks: the same car shape in warning orange, two per block, so a
  // wanted-4 chase shows the wall the sim is steering the player through.
  const roadblockMeshes = [];
  for (let i = 0; i < 8; i += 1) {
    const mesh = makeCar('#ff6b00');
    mesh.visible = false;
    scene.add(mesh);
    roadblockMeshes.push(mesh);
  }
  const trafficMeshes = sim.state.traffic.map((car) => {
    const mesh = makeCar(car.color);
    scene.add(mesh);
    return mesh;
  });
  const parkedMeshes = city.parked.map((car) => {
    const mesh = makeCar(car.color);
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.angle;
    scene.add(mesh);
    return mesh;
  });

  // Pedestrians: one instanced mesh of small figures.
  const pedMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 1.8, 0.7),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
    sim.state.peds.length,
  );
  scene.add(pedMesh);

  // The helicopter: body, tail, spinning rotor, spotlight cone.
  const heli = new THREE.Group();
  const heliBody = box(3.2, 1.4, 6, COLORS.heliBody);
  heliBody.position.y = 0;
  heli.add(heliBody);
  const tail = box(0.8, 0.8, 5, COLORS.heliBody);
  tail.position.set(0, 0.2, -5);
  heli.add(tail);
  const rotor = box(9, 0.12, 0.6, '#111111');
  rotor.position.y = 1;
  heli.add(rotor);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(HELI.spotlight / 2, HELI.altitude, 20, 1, true), coneMat);
  cone.position.y = -HELI.altitude / 2;
  cone.rotation.x = Math.PI;
  heli.add(cone);
  heli.visible = false;
  scene.add(heli);

  // The mission marker: a floating octahedron over the current target.
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: hex(COLORS.neonCyan) }),
  );
  scene.add(marker);

  let cam = null;
  const daySky = hex(COLORS.skyDay);
  const duskSky = hex(COLORS.skyDusk);
  const nightSky = hex(COLORS.skyNight);

  function skyColor(daylight) {
    if (daylight > 0.6) return daySky.clone().lerp(duskSky, (1 - daylight) / 0.4);
    return duskSky.clone().lerp(nightSky, (0.6 - daylight) / 0.5);
  }

  function update(dt, markerTarget) {
    const s = sim.state;
    const p = s.player;
    cam = chaseCamera(p, cam, dt);
    camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
    camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    const light = sim.daylight();
    scene.background = skyColor(light);
    sun.intensity = 0.25 + light * 0.9;
    playerCar.visible = !p.onFoot && s.car !== null;
    if (playerCar.visible) {
      playerCar.position.set(s.car.x, 0, s.car.z);
      playerCar.rotation.y = s.car.angle;
    }
    s.police.forEach((cop, i) => {
      const mesh = policeCars[i];
      if (mesh === undefined) return;
      mesh.visible = true;
      mesh.position.set(cop.x, 0, cop.z);
      mesh.rotation.y = cop.angle;
    });
    for (let i = s.police.length; i < policeCars.length; i += 1) policeCars[i].visible = false;
    s.roadblocks.forEach((block, i) => {
      const mesh = roadblockMeshes[i];
      if (mesh === undefined) return;
      mesh.visible = true;
      mesh.position.set(block.x, 0, block.z);
      mesh.rotation.y = block.angle;
    });
    for (let i = s.roadblocks.length; i < roadblockMeshes.length; i += 1) roadblockMeshes[i].visible = false;
    s.traffic.forEach((car, i) => {
      const mesh = trafficMeshes[i];
      if (mesh === undefined) return;
      mesh.visible = !car.wrecked;
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.angle;
    });
    s.peds.forEach((ped, i) => {
      dummy.position.set(ped.x, ped.down >= 0 ? 0.3 : 0.9, ped.z);
      dummy.scale.set(1, ped.down >= 0 ? 0.4 : 1, 1);
      dummy.rotation.set(0, ped.angle, 0);
      dummy.updateMatrix();
      pedMesh.setMatrixAt(i, dummy.matrix);
    });
    pedMesh.instanceMatrix.needsUpdate = true;
    heli.visible = s.heli.active;
    if (s.heli.active) {
      heli.position.set(s.heli.x, HELI.altitude, s.heli.z);
      rotor.rotation.y += dt * 22;
      cone.visible = light < 0.7;
    }
    if (markerTarget !== null && markerTarget !== undefined) {
      marker.visible = true;
      marker.position.set(markerTarget.x, 5 + Math.sin(s.elapsed * 3) * 0.8, markerTarget.z);
      marker.rotation.y += dt * 2;
    } else {
      marker.visible = false;
    }
    // Parked cars vanish from the scene once stolen; the mesh list is rebuilt lazily.
    city.parked.forEach((car, i) => {
      const mesh = parkedMeshes[i];
      if (mesh !== undefined) {
        mesh.visible = true;
        mesh.position.set(car.x, 0, car.z);
        mesh.rotation.y = car.angle;
      }
    });
    for (let i = city.parked.length; i < parkedMeshes.length; i += 1) parkedMeshes[i].visible = false;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  return {
    update,
    render() {
      renderer.render(scene, camera);
    },
  };
}
