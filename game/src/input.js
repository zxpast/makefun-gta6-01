// Solano Heat — keyboard and mouse input. One job: turn browser events into a
// small, testable state object the game loop reads each step.
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  shoot: ['Mouse0'],
  reload: ['KeyR'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  weapon4: ['Digit4'],
  pause: ['Escape', 'KeyP'],
  mission: ['KeyM'],
  honk: ['KeyH'],
  interact: ['KeyF'],
};

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.canvas = canvas;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.down.add(event.code);
      this.pressed.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
    });
    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    });
    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  held(action) {
    if (action === 'shoot') return this.mouseDown;
    return KEYS[action].some((code) => this.down.has(code));
  }

  wasPressed(action) {
    if (action === 'shoot') return this.mousePressed;
    return KEYS[action].some((code) => this.pressed.has(code));
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
  }
}

// A scripted input source for the screenshot scenes: the autopilot writes into
// this instead of the keyboard, and the game loop cannot tell the difference.
export class ScriptedInput {
  constructor() {
    this.axes = { x: 0, y: 0 };
    this.sprint = false;
    this.enterCar = false;
    this.shoot = false;
    this.aimX = 0;
    this.aimY = 0;
  }

  held(action) {
    if (action === 'up') return this.axes.y < -0.2;
    if (action === 'down') return this.axes.y > 0.2;
    if (action === 'left') return this.axes.x < -0.2;
    if (action === 'right') return this.axes.x > 0.2;
    if (action === 'sprint') return this.sprint;
    if (action === 'enterCar') return this.enterCar;
    if (action === 'shoot') return this.shoot;
    return false;
  }

  wasPressed() {
    return false;
  }

  endFrame() {}
}
