// Solano Heat — keyboard and pointer input.
//
// Held keys give a movement vector (WASD or the arrow keys) and a run flag;
// one-shot presses (enter a car, punch, missions, pause, sound) are queued as
// bit flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. The mouse click confirms on menus.
export const ACTION_ENTER_CAR = 1;
export const ACTION_PUNCH = 2;
export const ACTION_MISSIONS = 4;
export const ACTION_PAUSE = 8;
export const ACTION_SOUND = 16;
export const ACTION_CONFIRM = 32;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER_CAR = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const MISSIONS = new Set(['KeyM']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SOUND = new Set(['KeyN']);
const CONFIRM = new Set(['Enter']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;

  function press(event) {
    if (event.repeat) return false;
    if (ENTER_CAR.has(event.code)) actions |= ACTION_ENTER_CAR;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (MISSIONS.has(event.code)) actions |= ACTION_MISSIONS;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (SOUND.has(event.code)) actions |= ACTION_SOUND;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (RUN.has(event.code)) held.run = true;
    else if (press(event)) event.preventDefault();
    else return;
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
  });

  // A key released while the tab is hidden never sends keyup: let go of all of
  // them on blur so the player does not keep walking into a wall.
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
    /** The held movement as { x, y } in [-1, 1], already normalised. */
    moveVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** True while the run key is held. */
    running() {
      return held.run;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
