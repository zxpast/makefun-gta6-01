// Solano Heat — the 3D render. Three.js (vendored under game/vendor/three)
// draws the city the sim rules over: instanced buildings, road strips, cars,
// pedestrians, police with light bars, the helicopter with its spotlight,
// and a floating marker over the current waypoint. The chase camera comes
// from camera3d.js, the same eye and target the screenshot painter uses.

import * as THREE from 'three';
import { GRID, HELI, PALETTE, WORLD } from './config.js';
import { CAMERA_FOV, createCamera } from './camera3d.js';

const DAY_SKY = new THREE.Color(PALETTE.skyDay);
const DUSK_SKY = new THREE.Color(PALETTE.skyDusk);
const NIGHT_SKY = new THREE.Color(PALETTE.skyNight);

function skyColor(daylight, out) {
  if (daylight > 0.55) out.copy(DAY_SKY).lerp(DUSK_SKY, (1 - daylight) / 0.45);
  else if (daylight > 0.2) out.copy(DUSK_SKY).lerp(NIGHT_SKY, (0.55 - daylight) / 0.35);
  else out.copy(NIGHT_SKY);
  return out;
}

/** A simple car: body, cabin, four wheels, in a group that moves as one. */
function makeCar(color, withLightBar) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheelGeo = new THREE.BoxGeometry(0.34, 0.62, 0.62);
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.31, wz);
    group.add(wheel);
  }
  let barLeft = null;
  let barRight = null;
  if (withLightBar) {
    const barGeo = new THREE.BoxGeometry(0.7, 0.22, 0.5);
    barLeft = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    barLeft.position.set(-0.45, 1.45, -0.2);
    barRight = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x2f6fd0 }));
    barRight.position.set(0.45, 1.45, -0.2);
    group.add(barLeft);
    group.add(barRight);
  }
  return { group, barLeft, barRight };
}

