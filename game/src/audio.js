// Solano Heat — all sound is synthesised live with WebAudio: engine hum
// that follows speed, a two-tone police siren, gunshots, and three radio
// stations (no audio files). Mute with N; radio with R.
const STATIONS = [
  { name: 'SOL FM', bpm: 112, root: 110, scale: [0, 3, 5, 7, 10], wave: 'sawtooth' },
  { name: 'NEON NIGHTS', bpm: 96, root: 98, scale: [0, 2, 3, 7, 8], wave: 'square' },
  { name: 'PIER TALK', bpm: 80, root: 131, scale: [0, 4, 5, 7, 11], wave: 'triangle' },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let radioTimer = null;
  let station = 0;
  let muted = false;
  let sirenOn = false;
  let sirenOsc = null;
  let sirenGain = null;
  let stepCount = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function note(freq, when, dur, wave, gain) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function radioBeat() {
    if (!ctx || muted) return;
    const st = STATIONS[station];
    const beat = 60 / st.bpm;
    const when = ctx.currentTime + 0.05;
    const degree = st.scale[stepCount % st.scale.length];
    const octave = Math.floor(stepCount / st.scale.length) % 2;
    const freq = st.root * 2 ** (degree / 12 + octave);
    note(freq, when, beat * 0.9, st.wave, 0.10);
    if (stepCount % 4 === 0) note(st.root / 2, when, beat * 1.8, 'sine', 0.14);
    if (stepCount % 2 === 1) note(freq * 2, when, beat * 0.4, 'sine', 0.05);
    stepCount += 1;
    radioTimer = window.setTimeout(radioBeat, beat * 1000);
  }

  function startRadio() {
    stopRadio();
    stepCount = 0;
    radioBeat();
  }

  function stopRadio() {
    if (radioTimer !== null) {
      window.clearTimeout(radioTimer);
      radioTimer = null;
    }
  }

  function setSiren(on) {
    if (on === sirenOn) return;
    sirenOn = on;
    if (!ctx) return;
    if (on) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
      sirenOsc._lfo = lfo;
    } else if (sirenOsc) {
      try { sirenOsc._lfo.stop(); } catch { /* already stopped */ }
      sirenOsc.stop();
      sirenOsc = null;
    }
  }

  return {
    stationName() { return STATIONS[station].name; },
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
      if (value) stopRadio();
      else startRadio();
    },
    isMuted() { return muted; },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      if (ctx && !muted) startRadio();
      return STATIONS[station].name;
    },
    update(speed, wantedStars) {
      if (!ctx || muted) return;
      if (engineGain) {
        engineGain.gain.value = 0.02 + Math.min(0.1, Math.abs(speed) * 0.003);
        engineOsc.frequency.value = 50 + Math.abs(speed) * 4;
      }
      setSiren(wantedStars > 0);
    },
    shot() {
      if (!ctx || muted) return;
      const when = ctx.currentTime;
      const buffer = ctx.createBuffer(1, 2205, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(g);
      g.connect(master);
      src.start(when);
    },
    crash() {
      if (!ctx || muted) return;
      note(70, ctx.currentTime, 0.25, 'sawtooth', 0.2);
    },
    chime() {
      if (!ctx || muted) return;
      note(880, ctx.currentTime, 0.15, 'sine', 0.15);
      note(1318, ctx.currentTime + 0.12, 0.25, 'sine', 0.15);
    },
  };
}
