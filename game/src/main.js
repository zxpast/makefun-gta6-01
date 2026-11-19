// Solano Heat — boot, game loop and state machine. Title, job board, free
// roam, jobs, shops, safehouses, bust and wreck flows, chase camera, on-foot
// play and carjacking, drive-by shooting, and a demo driver.
import * as THREE from 'three';
import { createState, districtAt, missionById, wantedAfterCrime, stuntRespect, daysLeft, MISSIONS, SHOPS, SAFEHOUSES } from './sim.js';
import { buildCity, setMood } from './city.js';
import { makeCarMesh, PlayerCar, Traffic, Pedestrians } from './vehicles.js';
import { Police } from './police.js';
import { MissionRunner } from './missions.js';
import { Economy } from './economy.js';
import { Hud } from './hud.js';
import { Radio } from './radio.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { loadSave, writeSave } from './save.js';

const $ = (id) => document.getElementById(id);

// Garage upgrades as driving multipliers, from the saved upgrade levels.
function modifiersFor(s) {
  return {
    engine: 1 + 0.12 * (s.upgrades.engine || 0),
    armor: 1 + 0.5 * (s.upgrades.armor || 0),
    nos: 1 + 0.6 * (s.upgrades.nos || 0),
    tires: 1 + 0.15 * (s.upgrades.tires || 0),
  };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class Game {
  constructor() {
    this.state = loadSave();
    this.mode = 'title'; // title | select | play | pause | shop | over
    this.selectIdx = Math.max(0, (this.state.nextMission || 1) - 1);
    this.shopSel = 0;
    this.wanted = 0;
    this.onFoot = false;
    this.foot = { x: 0, z: 0, heading: 0, speed: 0 };
    this.auto = new URLSearchParams(location.search).get('auto') === '1';
    this.errors = [];
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
    this.input = new Input();
    this.radio = new Radio();
    this.hud = new Hud();
    this.economy = new Economy(this.state);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.acc = 0;
    this.nearMissCd = 0;
    this.driftRespectCd = 0;
    this.saveCd = 0;
    this.initThree();
    this.runner = new MissionRunner(this.scene, this.state);
    this.police = new Police(this.scene);
    this.traffic = new Traffic(this.scene);
    this.peds = new Pedestrians(this.scene);
    this.effects = new Effects(this.scene);
    this.buildPlayer();
    this.bindMouse();
    this.showTitle();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  initThree() {
    // ?quality=low trades shadows and antialiasing for frame rate on slow
    // software renderers; the default full quality is unchanged.
    const lowQ = new URLSearchParams(location.search).get('quality') === 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: !lowQ });
    // Half-resolution backing store on low quality: the canvas still fills
    // the window (and screenshots stay full-size), but the 3D renders at
    // half res, which is ~4x faster on software renderers.
    this.renderer.setPixelRatio(lowQ ? 0.5 : Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = !lowQ;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3000);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
    this.sun.position.set(400, 500, 200);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -260;
    this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260;
    this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 1600;
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xffe0b0, 0x40342a, 0.9);
    this.scene.add(this.hemi);
    this.cityGroup = buildCity(this.scene);
    setMood(this.scene, this.sun, this.hemi, 'day');
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }
  buildPlayer() {
    this.carMesh = makeCarMesh(0xf5c542);
    this.scene.add(this.carMesh);
    this.car = new PlayerCar(this.carMesh);
    // On-foot avatar: a simple figure.
    const g = new THREE.Group();
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.9 }));
    shirt.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8a075, roughness: 0.8 }));
    head.position.y = 1.85;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.9 }));
    legs.position.y = 0.42;
    g.add(shirt, head, legs);
    g.visible = false;
    this.scene.add(g);
    this.avatar = g;
  }
  bindMouse() {
    $('game').addEventListener('click', () => {
      if (this.mode !== 'play') return;
      this.shoot();
    });
    $('menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.menuClick(b.dataset.act, b.dataset.arg);
    });
  }
  shoot() {
    const w = this.state.activeWeapon;
    if ((this.state.ammo[w] || 0) <= 0) {
      this.hud.showToast('No ammo — visit Ironworks Arms.');
      return;
    }
    this.state.ammo[w]--;
    this.radio.shot();
    const range = w === 'shotgun' ? 26 : 55;
    let best = null;
    let bestD = range;
    for (const c of this.police.cars) {
      if (!c.active) continue;
      const d = Math.hypot(c.x - this.car.x, c.z - this.car.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      best.speed = Math.max(6, best.speed - 12);
      this.effects.impact(best.x, 1, best.z, 0.8);
      this.state.respect += stuntRespect('takedown');
      this.effects.floatText('+8 RESPECT', best.x, 2, best.z);
      this.wanted = wantedAfterCrime(this.wanted, 'shoot');
    }
  }
  // ---- menus ----
  showTitle() {
    this.mode = 'title';
    this.hud.showMenu(`
      <h1>SOLANO HEAT</h1>
      <p class="tag">Seven days. Twelve jobs. One last score in Solano Bay.</p>
      <p>Rook is a getaway driver with a crew, a debt, and a plan: the Meridian
      Vault on Day 7. Drive, steal, escape — and earn respect that never fades.</p>
      <p class="keys">WASD drive &nbsp;·&nbsp; Space handbrake &nbsp;·&nbsp; Shift NOS &nbsp;·&nbsp; F on foot
      &nbsp;·&nbsp; E interact &nbsp;·&nbsp; Q radio &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; M missions &nbsp;·&nbsp; Esc pause</p>
      <p class="keys">RESPECT ${this.state.respect} (${this.economy.respectBar()}) &nbsp;·&nbsp; CASH $${this.state.cash} &nbsp;·&nbsp; MISSIONS ${this.state.completed.length}/12</p>
      <button data-act="start">START — CONTINUE DAY ${this.state.nextMission ? missionById(this.state.nextMission).day : 7}</button>
      <button data-act="free">FREE ROAM</button>
      <button data-act="reset">NEW GAME (wipe save)</button>`);
  }
  showSelect() {
    this.mode = 'select';
    const rows = MISSIONS.map((m, i) => {
      const done = this.state.completed.includes(m.id);
      const next = m.id === this.state.nextMission;
      const cls = done ? 'done' : i === this.selectIdx ? 'sel' : '';
      const tag = done ? 'DONE' : next ? 'NEXT — story order' : '★'.repeat(Math.ceil(m.difficulty / 2));
      return `<div class="mrow ${cls}" data-act="pick" data-arg="${m.id}">
        <b>DAY ${m.day} — ${m.name}</b><span>${tag}</span>
        <i>${m.blurb}</i><em>$${m.cash} · +${m.respect} respect</em></div>`;
    }).join('');
    this.hud.showMenu(`<h1>MISSIONS — 7 DAYS TO THE NIGHT JOB</h1><p class="tag">The job board: take any job, or follow the story in order. Saw-tooth: each job teaches one thing, then tests it under heat.</p>${rows}
      <button data-act="free">FREE ROAM</button><button data-act="back">BACK</button>`);
  }
  showShop() {
    this.mode = 'shop';
    const s = this.economy.nearShop;
    if (!s) {
      this.mode = 'play';
      this.hud.hideMenu();
      return;
    }
    const lines = this.economy.shopLines().map((l, i) =>
      `<div class="mrow ${i === this.shopSel ? 'sel' : ''}" data-act="buy" data-arg="${i}"><b>${l.label}</b></div>`).join('');
    this.hud.showMenu(`<h1>${s.name.toUpperCase()}</h1><p class="tag">${s.district} — Cash $${this.state.cash} · Respect ${this.state.respect}</p>${lines}
      <p class="keys">${this.economy.message || 'Pick an item, or press E to leave.'}</p><button data-act="leave">LEAVE</button>`);
  }
  showPause() {
    this.mode = 'pause';
    this.hud.showMenu(`<h1>PAUSED</h1><p class="tag">Solano Bay waits.</p><button data-act="free">RESUME</button><button data-act="title">TITLE SCREEN</button>`);
  }
  showOver(title, sub) {
    this.mode = 'over';
    this.hud.showMenu(`<h1>${title}</h1><p class="tag">${sub}</p>
      <p>Cash $${this.state.cash} · Respect ${this.state.respect} · Missions ${this.state.completed.length}/12</p>
      <button data-act="retry">BACK ON THE STREET</button><button data-act="title">TITLE SCREEN</button>`);
  }
  menuClick(act, arg) {
    if (act === 'start') {
      this.hud.hideMenu();
      this.mode = 'play';
      this.startNext();
    } else if (act === 'free') {
      this.hud.hideMenu();
      this.mode = 'play';
    } else if (act === 'back') {
      this.showTitle();
    } else if (act === 'title') {
      this.showTitle();
    } else if (act === 'reset') {
      this.state = createState();
      this.economy.state = this.state;
      this.runner.state = this.state;
      this.showTitle();
    } else if (act === 'pick') {
      const id = +arg;
      if (!this.state.completed.includes(id)) {
        this.hud.hideMenu();
        this.mode = 'play';
        this.startMission(id);
      }
    } else if (act === 'buy') {
      const lines = this.economy.shopLines();
      if (lines[+arg]) {
        lines[+arg].action();
        this.showShop();
      }
    } else if (act === 'leave') {
      this.hud.hideMenu();
      this.mode = 'play';
    } else if (act === 'retry') {
      this.hud.hideMenu();
      this.mode = 'play';
      this.wanted = 0;
      this.car.x = 400;
      this.car.z = -400;
      this.car.heading = Math.PI;
      this.car.speed = 0;
      this.car.repair();
    }
  }
  startNext() {
    const id = this.state.nextMission;
    if (id) this.startMission(id);
  }
  startMission(id) {
    const m = missionById(id);
    if (!m) return;
    this.runner.start(id);
    this.wanted = m.wanted;
    // Face the car down the first leg of the road route to the beacon, so a
    // fresh run starts driving, not turning across a block.
    const t = this.runner.active.target;
    if (Math.abs(t.x - this.car.x) > 10) this.car.heading = t.x >= this.car.x ? Math.PI / 2 : -Math.PI / 2;
    else this.car.heading = t.z >= this.car.z ? 0 : Math.PI;
    const mood = m.type === 'timed' && id === 6 ? 'night' : id === 8 || id === 12 ? 'dusk' : 'day';
    setMood(this.scene, this.sun, this.hemi, mood);
    this.radio.chime();
  }
  // ---- per-frame ----
  // Fixed-step simulation: the game advances in 1/60s steps no matter how
  // fast the screen renders, so slow software rendering (or a background
  // tab) slows the picture, never the game. Up to 180 steps a frame keeps a
  // stalled renderer at real time; any further backlog is dropped.
  loop() {
    requestAnimationFrame(this.loop);
    // The raw frame delta is capped at 2.5s: long enough for a slow software
    // renderer (half a frame a second still catches up), short enough that a
    // tab switch does not queue minutes of simulation.
    const rawDt = Math.min(2.5, this.clock.getDelta());
    this.acc += rawDt;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 180) {
      this.step(1 / 60);
      this.acc -= 1 / 60;
      steps++;
      this.input.endFrame();
    }
    if (steps >= 180) this.acc = 0;
    window.__steps = (window.__steps || 0) + steps;
    this.telemetry();
    this.renderer.render(this.scene, this.camera);
    if (!window.__solanoReady) window.__solanoReady = true;
  }
  // Read-only runtime state for the capture harness and debugging. No
  // staging: the game decides everything; this only reports it.
  telemetry() {
    const px = this.onFoot ? this.foot.x : this.car.x;
    const pz = this.onFoot ? this.foot.z : this.car.z;
    const heading = this.onFoot ? this.foot.heading : this.car.heading;
    const speedKmh = this.onFoot ? 0 : Math.abs(this.car.speed) * 3.2;
    const d = districtAt(px, pz);
    window.SOLANO = {
      mode: this.mode,
      wanted: this.wanted,
      mission: this.runner.current() ? this.runner.current().id : 0,
      select: this.mode === 'select' ? MISSIONS[this.selectIdx].id : 0,
      speed: Math.round(speedKmh),
      px: Math.round(px),
      pz: Math.round(pz),
      heli: !!this.police.heliMesh,
      district: d ? d.name : '',
      cash: this.state.cash,
      respect: this.state.respect,
      errors: this.errors.length,
      banner: this.runner.banner,
      target: this.runner.active ? { x: Math.round(this.runner.active.target.x), z: Math.round(this.runner.active.target.z) } : null,
      heading: Math.round(heading * 100) / 100,
      heliPos: this.police.heliMesh ? { x: Math.round(this.police.heliMesh.position.x), y: Math.round(this.police.heliMesh.position.y), z: Math.round(this.police.heliMesh.position.z) } : null,
      cam: { x: Math.round(this.camera.position.x), y: Math.round(this.camera.position.y), z: Math.round(this.camera.position.z) },
    };
  }
  step(dt) {
    this.time += dt;
    if (this.mode === 'play') this.updatePlay(dt);
    else if (this.mode === 'title' || this.mode === 'select') this.updateMenuScene(dt);
    this.traffic.update(dt);
    this.peds.update(dt, this.time);
  }
  updateMenuScene(dt) {
    // Slow orbit over the city behind the menu.
    const a = this.time * 0.05;
    this.camera.position.set(Math.sin(a) * 320, 120, Math.cos(a) * 320);
    this.camera.lookAt(0, 0, 0);
    if (this.mode === 'title' && this.input.hit('m')) {
      this.showSelect();
      return;
    }
    if (this.input.hit('Enter')) {
      if (this.mode === 'title') {
        this.hud.hideMenu();
        this.mode = 'play';
        this.startNext();
      } else if (this.mode === 'select') {
        this.menuClick('pick', String(MISSIONS[this.selectIdx].id));
      }
    }
    if (this.mode === 'select') {
      if (this.input.hit('ArrowUp', 'w')) this.selectIdx = (this.selectIdx + 11) % 12;
      if (this.input.hit('ArrowDown', 's')) this.selectIdx = (this.selectIdx + 1) % 12;
      if (this.input.hit('Escape', 'm')) this.showTitle();
      if (this.input.anyKey) this.showSelect();
    }
  }
  updatePlay(dt) {
    const st = this.state;
    const mods = modifiersFor(st);
    // Global keys.
    if (this.input.hit('Escape')) {
      this.showPause();
      return;
    }
    if (this.input.hit('m')) {
      this.showSelect();
      return;
    }
    if (this.input.hit('q')) this.hud.showToast(this.radio.nextStation());
    if (this.input.hit('r')) this.hud.showToast(this.radio.toggle() ? 'Radio on: ' + this.radio.name() : 'Radio off');
    if (this.input.hit('1')) st.activeWeapon = 'pistol';
    if (this.input.hit('2') && st.weapons.smg) st.activeWeapon = 'smg';
    if (this.input.hit('3') && st.weapons.shotgun) st.activeWeapon = 'shotgun';
    // Autopilot demo driver: steers toward the mission beacon.
    if (this.auto) this.autoDrive(dt);
    // Movement.
    let px;
    let pz;
    let heading;
    let speedKmh;
    if (this.onFoot) {
      const fwd = this.input.axis(['s', 'ArrowDown'], ['w', 'ArrowUp']);
      const steer = this.input.axis(['a', 'ArrowLeft'], ['d', 'ArrowRight']);
      this.foot.heading += steer * 2.4 * dt;
      const sp = fwd * 7;
      this.foot.x += Math.sin(this.foot.heading) * sp * dt;
      this.foot.z += Math.cos(this.foot.heading) * sp * dt;
      this.foot.x = Math.max(-590, Math.min(590, this.foot.x));
      this.foot.z = Math.max(-590, Math.min(590, this.foot.z));
      this.avatar.position.set(this.foot.x, 0, this.foot.z);
      this.avatar.rotation.y = this.foot.heading;
      px = this.foot.x;
      pz = this.foot.z;
      heading = this.foot.heading;
      speedKmh = Math.abs(sp) * 3.2;
      if (this.input.hit('f')) this.enterCar();
      if (this.input.hit('e')) this.trySteal();
    } else {
      const res = this.car.update(dt, this.autoInput || this.input, mods);
      speedKmh = res.speedKmh;
      px = this.car.x;
      pz = this.car.z;
      heading = this.car.heading;
      if (this.input.hit('f')) this.exitCar();
      if (this.car.drifting) {
        this.driftRespectCd -= dt;
        if (this.driftRespectCd <= 0) {
          st.respect += stuntRespect('drift');
          this.driftRespectCd = 1.2;
        }
      }
      this.collideBuildings();
      this.collideTraffic();
      this.collidePeds();
      this.nearMissCheck(dt);
    }
    // Camera: chase cam with a little height so the helicopter stays in frame.
    const camDist = this.onFoot ? 9 : 12.5;
    const camH = this.onFoot ? 4 : 5.2;
    const bx = px - Math.sin(heading) * camDist;
    const bz = pz - Math.cos(heading) * camDist;
    this.camera.position.lerp(new THREE.Vector3(bx, camH, bz), Math.min(1, dt * 5));
    const lx = px + Math.sin(heading) * 10;
    const lz = pz + Math.cos(heading) * 10;
    this.camera.lookAt(lx, 3.0, lz);
    const [sx, sy] = this.effects.shakeOffset();
    this.camera.position.x += sx * 0.4;
    this.camera.position.y += sy * 0.4;
    // Police, missions, economy.
    const pev = this.police.update(dt, { x: px, z: pz, heading, speed: this.onFoot ? 0 : this.car.speed }, this.wanted, this.time);
    if (pev.busted) {
      st.cash = Math.round(st.cash * 0.9);
      writeSave(st);
      this.runner.abort();
      this.showOver('BUSTED', 'The Solano PD took 10% of your cash. The crew is waiting.');
      return;
    }
    this.wanted = this.police.decayCheck(this.wanted, dt);
    const mev = this.runner.update(dt, { x: px, z: pz, speed: this.onFoot ? 0 : this.car.speed }, this.wanted, this.time);
    if (mev.done) {
      this.radio.chime();
      this.hud.showToast(`Mission complete: +$${mev.gain.cash}, +${mev.gain.respect} respect.`);
      writeSave(st);
      if (!this.state.nextMission) this.hud.showToast('All 12 missions done — Solano Bay is yours, legend.');
    } else if (mev.failed) {
      this.hud.showToast('Mission failed: ' + mev.reason);
    }
    const sense = this.economy.sense(px, pz);
    if (this.input.hit('e')) {
      if (sense.shop) this.showShop();
      else if (sense.house) {
        this.economy.useSafehouse(this.car);
        writeSave(st);
        this.hud.showToast(this.economy.message);
      }
    }
    if (this.car.damage >= 100) {
      st.cash = Math.round(st.cash * 0.9);
      writeSave(st);
      this.runner.abort();
      this.showOver('WRECKED', 'Your ride is scrap. The garage can fix it — for a price.');
      return;
    }
    this.radio.update(dt, this.onFoot ? 0 : this.car.speed, this.wanted);
    this.effects.update(dt);
    this.saveCd -= dt;
    if (this.saveCd <= 0) {
      writeSave(st);
      this.saveCd = 10;
    }
    // HUD.
    const d = districtAt(px, pz);
    this.hud.update({
      wanted: this.wanted,
      cash: st.cash,
      respect: st.respect,
      rank: this.economy.respectBar(),
      district: d ? d.name : 'Solano Bay',
      objective: this.runner.objectiveLine(),
      speedKmh,
      nos: this.onFoot ? 0 : this.car.nos,
      damage: this.onFoot ? 0 : this.car.damage,
      radio: this.radio.enabled ? this.radio.name() : 'Radio off (R)',
      banner: this.runner.banner,
      dayline: this.runner.current() ? `DAY ${this.runner.current().day} — ${daysLeft(this.runner.current().id)} DAYS TO THE NIGHT JOB` : 'SOLANO BAY — 7 DAYS TO THE NIGHT JOB',
      prompt: sense.shop ? 'Press E — ' + sense.shop.name : sense.house ? 'Press E — ' + sense.house.name + ' (save + heal)' : this.onFoot ? 'Press E near a car to steal it' : '',
      px,
      pz,
      heading,
      target: this.runner.active ? this.runner.active.target : this.runner.sideJob ? this.runner.sideJob.target : null,
      shops: SHOPS,
      houses: SAFEHOUSES,
      police: this.police.cars.filter(c => c.active).map(c => ({ x: c.x, z: c.z })),
    });
  }
  autoDrive(dt) {
    // Demo driver: pure pursuit along the road grid to the beacon.
    // Waypoints run intersection to intersection, and the car always steers
    // at a point 25 units ahead on the route, so it stays on the road
    // instead of cutting corners through buildings. With no mission active
    // it idles: the demo driver only drives jobs, it never joyrides.
    if (!this.runner.active) {
      this.autoInput = { down: () => false, hit: () => false, axis: () => 0 };
      return;
    }
    const t = this.runner.active.target;
    const key = t.x + ',' + t.z;
    if (this.autoTarget !== key) {
      this.autoTarget = key;
      const rx = Math.round(this.car.x / 100) * 100;
      const rz = Math.round(this.car.z / 100) * 100;
      const tx = Math.round(t.x / 100) * 100;
      const tz = Math.round(t.z / 100) * 100;
      this.autoWps = [{ x: rx, z: rz }, { x: tx, z: rz }, { x: tx, z: tz }, { x: t.x, z: t.z }];
      this.autoStuck = 0;
      this.autoReverse = 0;
    }
    if (Math.abs(this.car.speed) < 4 && this.autoReverse <= 0) this.autoStuck += dt;
    else this.autoStuck = 0;
    if (this.autoStuck > 2.5) {
      this.autoReverse = 1.2;
      this.autoStuck = 0;
    }
    const look = this.pursuitPoint(this.autoWps, 25);
    const want = Math.atan2(look.x - this.car.x, look.z - this.car.z);
    const dh = wrapAngle(want - this.car.heading);
    const keys = new Set();
    if (this.autoReverse > 0) {
      this.autoReverse -= dt;
      keys.add('s');
      if (dh > 0.02) keys.add('a');
      if (dh < -0.02) keys.add('d');
    } else {
      keys.add('w');
      if (dh > 0.02) keys.add('d');
      if (dh < -0.02) keys.add('a');
    }
    this.autoInput = {
      down: (...ks) => ks.some(k => keys.has(k)),
      hit: () => false,
      axis: (neg, pos) => (pos.some(k => keys.has(k)) ? 1 : 0) - (neg.some(k => keys.has(k)) ? 1 : 0),
    };
  }
  // Point on the waypoint polyline 25 units ahead of the car's projection.
  pursuitPoint(wps, ahead) {
    let best = null;
    let bestD = 1e18;
    let bestSeg = 0;
    let bestT = 0;
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i];
      const b = wps[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((this.car.x - a.x) * dx + (this.car.z - a.z) * dz) / len2));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = (px - this.car.x) ** 2 + (pz - this.car.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestSeg = i;
        bestT = t;
        best = { x: px, z: pz };
      }
    }
    // Walk `ahead` units forward along the polyline from the projection.
    let remaining = ahead;
    let seg = bestSeg;
    let tx = best.x;
    let tz = best.z;
    let segT = bestT;
    while (remaining > 0 && seg < wps.length - 1) {
      const a = wps[seg];
      const b = wps[seg + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const left = segLen * (1 - segT);
      if (left >= remaining) {
        const f = segT + remaining / segLen;
        tx = a.x + (b.x - a.x) * f;
        tz = a.z + (b.z - a.z) * f;
        remaining = 0;
      } else {
        remaining -= left;
        seg++;
        segT = 0;
        tx = wps[seg].x;
        tz = wps[seg].z;
      }
    }
    return { x: tx, z: tz };
  }
  enterCar() {
    this.onFoot = false;
    this.avatar.visible = false;
    this.carMesh.visible = true;
    this.car.x = this.foot.x;
    this.car.z = this.foot.z;
  }
  exitCar() {
    this.onFoot = true;
    this.foot.x = this.car.x + 3;
    this.foot.z = this.car.z;
    this.foot.heading = this.car.heading;
    this.avatar.visible = true;
    this.carMesh.visible = false;
  }
  trySteal() {
    let best = null;
    let bestD = 9;
    for (const c of this.traffic.cars) {
      const p = c.mesh.position;
      const d = Math.hypot(p.x - this.foot.x, p.z - this.foot.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) {
      this.hud.showToast('No car close enough to steal.');
      return;
    }
    best.mesh.visible = false;
    this.traffic.cars = this.traffic.cars.filter(c => c !== best);
    this.wanted = wantedAfterCrime(this.wanted, 'stealCar');
    this.enterCar();
    this.hud.showToast('Car stolen — the heat is on.');
  }
  collideBuildings() {
    const colliders = this.cityGroup.userData.colliders || [];
    const r = 2.1;
    for (const b of colliders) {
      if (Math.abs(this.car.x - b.cx) > b.hw + r || Math.abs(this.car.z - b.cz) > b.hd + r) continue;
      const dx = this.car.x - b.cx;
      const dz = this.car.z - b.cz;
      const px = b.hw + r - Math.abs(dx);
      const pz = b.hd + r - Math.abs(dz);
      if (px < pz) this.car.x = b.cx + Math.sign(dx || 1) * (b.hw + r);
      else this.car.z = b.cz + Math.sign(dz || 1) * (b.hd + r);
      if (Math.abs(this.car.speed) > 12) {
        this.car.damageBy(8, modifiersFor(this.state).armor);
        this.effects.impact(this.car.x, 1, this.car.z, 1);
        this.radio.thud();
        if (this.runner.active) this.runner.active.noDamage = false;
      }
      this.car.speed *= 0.4;
      break;
    }
  }
  collideTraffic() {
    for (const c of this.traffic.cars) {
      const p = c.mesh.position;
      const d = Math.hypot(p.x - this.car.x, p.z - this.car.z);
      if (d < 4.4 && d > 0.01) {
        const push = 4.4 - d;
        this.car.x += ((this.car.x - p.x) / d) * push;
        this.car.z += ((this.car.z - p.z) / d) * push;
        if (Math.abs(this.car.speed) > 10) {
          this.car.damageBy(5, modifiersFor(this.state).armor);
          this.effects.impact(this.car.x, 1, this.car.z, 0.7);
          this.radio.thud();
          this.wanted = wantedAfterCrime(this.wanted, 'hitCar');
          if (this.runner.active) this.runner.active.noDamage = false;
        }
        this.car.speed *= 0.6;
      }
    }
  }
  collidePeds() {
    for (const w of this.peds.walkers) {
      const p = w.mesh.position;
      const d = Math.hypot(p.x - this.car.x, p.z - this.car.z);
      if (d < 2.6 && Math.abs(this.car.speed) > 6) {
        this.wanted = wantedAfterCrime(this.wanted, 'hitPed');
        this.effects.impact(p.x, 1, p.z, 1);
        this.radio.thud();
        w.mesh.position.set(9999, 0, 9999);
        setTimeout(() => { w.mesh.position.set(w.lane, 0, w.t); }, 8000);
      }
    }
  }
  nearMissCheck(dt) {
    this.nearMissCd -= dt;
    if (this.nearMissCd > 0 || Math.abs(this.car.speed) < 25) return;
    for (const c of this.traffic.cars) {
      const p = c.mesh.position;
      const d = Math.hypot(p.x - this.car.x, p.z - this.car.z);
      if (d > 4.4 && d < 7.5) {
        this.state.respect += stuntRespect('nearMiss');
        this.effects.floatText('+3 RESPECT', this.car.x, 2, this.car.z);
        this.nearMissCd = 2.5;
        if (this.runner.active) this.runner.active.stunts++;
        break;
      }
    }
  }
}

new Game();
