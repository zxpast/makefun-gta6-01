// Solano Heat — all sound is synthesised live with WebAudio: the engine
// hum, the police siren, gunshots, and three radio stations that play
// looping note patterns. No audio files, no network. The context starts on
// the first user gesture, as browsers require.

import { RADIO } from './config.js';

/** Scales, in semitones from the station's root: bright, dark, talky. */
const SCALES = [
  [0, 2, 4, 7, 9, 12, 14, 16],
  [0, 3, 5, 7, 10, 12, 15, 17],
  [0, 2, 3, 7, 8, 12, 14, 15],
];

function semitoneToFreq(root, semis) {
  return root * Math.pow(2, semis / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let soundOn = true;
  let station = 0;
  let radioTimer = null;
  let radioStep = 0;
  // The gunshot noise, built once and reused: a fresh buffer every shot
  // allocates and garbage-collects on every trigger pull.
  let noiseBuffer = null;

  function noise() {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.09);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    return noiseBuffer;
  }

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
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
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function note(freq, when, length, type, volume) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + length);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + length + 0.05);
  }

  function radioTick() {
    if (!ctx || !soundOn) return;
    const def = RADIO[station];
    const scale = SCALES[station % SCALES.length];
    const beat = 60 / def.bpm / 2;
    const when = ctx.currentTime + 0.05;
    const semis = scale[radioStep % scale.length];
    note(semitoneToFreq(def.root, semis), when, beat * 1.8, def.bright ? 'triangle' : 'sine', 0.12);
    if (radioStep % 4 === 0) {
      note(semitoneToFreq(def.root, -12), when, beat * 3.5, 'sine', 0.14);
    }
    if (radioStep % 8 === 6) {
      note(semitoneToFreq(def.root, 7), when, beat, 'square', 0.03);
    }
    radioStep += 1;
  }

  function startRadio() {
    stopRadio();
    const def = RADIO[station];
    const beat = 60 / def.bpm / 2;
    radioTimer = window.setInterval(radioTick, beat * 1000);
  }

  function stopRadio() {
    if (radioTimer !== null) {
      window.clearInterval(radioTimer);
      radioTimer = null;
    }
  }

  return {
    /** Call on the first gesture; starts the context and the radio. */
    start() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      startRadio();
    },
    setStation(index) {
      station = index;
      radioStep = 0;
      if (ctx) startRadio();
    },
    toggleSound() {
      soundOn = !soundOn;
      if (master) master.gain.value = soundOn ? 0.5 : 0;
      return soundOn;
    },
    get soundOn() {
      return soundOn;
    },
    get station() {
      return station;
    },
    /** Engine hum follows the car's speed; silent on foot. */
    setEngine(speed, driving) {
      if (!ctx || !soundOn) return;
      const target = driving ? 0.05 + Math.min(0.16, speed * 0.004) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed * 3.2, ctx.currentTime, 0.1);
    },
    /** The two-tone siren while the player is wanted. */
    setSiren(on, dt) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on && soundOn ? 0.05 : 0, ctx.currentTime, 0.2);
      if (!on) return;
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 720, ctx.currentTime, 0.05);
      }
    },
    shot() {
      if (!ctx || !soundOn) return;
      const src = ctx.createBufferSource();
      src.buffer = noise();
      const gain = ctx.createGain();
      gain.gain.value = 0.35;
      src.connect(gain);
      gain.connect(master);
      src.start();
    },
    punch() {
      if (!ctx || !soundOn) return;
      note(140, ctx.currentTime, 0.08, 'sine', 0.25);
    },
    cash() {
      if (!ctx || !soundOn) return;
      const now = ctx.currentTime;
      note(880, now, 0.12, 'triangle', 0.15);
      note(1318, now + 0.09, 0.18, 'triangle', 0.15);
    },
  };
}
