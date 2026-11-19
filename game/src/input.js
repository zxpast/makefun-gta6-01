// Keyboard for Solano Heat: one listener, one state object, no framework.
// Keys are read per frame by the game loop, and edge-triggered actions
// (menu open, enter car, fire) come through a queue so a single press never
// fires twice. WASD and arrows both drive; the mouse fires weapons.

export function makeInput() {
  return {
    keys: {},
    pressed: [],
    mouseDown: false,
    mousePressed: false,
  };
}

export function attachInput(input, element) {
  const target = element || window;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    input.pressed.push(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouseDown = true;
      input.mousePressed = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  window.addEventListener('blur', () => {
    input.keys = {};
    input.mouseDown = false;
  });
  return input;
}

// Driving input for this frame: throttle, brake, steer, nos.
export function driveInput(input) {
  const up = input.keys.KeyW || input.keys.ArrowUp;
  const down = input.keys.KeyS || input.keys.ArrowDown;
  const left = input.keys.KeyA || input.keys.ArrowLeft;
  const right = input.keys.KeyD || input.keys.ArrowRight;
  return {
    throttle: up ? 1 : 0,
    brake: down ? 1 : 0,
    steer: (left ? -1 : 0) + (right ? 1 : 0),
    nos: !!(input.keys.ShiftLeft || input.keys.ShiftRight),
  };
}

export function walkInput(input) {
  return {
    forward: !!(input.keys.KeyW || input.keys.ArrowUp),
    back: !!(input.keys.KeyS || input.keys.ArrowDown),
    left: !!(input.keys.KeyA || input.keys.ArrowLeft),
    right: !!(input.keys.KeyD || input.keys.ArrowRight),
    run: !!(input.keys.ShiftLeft || input.keys.ShiftRight),
  };
}

// Consume one queued press of a code, if it happened this frame.
export function wasPressed(input, code) {
  const i = input.pressed.indexOf(code);
  if (i === -1) return false;
  input.pressed.splice(i, 1);
  return true;
}

// Drop every queued press. Call it when a menu opens, so a stale key from
// the frame that opened it cannot close it again at once.
export function flushPressed(input) {
  input.pressed.length = 0;
}

export function endFrame(input) {
  input.pressed.length = 0;
  input.mousePressed = false;
}
