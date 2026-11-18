// Solano Heat — boot and the one loop.
//
// Input is read every frame, the simulation advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the Three.js
// renderer paints what is there. The game moves between five screens:
// title, play, paused, the jobs menu and the garage. Busted is not a
// screen: the police fine you, drop you at the hospital and the city
// keeps turning.
//
// ?seed=N fixes the traffic pattern. ?shot=chase|heli|roadblock|finale|start
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot. ?auto=1 starts the
// game with the autopilot playing, as a demo that the game is winnable.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { CHAPTERS } from './missions.js';
import { createSim, EVENT_BUSTED, EVENT_CRIME, EVENT_HELI, EVENT_JOB_DONE, EVENT_JOB_FAIL, EVENT_MISSION, EVENT_SHOT, EVENT_SPOTTED, EVENT_STEP, EVENT_TIMEOUT, EVENT_WANTED_UP } from './sim.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_GARAGE, ACTION_JOB1, ACTION_JOB2, ACTION_JOB3, ACTION_JOB4,
  ACTION_MISSIONS, ACTION_PAUSE, ACTION_PUNCH, ACTION_RADIO, ACTION_SHOOT, ACTION_SOUND, ACTION_WEAPON,
  createInput,
} from './input.js';
import { createWorld3D } from './world3d.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { readSave, writeSave } from './save.js';
import { stageShot } from './shots.js';
import { playChapter } from './autopilot.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const auto = params.get('auto') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const sceneEl = document.getElementById('scene');
const statusEl = document.getElementById('status');
const sim = createSim(createRandom(seed), { seed });
const world3d = createWorld3D(sceneEl, sim.state);
const hud = createHud(document);
const audio = createAudio();
const saved = readSave();
if (saved) sim.applySave(saved);

function announce(message) {
  statusEl.textContent = message;
}

function persist() {
  writeSave(sim.saveData());
}

function uiState() {
  const missions = sim.state.missions;
  return {
    objective: sim.objective(),
    step: sim.currentStepInfo(),
    marker: sim.marker(),
    timedLeft: missions.stepTimer,
    heldSeconds: missions.stepHeld,
    chapters: CHAPTERS,
    chapterIndex: missions.chapter,
    completed: missions.completed,
    cash: missions.cash,
    garage: sim.state.garage,
  };
}

