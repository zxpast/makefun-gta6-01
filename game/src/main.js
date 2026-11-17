// Solano Heat — boot and the one loop.
//
// Input is read every frame, the world advances in fixed 1/60 s steps (several
// in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between four screens: title, play, paused and the jobs menu.
// Busted is not a screen: the police fine you, drop you at the hospital and
// the city keeps turning.
//
// ?seed=N fixes the traffic pattern. ?shot=start|drive|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { CHAPTERS } from './missions.js';
import { createWorld, EVENT_BUSTED, EVENT_CRIME, EVENT_JOB_DONE, EVENT_JOB_FAIL, EVENT_MISSION, EVENT_PUNCH, EVENT_SPOTTED, EVENT_STEP, EVENT_TIMEOUT, EVENT_WANTED_UP } from './world.js';
import { ACTION_CONFIRM, ACTION_MISSIONS, ACTION_PAUSE, ACTION_SOUND, createInput } from './input.js';
import { createRenderer, SCREEN_MISSIONS, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { readSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const saved = readSave();
if (saved) world.applySave(saved);

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.extra);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  world.state.demo = true;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    writeSave(world.saveData());
  }

  function startGame() {
    world.state.demo = false;
    world.reset();
    const again = readSave();
    if (again) world.applySave(again);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Playing. Chapter ${world.state.missions.chapter + 1} of ${CHAPTERS.length}. ${world.objective()}`);
  }

  function openMenu() {
    screen = SCREEN_MISSIONS;
    announce('Jobs menu. Press 1 to 4 for a side job, M to close.');
  }

  function handleEvents(events) {
    if (events & EVENT_MISSION) {
      audio.missionComplete();
      persist();
      announce(`Mission complete. ${world.objective()}`);
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
    if (events & EVENT_STEP) announce(world.objective());
    if (events & EVENT_JOB_FAIL) announce('Job failed.');
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRIME) audio.denied();
    if (events & EVENT_WANTED_UP) announce(`Wanted level ${world.state.wanted}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_SOUND) {
      const muted = audio.toggleMuted();
      announce(muted ? 'Sound off.' : 'Sound on.');
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_MISSIONS) {
        openMenu();
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_MISSIONS) {
      if (actions & (ACTION_MISSIONS | ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null);
      return;
    }
    const events = world.step(STEP, { move: input.direction(), running: input.running(), actions });
    handleEvents(events);
    const car = world.state.player.inCar;
    audio.engine(car ? Math.abs(car.speed) / car.topSpeed : 0, !!car);
    audio.siren(world.state.wanted, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      // One-shot presses reach the world on the first sub-step only.
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const missions = world.state.missions;
    renderer.draw(world.state, screen, {
      objective: world.objective(),
      step: world.currentStepInfo(),
      marker: world.marker(),
      timedLeft: missions.stepTimer,
      heldSeconds: missions.stepHeld,
      chapters: CHAPTERS,
      chapterIndex: missions.chapter,
      completed: missions.completed,
    });
  }

  // The jobs menu takes number keys: 1 taxi, 2 courier, 3 vigilante, 4 repo.
  window.addEventListener('keydown', (event) => {
    if (screen !== SCREEN_MISSIONS) return;
    const kinds = { Digit1: 'taxi', Digit2: 'courier', Digit3: 'vigilante', Digit4: 'repo' };
    const kind = kinds[event.code];
    if (!kind) return;
    const job = world.beginJob(kind);
    if (job) {
      screen = SCREEN_PLAY;
      announce(`${job.title} started. ${job.blurb}`);
    }
  });

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solano Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
