// Solano Heat — boot and the one loop. Input is read every frame, the sim
// advances in fixed 1/60 s steps, missions update, and the 3D renderer
// paints what is there. Screens: title, play, paused, busted, game over.
// ?seed=N fixes the city. ?shot=chase|heli|roadblock|finale stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady. ?auto=1 hands the wheel to the autopilot demo.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createSim, EVENT_BOOM, EVENT_BUSTED, EVENT_DEAD, EVENT_SHOT } from './sim.js';
import { createMissions } from './missions.js';
import { createWorld3d } from './world3d.js';
import { createHud } from './hud.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_EXIT, ACTION_GARAGE, ACTION_MISSIONS,
  ACTION_MUTE, ACTION_NUMBER, ACTION_PAUSE, ACTION_RADIO, ACTION_SHOOT,
  ACTION_WEAPON, createInput, setInCar,
} from './input.js';
import { createAudio } from './audio.js';
import { createAutopilot } from './autopilot.js';
import { applySave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const GARAGE_AT = { x: 700, z: 300 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const autoDemo = params.get('auto') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const random = createRandom(seed);
const city = buildCity(random);
const sim = createSim(random, city);
const missions = createMissions(sim);
const world3d = createWorld3d(canvas, city);
const hud = createHud(document, city);
const audio = createAudio();
applySave(sim, missions, loadGame());

const baseInput = {
  steer: 0, throttle: 0, run: false, nos: false,
  enter: false, exit: false, shoot: false, weaponSwitch: false,
  radio: false, garage: false, garageBuy: null, ammoBuy: null,
};

function runShot(name) {
  stageShot(name, sim, missions);
  let painted = 0;
  function paint() {
    world3d.draw(sim.state, sim.state.time);
    hud.update(sim.state, sim.wantedStars(), missions.statusText(), { radio: audio.stationName() });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const pilot = createAutopilot(sim, missions);
  let screen = 'title';
  let garageOpen = false;
  let missionsOpen = false;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;

  function nearGarage() {
    const p = sim.state.player;
    return Math.hypot(p.x - GARAGE_AT.x, p.z - GARAGE_AT.z) < 16;
  }

  function startGame() {
    sim.reset();
    applySave(sim, missions, loadGame());
    accumulator = 0;
    screen = 'play';
    hud.showScreen('play');
    hud.banner('Port Solano — steal a car, make a name. M for jobs.');
    audio.unlock();
  }

  function endGame(reason) {
    screen = 'over';
    hud.showScreen('over');
    hud.setOverText(reason);
    saveGame(sim, missions);
  }

  function handleActions() {
    const actions = input.takeActions();
    setInCar(!!sim.state.car);
    if (actions & ACTION_CONFIRM) {
      if (screen === 'title' || screen === 'over') startGame();
      else if (screen === 'pause') { screen = 'play'; hud.showScreen('play'); }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') { screen = 'pause'; hud.showScreen('pause'); }
      else if (screen === 'pause') { screen = 'play'; hud.showScreen('play'); }
    }
    if (screen !== 'play') return;
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      hud.banner(audio.isMuted() ? 'Sound off' : 'Sound on');
    }
    if (actions & ACTION_RADIO) hud.banner(`Radio: ${audio.nextStation()}`);
    if (actions & ACTION_GARAGE) {
      if (garageOpen) { garageOpen = false; hud.hideMenus(); }
      else if (nearGarage()) { garageOpen = true; missionsOpen = false; hud.showGarage(sim.state); }
      else hud.banner('Garage is at Eastside — follow the gold beam.');
    }
    if (actions & ACTION_MISSIONS) {
      if (missionsOpen) { missionsOpen = false; hud.hideMenus(); }
      else { missionsOpen = true; garageOpen = false; hud.showMissions(missions); }
    }
    if (actions & ACTION_NUMBER) {
      const n = input.takeNumber();
      if (garageOpen) {
        const buys = { 1: 'armor', 2: 'engine', 3: 'nos', 4: 'nos-refill', 5: 'pistol', 6: 'smg', 7: 'shotgun' };
        const pick = buys[n];
        if (pick === 'nos-refill') {
          if (sim.state.upgrades.nos && sim.state.cash >= 100) {
            sim.state.cash -= 100;
            sim.state.upgrades.nosAmount = 100;
            hud.banner('NOS refilled.');
          }
        } else if (pick) sim.buyUpgrade(pick) || sim.buyWeapon(pick);
      } else if (missionsOpen) {
        const jobs = ['taxi', 'courier-job', 'vigilante', 'repo'];
        const job = jobs[n - 1];
        if (job && missions.startSideJob(job)) {
          missionsOpen = false;
          hud.hideMenus();
          hud.banner(`${missions.currentDef().title} — good luck.`);
        }
      }
    }
    // One-shot sim actions, consumed below in stepGame.
    pending.enter = !!(actions & (ACTION_ENTER | ACTION_EXIT));
    pending.shoot = !!(actions & ACTION_SHOOT);
    pending.weaponSwitch = !!(actions & ACTION_WEAPON);
  }

  const pending = { enter: false, shoot: false, weaponSwitch: false };

  function stepGame() {
    const drive = autoDemo ? pilot.input() : input.drive();
    const stepInput = {
      ...baseInput,
      steer: drive.steer, throttle: drive.throttle,
      run: drive.run, nos: drive.nos,
      enter: pending.enter, shoot: pending.shoot, weaponSwitch: pending.weaponSwitch,
    };
    pending.enter = false;
    pending.shoot = false;
    pending.weaponSwitch = false;
    const events = sim.step(STEP, stepInput);
    const doneBefore = missions.state.completed.length;
    missions.update(STEP);
    if (missions.state.completed.length > doneBefore) audio.chime();
    if (events & EVENT_SHOT) audio.shot();
    else if (events & EVENT_BOOM) audio.crash();
    if (sim.state.busted) endGame('Busted by the Solano PD. The crew posts your bail — press Space to go again.');
    else if (sim.state.dead) endGame('Lucia is down. The city keeps moving — press Space to go again.');
    if (autoDemo && !missions.state.active && missions.state.chapterIndex < missions.chapters.length) {
      missions.nextChapter();
    }
    audio.update(sim.state.player.speed, sim.wantedStars());
    saveTimer += STEP;
    if (saveTimer > 10) {
      saveTimer = 0;
      saveGame(sim, missions);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'play') {
      while (accumulator >= STEP) {
        stepGame();
        accumulator -= STEP;
        if (screen !== 'play') { accumulator = 0; break; }
      }
    } else {
      accumulator = 0;
    }
    world3d.draw(sim.state, sim.state.time);
    hud.update(sim.state, sim.wantedStars(), missions.statusText(), { radio: audio.stationName() });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      hud.showScreen('pause');
    }
  });

  hud.showScreen('title');
  hud.banner('SOLANO HEAT — press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
