// Solano Heat — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, help and wasted screens.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, VIEW_H, VIEW_W } from './config.js';
import { createGame, EVENT_CASH, EVENT_CRASH, EVENT_DEATH, EVENT_EXPLOSION, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_WANTED_UP } from './world.js';
import { Input, ScriptedInput } from './input.js';
import { createRenderer, SCREEN_HELP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { SoundBank } from './audio.js';
import { loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
const sounds = new SoundBank();

function applySave(data) {
  if (!data) return;
  const p = game.player;
  p.x = data.player.x;
  p.y = data.player.y;
  p.money = data.player.money;
  p.respect = data.player.respect;
  p.health = data.player.health;
  p.armor = data.player.armor;
  p.weapon = data.player.weapon || 'pistol';
  p.ammo = data.player.ammo || p.ammo;
  p.kills = data.player.kills || 0;
  p.carsStolen = data.player.carsStolen || 0;
  p.distanceDriven = data.player.distanceDriven || 0;
  game.missions.index = data.missionIndex || 0;
  game.missions.completed = data.completed || [];
  game.clockMinutes = data.clockMinutes || game.clockMinutes;
  game.best = data.best || 0;
  game.camera.x = Math.max(0, Math.min(4800 - VIEW_W, p.x - VIEW_W / 2));
  game.camera.y = Math.max(0, Math.min(3600 - VIEW_H, p.y - VIEW_H / 2));
}

function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, game.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = new Input(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let titleTimer = 0;
  let overAt = 0;
  const idleInput = new ScriptedInput();
  applySave(loadGame());

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    sounds.resume();
    screen = SCREEN_PLAY;
    announce('Playing. Lucia Vega, Port Solano.');
  }

  function respawn() {
    const player = game.player;
    player.money = Math.floor(player.money * 0.9);
    player.health = 100;
    player.armor = 50;
    player.dead = false;
    player.deathTimer = 0;
    player.wanted = 0;
    player.x = 1250;
    player.y = 820;
    if (player.inCar) player.inCar = null;
    game.camera.x = Math.max(0, Math.min(4800 - VIEW_W, player.x - VIEW_W / 2));
    game.camera.y = Math.max(0, Math.min(3600 - VIEW_H, player.y - VIEW_H / 2));
    screen = SCREEN_PLAY;
    saveGame(game);
    announce('Back on your feet at the Safehouse.');
  }

  // Mouse position in world coordinates, for aiming.
  function aimWorld() {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    const ox = (window.innerWidth - VIEW_W * scale) / 2;
    const oy = (window.innerHeight - VIEW_H * scale) / 2;
    const sx = (input.mouseX - ox) / scale;
    const sy = (input.mouseY - oy) / scale;
    game.aimScreen = { x: sx, y: sy };
    return { x: game.camera.x + sx, y: game.camera.y + sy };
  }

  function handleKeys() {
    if (input.wasPressed('pause')) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        saveGame(game);
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_HELP) {
        screen = SCREEN_PAUSED;
      }
    }
    if (input.wasPressed('mission') && screen === SCREEN_PLAY) {
      // The world handles M; nothing to do here.
    }
    if (screen === SCREEN_TITLE && (input.wasPressed('shoot') || input.pressed.has('Space') || input.pressed.has('Enter'))) {
      startGame();
    } else if (screen === SCREEN_OVER && performance.now() - overAt > 1500 && (input.wasPressed('shoot') || input.pressed.has('Space') || input.pressed.has('Enter'))) {
      respawn();
    }
    if (input.pressed.has('KeyH') && (screen === SCREEN_PLAY || screen === SCREEN_HELP)) {
      screen = screen === SCREEN_HELP ? SCREEN_PLAY : SCREEN_HELP;
    }
  }

  function step() {
    const aim = aimWorld();
    const events = game.step(STEP, input, aim);
    if (events & EVENT_SHOT) sounds.gunshot();
    if (events & EVENT_PICKUP) sounds.pickup();
    if (events & EVENT_CASH) sounds.cash();
    if (events & EVENT_WANTED_UP) sounds.wantedUp();
    if (events & EVENT_MISSION) sounds.missionDone();
    if (events & EVENT_CRASH) sounds.crash();
    if (events & EVENT_EXPLOSION) sounds.explosion();
    if (events & EVENT_DEATH) {
      screen = SCREEN_OVER;
      overAt = performance.now();
      saveGame(game);
      announce('Wasted. Press Space to try again.');
    }
    // Engine hum + siren follow the game state.
    const driving = !!game.player.inCar;
    sounds.engine(driving ? Math.abs(game.player.inCar.speed) / 430 : 0, driving);
    sounds.siren(STEP, game.policeCars.length > 0 && Math.hypot(game.policeCars[0].x - game.player.x, game.policeCars[0].y - game.player.y) < 800);
    saveTimer += STEP;
    if (saveTimer > 10) {
      saveTimer = 0;
      saveGame(game);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleKeys();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
      // The title screen's city idles: step the world with scripted no-input.
      if (screen === SCREEN_TITLE) {
        titleTimer += STEP;
        if (titleTimer >= STEP) {
          titleTimer = 0;
          game.step(STEP, idleInput, null);
        }
      }
    }
    renderer.draw(game, screen, game.best);
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(game);
      announce('Paused.');
    }
  });

  announce('Solano Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
