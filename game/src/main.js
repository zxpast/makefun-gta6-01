// Solano Heat — the browser entry. A fixed-timestep loop: the sim steps at 60 Hz,
// the world renders the sim, the HUD draws the numbers, and the audio follows the car.
import { createRandom } from './random.js';
import { createSim } from './sim.js';
import { createMissions } from './missions.js';
import { createWorld3d } from './world3d.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';

const canvas3d = document.getElementById('game');
const canvasHud = document.getElementById('hud');
const random = createRandom(Date.now() % 2147483647);
const sim = createSim(random);
const missions = createMissions(sim);
const radio = createAudio();
const world = createWorld3d(canvas3d, sim);
const hud = createHud(canvasHud, sim, missions, radio);
const input = createInput();
const save = createSave(sim, missions);

let menuOpen = false;
let started = false;

function startGame() {
  if (started) return;
  started = true;
  radio.start();
  missions.startChapter(0);
}

function handleKeys(state) {
  if (state.menu) {
    menuOpen = !menuOpen;
    if (missions.failed) {
      missions.startChapter(missions.current >= 0 ? missions.current : missions.completed.length);
    }
    return;
  }
  // Everything else (enter, weapons, shooting, radio) is handled inside sim.step
  // from the same input state — calling it here too would double-fire it.
  // Garage purchases use the number keys while parked at the garage.
  if (sim.nearPlace('garage', 12) && sim.state.car !== null) {
    if (window.__garageKey === '1') sim.buyGarage('armor');
    if (window.__garageKey === '2') sim.buyGarage('engine');
    if (window.__garageKey === '3') sim.buyGarage('nos');
    window.__garageKey = null;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
    window.__garageKey = event.code.slice(-1);
  }
  if (event.code === 'KeyL') save.saveGame();
  if (event.code === 'KeyK') save.loadGame();
});

const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  startGame();
  const state = input.state();
  handleKeys(state);
  accumulator += dt;
  while (accumulator >= STEP) {
    sim.step(STEP, state);
    missions.update(STEP);
    accumulator -= STEP;
  }
  const carSpeed = sim.state.car === null ? 0 : sim.state.car.speed;
  // The sim owns the radio index (R cycles it); keep the speakers on the same
  // station the HUD shows, instead of drifting apart after the first press.
  if (radio.stationIndex() !== sim.state.radio) radio.setStation(sim.state.radio);
  radio.update(carSpeed, sim.state.wanted);
  world.update(dt, missions.target());
  world.render();
  hud.draw();
  input.endFrame();
}

requestAnimationFrame(frame);
