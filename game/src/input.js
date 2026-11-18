// Keyboard and pointer input for Port Solano.
//
// Held keys give a movement vector (WASD or arrows) plus run and NOS;
// one-shot presses are queued as bit flags and taken once by the loop, so
// a press between two frames is never lost and never counted twice. The
// sim-level flags (enter, punch, shoot) live in sim.js; the menu-level
// flags (missions, pause, radio, weapon, garage, jobs) are handled by the
// main loop. Clicking confirms on menus.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_SHOOT = 4;
export const ACTION_MISSIONS = 8;
export const ACTION_PAUSE = 16;
export const ACTION_SOUND = 32;
export const ACTION_CONFIRM = 64;
export const ACTION_RADIO = 128;
export const ACTION_WEAPON = 256;
export const ACTION_GARAGE = 512;
export const ACTION_JOB1 = 1024;
export const ACTION_JOB2 = 2048;
export const ACTION_JOB3 = 4096;
export const ACTION_JOB4 = 8192;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

const ONE_SHOT = new Map([
  ['KeyE', ACTION_ENTER],
  ['Space', ACTION_PUNCH],
  ['KeyF', ACTION_SHOOT],
  ['KeyM', ACTION_MISSIONS],
  ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE],
  ['KeyN', ACTION_SOUND],
  ['Enter', ACTION_CONFIRM],
  ['KeyR', ACTION_RADIO],
  ['KeyQ', ACTION_WEAPON],
  ['KeyG', ACTION_GARAGE],
  ['Digit1', ACTION_JOB1],
  ['Digit2', ACTION_JOB2],
  ['Digit3', ACTION_JOB3],
  ['Digit4', ACTION_JOB4],
]);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (RUN.has(event.code)) held.run = true;
    else if (ONE_SHOT.has(event.code) && !event.repeat) actions |= ONE_SHOT.get(event.code);
    else return;
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
  });

  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur so the player does not keep driving into a wall.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.run = false;
  });

  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    // Held movement as { x, z } in [-1, 1], already normalised. x is east,
    // z is south; the main loop rotates it into camera space when on foot.
    moveVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const z = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 && z === 0) return { x: 0, z: 0 };
      const length = Math.hypot(x, z);
      return { x: x / length, z: z / length };
    },
    running() {
      return held.run;
    },
    // In a car, Shift is the NOS button rather than run.
    nosHeld() {
      return held.run;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
