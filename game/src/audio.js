// Sound for Solano Heat, synthesized live — no audio files. The engine is a
// sawtooth that follows speed, the siren is a two-tone wail, the radio is
// three stations of scheduled notes, and every crash, shot and pickup is a
// burst of shaped noise. Everything guards on the audio context, so the game
// never breaks when the browser has not granted sound yet.

export const RADIO = [
  { name: 'SOL 98.5 — Synthwave', root: 220, pattern: [0, 3, 7, 10, 12, 10, 7, 3] },
  { name: 'BAY FM — Funk', root: 196, pattern: [0, 0, 5, 7, 5, 3, 0, 10] },
  { name: 'TIDE 104 — Chill', root: 261, pattern: [0, 4, 7, 12, 7, 4, 2, 0] },
];

export function makeAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    station: 0,
    radioTimer: 0,
    radioStep: 0,
    muted: false,
  };
}

export function ensureAudio(audio) {
  if (audio.ctx) {
    resumeAudio(audio);
    return true;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 60;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 700;
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    return true;
  } catch {
    return false;
  }
}

// A context created before the first gesture starts suspended; resume it
// on the gesture that starts the game, so the engine note is audible.
export function resumeAudio(audio) {
  if (audio.ctx && audio.ctx.state === 'suspended') {
    audio.ctx.resume().catch(() => {});
  }
}

export function setEngine(audio, speed, nos) {
  if (!audio.ctx || audio.muted) return;
  const target = 55 + Math.abs(speed) * 3.2 + (nos ? 90 : 0);
  audio.engineOsc.frequency.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
  audio.engineGain.gain.setTargetAtTime(Math.abs(speed) > 0.5 ? 0.05 : 0, audio.ctx.currentTime, 0.1);
}

export function setSiren(audio, on) {
  if (!audio.ctx || audio.muted) return;
  audio.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, audio.ctx.currentTime, 0.2);
}

export function stepRadio(audio, dt) {
  if (!audio.ctx || audio.muted) return;
  audio.radioTimer -= dt;
  if (audio.radioTimer > 0) return;
  audio.radioTimer = 0.24;
  const station = RADIO[audio.station % RADIO.length];
  const note = station.pattern[audio.radioStep % station.pattern.length];
  audio.radioStep += 1;
  const freq = station.root * Math.pow(2, note / 12);
  const osc = audio.ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(0.045, audio.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.22);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start();
  osc.stop(audio.ctx.currentTime + 0.24);
}

export function cycleStation(audio) {
  audio.station = (audio.station + 1) % RADIO.length;
  audio.radioStep = 0;
  return RADIO[audio.station].name;
}

function burst(audio, freq, dur, vol, type = 'sine') {
  if (!audio.ctx || audio.muted) return;
  const osc = audio.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), audio.ctx.currentTime + dur);
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(vol, audio.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start();
  osc.stop(audio.ctx.currentTime + dur);
}

export function sfx(audio, name) {
  if (!audio.ctx || audio.muted) return;
  if (name === 'crash') burst(audio, 110, 0.25, 0.3, 'sawtooth');
  else if (name === 'shot') burst(audio, 900, 0.09, 0.25, 'square');
  else if (name === 'pickup') burst(audio, 660, 0.12, 0.2);
  else if (name === 'complete') {
    burst(audio, 523, 0.14, 0.2);
    setTimeout(() => burst(audio, 784, 0.2, 0.2), 130);
  } else if (name === 'fail') burst(audio, 180, 0.4, 0.25, 'sawtooth');
  else if (name === 'busted') burst(audio, 140, 0.6, 0.3, 'sawtooth');
}
