// Solano Heat — keyboard and pointer input. Held keys steer and drive;
// one-shot presses (enter a car, shoot, switch weapon, open menus) queue as
// bit flags and are taken once by the loop, so a press between two frames is
// never lost and never counted twice. Keys: W A S D / arrows to move and
// drive, Shift to run or NOS, E enter/exit car, Space punch, F shoot,
// Q weapon, R radio, G garage, M jobs, 1–7 menu picks, P/Esc pause, N mute.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_EXIT = 8;
export const ACTION_SHOOT = 16;
export const ACTION_WEAPON = 32;
export const ACTION_RADIO = 64;
export const ACTION_GARAGE = 128;
export const ACTION_MISSIONS = 256;
export const ACTION_MUTE = 512;
export const ACTION_NUMBER = 1024;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let number = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const code = event.code;
    if (FORWARD.has(code) || BACK.has(code) || LEFT.has(code) || RIGHT.has(code) || code === 'ShiftLeft' || code === 'ShiftRight') {
      held.add(code);
    } else if (code === 'Space' || code === 'Enter') actions |= ACTION_CONFIRM;
    else if (code === 'KeyP' || code === 'Escape') actions |= ACTION_PAUSE;
    else if (code === 'KeyE') actions |= stateHasCar() ? ACTION_EXIT : ACTION_ENTER;
    else if (code === 'KeyF') actions |= ACTION_SHOOT;
    else if (code === 'KeyQ') actions |= ACTION_WEAPON;
    else if (code === 'KeyR') actions |= ACTION_RADIO;
    else if (code === 'KeyG') actions |= ACTION_GARAGE;
    else if (code === 'KeyM') actions |= ACTION_MISSIONS;
    else if (code === 'KeyN') actions |= ACTION_MUTE;
    else if (code.startsWith('Digit')) {
      number = Number(code.slice(5));
      actions |= ACTION_NUMBER;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => { held.delete(event.code); });
  window.addEventListener('blur', () => { held.clear(); });
  target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; });

  function has(code) { return held.has(code); }

  return {
    /** -1..1 throttle (W/S) and steer (A/D); Shift held = run/NOS. */
    drive() {
      const throttle = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
      const steer = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0);
      return {
        throttle, steer,
        run: has('ShiftLeft') || has('ShiftRight'),
        nos: has('ShiftLeft') || has('ShiftRight'),
      };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeNumber() {
      const n = number;
      number = 0;
      return n;
    },
  };
}

// The E key means "exit" when the player is already in a car; main.js sets
// this flag each frame so the key handler can pick the right action.
let inCar = false;
export function setInCar(value) { inCar = value; }
function stateHasCar() { return inCar; }