export function createWorldRenderer(canvas, sim) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d1526, 120, 620);
  // The field of view comes from camera3d.js, in radians: the browser
  // camera and the screenshot painter must frame the same picture.
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(CAMERA_FOV), 1280 / 720, 0.1, 1000);
  const chase = createCamera();

  const sun = new THREE.DirectionalLight(0xffe8b0, 1.4);
  sun.position.set(300, 400, 100);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x8090b0, 0.85);
  scene.add(ambient);

  // Ground: one big sidewalk-coloured plane, roads laid over it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, WORLD.height),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD.width / 2, 0, WORLD.height / 2);
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  for (const ax of sim.city.avenues) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(GRID.roadWidth, WORLD.height), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(ax, 0.02, WORLD.height / 2);
    scene.add(strip);
  }
  for (const sz of sim.city.streets) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, GRID.roadWidth), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(WORLD.width / 2, 0.02, sz);
    scene.add(strip);
  }

  // Buildings, instanced: one draw call for the whole city.
  const buildings = sim.city.buildings;
  const tower = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    buildings.length,
  );
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  buildings.forEach((b, i) => {
    matrix.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0);
    matrix.setPosition((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
    tower.setMatrixAt(i, matrix);
    colour.set(PALETTE.building).multiplyScalar(b.shade);
    if (b.lit) colour.lerp(new THREE.Color(PALETTE.buildingLit), 0.25);
    tower.setColorAt(i, colour);
  });
  tower.instanceMatrix.needsUpdate = true;
  if (tower.instanceColor) tower.instanceColor.needsUpdate = true;
  scene.add(tower);

  // Neon strips over the Marina and the Pier, bright after dark.
  const neonMat = new THREE.MeshBasicMaterial({ color: PALETTE.neonPink });
  const neonMat2 = new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan });
  const neons = [];
  for (let i = 0; i < 10; i += 1) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 0.8), i % 2 ? neonMat : neonMat2);
    const bx = 330 + (i % 5) * 70;
    const bz = i < 5 ? 300 : 380;
    strip.position.set(bx, 12 + (i % 3) * 6, bz);
    strip.visible = false;
    scene.add(strip);
    neons.push(strip);
  }

  // Cars: the player's (one group, recoloured per car), traffic, police, parked.
  const playerCar = makeCar(PALETTE.playerCar, false);
  scene.add(playerCar.group);
  const trafficMeshes = sim.state.traffic.map((t) => {
    const m = makeCar(t.color, false);
    scene.add(m.group);
    return m;
  });
  const parkedMeshes = sim.state.parkedCars.map((c) => {
    const m = makeCar(c.color, false);
    scene.add(m.group);
    return m;
  });
  const copMeshes = [];
  for (let i = 0; i < 4; i += 1) {
    const m = makeCar(PALETTE.copCar, true);
    m.group.visible = false;
    scene.add(m.group);
    copMeshes.push(m);
  }

  // The player on foot: a small figure.
  const walker = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), new THREE.MeshLambertMaterial({ color: PALETTE.player }));
  torso.position.y = 1.0;
  walker.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.85;
  walker.add(head);
  scene.add(walker);

  // Pedestrians.
  const pedMeshes = sim.state.peds.map(() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.35), new THREE.MeshLambertMaterial({ color: PALETTE.ped }));
    body.position.y = 0.95;
    g.add(body);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: 0xc9a06a }));
    h.position.y = 1.7;
    g.add(h);
    scene.add(g);
    return g;
  });

  // The helicopter: body, tail, spinning rotor, and a spotlight cone.
  const heliGroup = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5.2), new THREE.MeshLambertMaterial({ color: PALETTE.heli }));
  heliGroup.add(heliBody);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5), new THREE.MeshLambertMaterial({ color: PALETTE.heli }));
  heliTail.position.set(0, 0.3, -4.2);
  heliGroup.add(heliTail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x14161a }));
  rotor.position.y = 1.1;
  heliGroup.add(rotor);
  const coneMat = new THREE.MeshBasicMaterial({ color: PALETTE.spotlight, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 34, 20, 1, true), coneMat);
  cone.position.y = -17;
  heliGroup.add(cone);
  const spot = new THREE.SpotLight(0xfff3b0, 0, 90, 0.32, 0.5, 1.2);
  heliGroup.add(spot);
  heliGroup.add(spot.target);
  heliGroup.visible = false;
  scene.add(heliGroup);

  // The waypoint marker: a floating green diamond.
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.2),
    new THREE.MeshBasicMaterial({ color: PALETTE.marker }),
  );
  marker.visible = false;
  scene.add(marker);

  // Roadblock barriers.
  const barrierMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const barriers = [];
  for (let i = 0; i < 4; i += 1) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 0.5), barrierMat);
    b.visible = false;
    scene.add(b);
    barriers.push(b);
  }

  const sky = new THREE.Color();
  let elapsed = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(dt, waypoint) {
    elapsed += dt;
    const s = sim.state;
    chase.update(sim, dt);
    camera.position.set(chase.eye.x, chase.eye.y, chase.eye.z);
    camera.lookAt(chase.target.x, chase.target.y, chase.target.z);

    const light = sim.daylight();
    skyColor(light, sky);
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.intensity = 0.25 + light * 1.35;
    ambient.intensity = 0.35 + light * 0.55;
    const night = light < 0.35;
    for (const n of neons) n.visible = night;

    // The player: car or walker.
    const p = s.player;
    if (p.onFoot) {
      walker.visible = true;
      playerCar.group.visible = false;
      walker.position.set(p.x, 0, p.z);
      walker.rotation.y = p.angle;
    } else {
      walker.visible = false;
      const car = s.parkedCars[p.car];
      playerCar.group.visible = true;
      playerCar.group.position.set(car.x, 0, car.z);
      playerCar.group.rotation.y = car.angle;
    }

    // Parked cars (hidden once stolen and driven, shown again when parked).
    s.parkedCars.forEach((c, i) => {
      const m = parkedMeshes[i];
      if (p.car === c.id && !p.onFoot) {
        m.group.visible = false;
        return;
      }
      m.group.visible = true;
      m.group.position.set(c.x, 0, c.z);
      m.group.rotation.y = c.angle;
    });

    s.traffic.forEach((t, i) => {
      const m = trafficMeshes[i];
      m.group.position.set(t.x, 0, t.z);
      m.group.rotation.y = t.angle;
    });

    s.peds.forEach((ped, i) => {
      const g = pedMeshes[i];
      g.visible = ped.down <= 0;
      g.position.set(ped.x, ped.down > 0 ? -0.6 : 0, ped.z);
      g.rotation.y = ped.angle;
    });

    // Police cruisers, with alternating light bars.
    s.police.forEach((cop, i) => {
      const m = copMeshes[i];
      m.group.visible = cop.health > 0;
      m.group.position.set(cop.x, 0, cop.z);
      m.group.rotation.y = cop.angle;
      const on = Math.floor(elapsed * 4) % 2 === 0;
      if (m.barLeft) m.barLeft.visible = on;
      if (m.barRight) m.barRight.visible = !on;
    });
    for (let i = s.police.length; i < copMeshes.length; i += 1) copMeshes[i].group.visible = false;

    // Helicopter.
    const heli = s.heli;
    heliGroup.visible = heli.active;
    if (heli.active) {
      heliGroup.position.set(heli.x, HELI.altitude, heli.z);
      heliGroup.rotation.y = heli.angle;
      rotor.rotation.y = elapsed * 22;
      spot.position.set(0, 0, 0);
      spot.target.position.set(p.x - heli.x, -HELI.altitude, p.z - heli.z);
      spot.intensity = 900;
    }

    // Roadblocks.
    s.roadblocks.forEach((rb, i) => {
      const b = barriers[i];
      if (!b) return;
      b.visible = true;
      b.position.set(rb.x, 0.55, rb.z);
      b.rotation.y = rb.angle + Math.PI / 2;
    });
    for (let i = s.roadblocks.length; i < barriers.length; i += 1) barriers[i].visible = false;

    // Waypoint marker.
    if (waypoint) {
      marker.visible = true;
      marker.position.set(waypoint.x, 7 + Math.sin(elapsed * 2.4) * 1.2, waypoint.z);
      marker.rotation.y = elapsed * 1.4;
    } else {
      marker.visible = false;
    }

    renderer.render(scene, camera);
  }

  return { draw, resize, camera, chase };
}