function runShot(name) {
  const screen = stageShot(name, sim);
  let painted = 0;
  function paint() {
    world3d.render(sim.state, sim.marker(), 0.016, sim.state.elapsed);
    hud.update(sim.state, uiState());
    if (screen === 'title') hud.showPanel('title', uiState());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(sceneEl);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let timeSec = 0;
  sim.state.demo = true;

  function startGame() {
    sim.state.demo = false;
    sim.reset();
    const again = readSave();
    if (again) sim.applySave(again);
    accumulator = 0;
    screen = 'play';
    audio.unlock();
    hud.hidePanels();
    announce(`Playing. Chapter ${sim.state.missions.chapter + 1} of ${CHAPTERS.length}. ${sim.objective()}`);
  }

  function openMenu() {
    screen = 'missions';
    hud.showPanel('missions', uiState());
    announce('Jobs menu. Press 1 to 4 for a side job, M to close.');
  }

  function openGarage() {
    const garage = { x: 800, z: 160 };
    const d = Math.hypot(sim.state.player.x - garage.x, sim.state.player.z - garage.z);
    if (d > 18) {
      audio.denied();
      announce('The garage is on the Eastside — drive to the marker first.');
      return;
    }
    screen = 'garage';
    hud.showPanel('garage', uiState());
    announce('Eastside Garage. Press 1 armor, 2 engine, 3 NOS, G to close.');
  }

  function handleEvents(events) {
    if (events & EVENT_MISSION) {
      audio.missionComplete();
      persist();
      announce(`Mission complete. ${sim.objective()}`);
    }
    if (events & EVENT_JOB_DONE) {
      audio.missionComplete();
      persist();
      announce('Job done. Paid in full.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      persist();
      announce('Busted. The police took a fine and dropped you at the hospital.');
    }
    if (events & EVENT_TIMEOUT) announce('Too slow. The delivery window closed.');
    if (events & EVENT_SPOTTED) announce('Spotted. Lose the heat, then come back clean.');
    if (events & EVENT_STEP) announce(sim.objective());
    if (events & EVENT_JOB_FAIL) announce('Job failed.');
    if (events & EVENT_SHOT) {
      const kind = sim.state.shots.length > 0 ? sim.state.shots[sim.state.shots.length - 1].kind : 'pistol';
      audio.shoot(kind);
    }
    if (events & EVENT_HELI) announce('Police helicopter overhead.');
    if (events & EVENT_WANTED_UP) announce(`Wanted level ${sim.state.wanted}.`);
  }

  function buyGarageItem(index) {
    const items = ['armor', 'speed', 'nos'];
    const item = items[index];
    if (!item) return;
    if (sim.buyGarage(item)) {
      audio.pickup();
      persist();
      hud.showPanel('garage', uiState());
      announce(`${item} bought.`);
    } else {
      audio.denied();
      announce('Not enough cash, or already owned.');
    }
  }

  function buyWeaponKey(index) {
    const ids = ['smg', 'shotgun'];
    const id = ids[index];
    if (!id) return;
    if (sim.buyWeapon(id)) {
      audio.pickup();
      persist();
      announce(`${id} bought. Press Q to switch weapons.`);
    } else {
      audio.denied();
    }
  }

  function handleActions(actions) {
    if (actions & ACTION_SOUND) {
      const muted = audio.toggleMuted();
      announce(muted ? 'Sound off.' : 'Sound on.');
      return;
    }
    if (actions & ACTION_RADIO) {
      const station = audio.setStation(sim.state.radio + 1);
      sim.state.radio = station;
      announce(`Radio: ${['SOL FM', 'NEON NIGHTS', 'PIER TALK'][station]}.`);
      return;
    }
    if (actions & ACTION_WEAPON) {
      const def = sim.cycleWeapon();
      announce(`Weapon: ${def.name}.`);
      return;
    }
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        screen = 'paused';
        hud.showPanel('paused', uiState());
        announce('Paused.');
      } else if (actions & ACTION_MISSIONS) {
        openMenu();
      } else if (actions & ACTION_GARAGE) {
        openGarage();
      }
      return;
    }
    if (screen === 'paused') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.hidePanels();
        announce('Playing.');
      }
      return;
    }
    if (screen === 'missions') {
      if (actions & ACTION_JOB1) startJob('taxi');
      else if (actions & ACTION_JOB2) startJob('courier');
      else if (actions & ACTION_JOB3) startJob('vigilante');
      else if (actions & ACTION_JOB4) startJob('repo');
      else if (actions & (ACTION_MISSIONS | ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.hidePanels();
        announce('Playing.');
      }
      return;
    }
    if (screen === 'garage') {
      if (actions & ACTION_JOB1) buyGarageItem(0);
      else if (actions & ACTION_JOB2) buyGarageItem(1);
      else if (actions & ACTION_JOB3) buyGarageItem(2);
      else if (actions & (ACTION_GARAGE | ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.hidePanels();
        announce('Playing.');
      }
    }
  }

  function startJob(kind) {
    const job = sim.beginJob(kind);
    if (job) {
      screen = 'play';
      hud.hidePanels();
      announce(`${job.title} started. ${job.text}`);
    }
  }

  // Number keys 5 and 6 buy weapons while the garage is open.
  window.addEventListener('keydown', (event) => {
    if (screen !== 'garage') return;
    if (event.code === 'Digit5') buyWeaponKey(0);
    else if (event.code === 'Digit6') buyWeaponKey(1);
  });

  function stepWorld(actions) {
    const before = sim.state.player.health;
    const move = input.moveVector();
    const inCar = !!sim.state.player.inCar;
    let worldMove;
    if (inCar) {
      // In a car the keys are car-relative: W is throttle, A/D steer.
      worldMove = { x: move.x, z: move.z };
    } else {
      // On foot the keys are camera-relative: W walks away from the camera,
      // which sits behind the player facing their heading.
      const a = sim.state.player.angle;
      const fx = Math.cos(a);
      const fz = Math.sin(a);
      const rx = -Math.sin(a);
      const rz = Math.cos(a);
      worldMove = {
        x: fx * -move.z + rx * move.x,
        z: fz * -move.z + rz * move.x,
      };
      const len = Math.hypot(worldMove.x, worldMove.z);
      if (len > 1) { worldMove.x /= len; worldMove.z /= len; }
    }
    const simActions = actions & (ACTION_ENTER | ACTION_PUNCH | ACTION_SHOOT);
    const events = sim.step(STEP, {
      move: worldMove,
      running: input.running(),
      actions: simActions,
      nos: inCar && input.nosHeld(),
    });
    if (sim.state.player.health < before) world3d.addShake(0.6);
    handleEvents(events);
    const car = sim.state.player.inCar;
    audio.update(STEP, car ? Math.abs(car.speed) / (car.topSpeed || 34) : 0, !!car, sim.state.wanted);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    timeSec += dt;
    const actions = input.takeActions();
    handleActions(actions);
    if (auto && screen === 'title') startGame();
    if (screen === 'title') {
      sim.state.demo = true;
      accumulator += dt;
      while (accumulator >= STEP) {
        sim.step(STEP, null);
        accumulator -= STEP;
      }
    } else if (screen === 'play') {
      if (auto) {
        // The autopilot plays in quarter-second chunks so the frame stays live.
        playChapter(sim, 0.25);
        if (sim.state.missions.chapter >= CHAPTERS.length) {
          announce('Autopilot finished all chapters. Port Solano is yours.');
        }
      } else {
        accumulator += dt;
        let first = true;
        while (accumulator >= STEP) {
          stepWorld(first ? actions : 0);
          first = false;
          accumulator -= STEP;
        }
      }
      const car = sim.state.player.inCar;
      audio.update(dt, car ? Math.abs(car.speed) / (car.topSpeed || 34) : 0, !!car, sim.state.wanted);
    }
    if (screen === 'title') hud.showPanel('title', uiState());
    world3d.render(sim.state, sim.marker(), dt, timeSec);
    hud.update(sim.state, uiState());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      hud.showPanel('paused', uiState());
      announce('Paused.');
    }
  });

  announce('Solano Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
