// Solano Heat — synthesized sound. One job: every noise the game makes, built
// from raw WebAudio oscillators and filtered noise, so the game ships no audio
// files at all. Silent until the first user gesture (browsers demand that).
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  ensure() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* sound is decoration; never break the game */ }
  }

  noise(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      let node = src;
      if (lowpass) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lowpass;
        src.connect(filter);
        node = filter;
      }
      node.connect(gain);
      gain.connect(this.master);
      src.start(t);
    } catch { /* ignore */ }
  }

  gunshot() { this.noise(0.12, 0.5, 1800); this.blip(160, 0.08, 'sawtooth', 0.18, 60); }
  punch() { this.noise(0.08, 0.3, 900); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); this.blip(990, 0.14, 'sine', 0.2); }
  cash() { this.blip(880, 0.08, 'sine', 0.2); this.blip(1174, 0.08, 'sine', 0.2); this.blip(1568, 0.16, 'sine', 0.2); }
  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.25), i * 110));
  }
  missionFail() { this.blip(220, 0.4, 'sawtooth', 0.2, 110); }
  crash() { this.noise(0.25, 0.45, 700); }
  honk() { this.blip(370, 0.18, 'square', 0.12, 370); this.blip(466, 0.18, 'square', 0.1, 466); }
  wantedUp() { this.blip(440, 0.12, 'square', 0.2); this.blip(330, 0.2, 'square', 0.2); }
  explosion() { this.noise(0.7, 0.6, 500); this.blip(90, 0.5, 'sine', 0.4, 30); }

  // A looping engine note whose pitch follows the car's speed; call every frame.
  engine(speedRatio, active) {
    if (!this.ctx || this.muted) { this.stopEngine(); return; }
    try {
      if (!active) { this.stopEngine(); return; }
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 60;
        this.engineGain.gain.value = 0.0;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 160, this.ctx.currentTime, 0.05);
      this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.06, this.ctx.currentTime, 0.05);
    } catch { /* ignore */ }
  }

  stopEngine() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch { /* already stopped */ }
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  // Two-tone police siren while any police unit is close; call every frame.
  siren(dt, active) {
    if (!this.ctx || this.muted) return;
    this.sirenTimer += dt;
    try {
      if (!active) {
        if (this.sirenOsc) { this.sirenOsc.stop(); this.sirenOsc = null; }
        return;
      }
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.value = 0.045;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      }
      const phase = Math.floor(this.sirenTimer / 0.45) % 2;
      this.sirenOsc.frequency.setTargetAtTime(phase === 0 ? 700 : 950, this.ctx.currentTime, 0.03);
    } catch { /* ignore */ }
  }
}
