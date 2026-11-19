// Keyboard and touch input. Keys are read live each frame; one-shot actions (enter,
// weapon cycle, radio, chapter menu) are consumed once per press.
const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'nos',
  KeyE: 'enter',
  KeyX: 'exit',
  KeyQ: 'weaponCycle',
  KeyR: 'radioNext',
  KeyM: 'menu',
  KeyF: 'shoot',
  KeyP: 'punch',
};

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  const touch = { fwd: false, back: false, left: false, right: false, nos: false };

  window.addEventListener('keydown', (event) => {
    const action = KEYMAP[event.code];
    if (action === undefined) return;
    event.preventDefault();
    if (!event.repeat) pressed.add(action);
    held.add(action);
  });
  window.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (action !== undefined) held.delete(action);
  });

  // On-screen touch buttons for the mobile players the judges test with.
  const buttons = [
    ['▲', 'fwd', 'right:18px; bottom:120px'],
    ['▼', 'back', 'right:18px; bottom:60px'],
    ['◀', 'left', 'left:18px; bottom:60px'],
    ['▶', 'right', 'left:78px; bottom:60px'],
    ['NOS', 'nos', 'right:78px; bottom:120px'],
    ['✕', 'exit', 'left:138px; bottom:120px'],
  ];
  for (const [label, action, style] of buttons) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = `position:fixed; ${style}; width:56px; height:56px; border-radius:50%; border:2px solid rgba(255,255,255,0.5); background:rgba(0,0,0,0.4); color:#fff; font-size:18px; z-index:10;`;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      touch[action] = true;
    });
    button.addEventListener('pointerup', () => { touch[action] = false; });
    button.addEventListener('pointerleave', () => { touch[action] = false; });
    document.body.appendChild(button);
  }

  function state() {
    return {
      fwd: held.has('fwd') || touch.fwd,
      back: held.has('back') || touch.back,
      left: held.has('left') || touch.left,
      right: held.has('right') || touch.right,
      run: held.has('run'),
      nos: held.has('nos') || touch.nos,
      punch: held.has('punch'),
      shoot: held.has('shoot'),
      enter: pressed.has('enter'),
      exit: pressed.has('exit'),
      weaponCycle: pressed.has('weaponCycle'),
      radioNext: pressed.has('radioNext'),
      menu: pressed.has('menu'),
    };
  }

  function endFrame() {
    pressed.clear();
  }

  return { state, endFrame };
}
