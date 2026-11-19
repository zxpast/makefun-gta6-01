// Solano Heat — keyboard input. Tracks held keys, edge presses (fired once
// per keydown), and a flag the game loop drains every frame.
// Single letters arrive as-is but lowercased; named keys (arrows, space,
// shift) keep their names, so the game can ask for 'w' and 'ArrowUp' alike.
function normKey(e) {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.anyKey = false;
    this.onKeyDown = (e) => {
      if (e.repeat) return;
      const k = normKey(e);
      this.held.add(k);
      this.pressed.add(k);
      this.anyKey = true;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    };
    this.onKeyUp = (e) => {
      this.held.delete(normKey(e));
    };
    this.onBlur = () => { this.held.clear(); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }
  down(...keys) { return keys.some(k => this.held.has(k)); }
  hit(...keys) { return keys.some(k => this.pressed.has(k)); }
  axis(neg, pos) {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }
  endFrame() {
    this.pressed.clear();
    this.anyKey = false;
  }
  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
