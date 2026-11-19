// Solano Heat — every sound is synthesised live with WebAudio. There are
// no audio files: the engine hum follows the car's speed, a two-tone
// siren wails while you are wanted, gunshots are noise bursts, and the
// radio is three stations of generated notes. Mute with N; radio with R.
const STATIONS = [
  { name: 'SOL FM', bpm: 112, root: 110, steps: [0, 3, 5, 7, 10], voice: 'sawtooth' },
  { name: 'NEON NIGHTS', bpm: 96, root: 98, steps: [0, 2, 3, 7, 8], voice: 'square' },
  { name: 'PIER TALK', bpm: 80, root: 131, steps: [0, 4, 5, 7, 11], voice: 'triangle' },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let engineLevel = null;
  let radioClock = null;
  let station = 0;
  let muted = false;
  let siren = null;
  let sirenLevel = null;
  let sirenWailing = false;
  let beatCount = 0;

  function open() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 420;
      engineLevel = ctx.createGain();
      engineLevel.gain.value = 0;
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      engine.connect(lowpass);
      lowpass.connect(engineLevel);
      engineLevel.connect(master);
      engine.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, when, dur, voice, level) {
    const osc = ctx.createOscillator();
    osc.type = voice;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function playBeat() {
    if (!ctx || muted) return;
    const st = STATIONS[station];
    const beat = 60 / st.bpm;
    const when = ctx.currentTime + 0.05;
    const degree = st.steps[beatCount % st.steps.length];
    const octave = Math.floor(beatCount / st.steps.length) % 2;
    const freq = st.root * 2 ** (degree / 12 + octave);
    tone(freq, when, beat * 0.9, st.voice, 0.10);
    if (beatCount % 4 === 0) tone(st.root / 2, when, beat * 1.8, 'sine', 0.14);
    if (beatCount % 2 === 1) tone(freq * 2, when, beat * 0.4, 'sine', 0.05);
    beatCount += 1;
    radioClock = window.setTimeout(playBeat, beat * 1000);
  }

  function restartRadio() {
    stopRadio();
    beatCount = 0;
    playBeat();
  }

  function stopRadio() {
    if (radioClock !== null) {
      window.clearTimeout(radioClock);
      radioClock = null;
    }
  }

  function wail(on) {
    if (on === sirenWailing) return;
    sirenWailing = on;
    if (!ctx) return;
    if (on) {
      siren = ctx.createOscillator();
      siren.type = 'sine';
      siren.frequency.value = 660;
      sirenLevel = ctx.createGain();
      sirenLevel.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 180;
      lfo.connect(lfoDepth);
      lfoDepth.connect(siren.frequency);
      siren.connect(sirenLevel);
      sirenLevel.connect(master);
      siren.start();
      lfo.start();
      siren._lfo = lfo;
    } else if (siren) {
      try { siren._lfo.stop(); } catch { /* already stopped */ }
      siren.stop();
      siren = null;
    }
  }

  return {
    stationName() { return STATIONS[station].name; },
    unlock() { open(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
      if (value) stopRadio();
      else restartRadio();
    },
    isMuted() { return muted; },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      if (ctx && !muted) restartRadio();
      return STATIONS[station].name;
    },
    update(speed, wantedStars) {
      if (!ctx || muted) return;
      if (engineLevel) {
        engineLevel.gain.value = 0.02 + Math.min(0.1, Math.abs(speed) * 0.003);
        engine.frequency.value = 50 + Math.abs(speed) * 4;
      }
      wail(wantedStars > 0);
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
      tone(70, ctx.currentTime, 0.25, 'sawtooth', 0.2);
    },
    chime() {
      if (!ctx || muted) return;
      tone(880, ctx.currentTime, 0.15, 'sine', 0.15);
      tone(1318, ctx.currentTime + 0.12, 0.25, 'sine', 0.15);
    },
  };
}
