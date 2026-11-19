// Keyboard and pointer input for Solano Heat. Held keys steer and drive;
// one-shot presses (enter a car, punch, shoot, switch weapon, open a menu,
// pause) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The loop reads
// the sim's input shape from here: throttle, steer, brake, run, enter,
// punch, shoot, nextWeapon, nos, plus the menu actions.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MISSIONS = 4;
export const ACTION_GARAGE = 8;
export const ACTION_RADIO = 16;
export const ACTION_SOUND = 32;

const FORWARD = new Set(['ArrowUp', 'KeyW']);
const BACK = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const SHOOT = new Set(['KeyF']);
const NEXT_WEAPON = new Set(['KeyQ']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MISSIONS = new Set(['KeyM']);
const GARAGE = new Set(['KeyG']);
const RADIO = new Set(['KeyR']);
const SOUND = new Set(['KeyN']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    // Held keys repeat: the first press already queued the one-shot and
    // the key is already in `held`, so repeats are ignored outright.
    if (event.repeat) return;
    held.add(event.code);
    if (ENTER.has(event.code)) actions |= 64;
    else if (PUNCH.has(event.code)) actions |= 128;
    else if (NEXT_WEAPON.has(event.code)) actions |= 256;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (MISSIONS.has(event.code)) actions |= ACTION_MISSIONS;
    else if (GARAGE.has(event.code)) actions |= ACTION_GARAGE;
    else if (RADIO.has(event.code)) actions |= ACTION_RADIO;
    else if (SOUND.has(event.code)) actions |= ACTION_SOUND;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything, including one-shots queued just before the tab lost focus,
  // or they would fire stale when the tab comes back.
  window.addEventListener('blur', () => {
    held.clear();
    actions = 0;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  const has = (set) => [...set].some((code) => held.has(code));

  return {
    /** The sim's input for this frame: throttle, steer, brake, one-shots. */
    read() {
      const steer = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const out = {
        throttle: has(FORWARD) ? 1 : 0,
        steer,
        brake: has(BACK) ? 1 : 0,
        run: has(RUN),
        enter: Boolean(actions & 64),
        punch: has(PUNCH),
        shoot: has(SHOOT),
        nextWeapon: Boolean(actions & 256),
        nos: has(RUN),
      };
      actions &= ~(64 | 256);
      return out;
    },
    /** The menu actions since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
