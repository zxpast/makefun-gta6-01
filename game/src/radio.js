// Solano Heat — radio and sound. Three synth stations built from WebAudio
// oscillators (no audio files), plus engine hum, sirens and impact thuds.
export const STATIONS = [
  { name: 'SOL 98.5 — Sunset FM', wave: 'sawtooth', bpm: 96, root: 110, mood: 'drive' },
  { name: 'NEON 104 — Night Drive', wave: 'square', bpm: 122, root: 98, mood: 'synth' },
  { name: 'CALLE 88 — Latin Heat', wave: 'triangle', bpm: 132, root: 130.8, mood: 'latin' },
];
const SCALES = {
  drive: [1, 1.122, 1.335, 1.498, 1.782],
  synth: [1, 1.189, 1.335, 1.587, 1.782],
  latin: [1, 1.122, 1.26, 1.498, 1.682],
};

export class Radio {
  constructor() {
    this.ctx = null;
    this.station = 0;
    this.enabled = false;
    this.nextNote = 0;
    this.step = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenOsc = null;
  }
  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch { this.ctx = null; }
  }
  toggle() { this.enabled = !this.enabled; if (this.enabled) this.ensure(); return this.enabled; }
  nextStation() { this.station = (this.station + 1) % STATIONS.length; this.step = 0; return STATIONS[this.station].name; }
  name() { return STATIONS[this.station].name; }
  update(dt, speed, wanted) {
    if (!this.ctx) return;
    if (this.engineGain) {
      this.engineGain.gain.value = this.enabled ? 0.05 : 0.03;
      this.engineOsc.frequency.value = 42 + Math.abs(speed) * 2.4;
    }
    if (!this.enabled) { this.setSiren(false); return; }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const st = STATIONS[this.station];
    const beat = 60 / st.bpm / 2;
    this.nextNote -= dt;
    if (this.nextNote <= 0) {
      this.nextNote = beat;
      const scale = SCALES[st.mood];
      const note = scale[this.step % scale.length] * st.root * (this.step % 16 < 8 ? 1 : 2);
      this.blip(note, beat * 0.9, st.wave, 0.5);
      if (this.step % 4 === 0) this.blip(st.root / 2, beat * 1.8, 'sine', 0.7);
      this.step++;
    }
    this.setSiren(wanted >= 2);
  }
  blip(freq, dur, wave, vol) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(vol * 0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  setSiren(on) {
    if (on === this.sirenOn || !this.ctx) return;
    this.sirenOn = on;
    if (on) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.9;
      const lg = this.ctx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 880;
      this.sirenOsc.connect(g); g.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this.sirenGain = g; this.sirenLfo = lfo;
    } else if (this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
    }
  }
  thud() { this.blip(70, 0.18, 'sine', 1.0); }
  shot() { this.blip(180, 0.09, 'square', 0.8); }
  chime() { this.blip(880, 0.25, 'sine', 0.6); setTimeout(() => this.blip(1318, 0.3, 'sine', 0.5), 120); }
}
