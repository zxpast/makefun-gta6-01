// Synthesised sound for Port Solano — no audio files anywhere.
//
// Every sound is made by the Web Audio API at run time: an engine tone that
// follows the car's speed, a two-tone siren while the police are after you,
// gunshots, a pickup blip, a mission arpeggio, and three radio stations
// (SOL FM, NEON NIGHTS, PIER TALK) built from scheduled oscillator notes —
// a mellow chord pad, a driving bass line, and a sparse talk-style blip
// pattern. It starts on the first user gesture, as browsers demand, and
// stays silent where there is no audio device. N toggles it, R changes
// station.
import { RADIO } from './config.js';

const STATION_NOTES = {
  solfm: {
    // Am9 — Fmaj7 — Cmaj7 — G6, slow pad chords.
    chords: [[57, 60, 64, 71], [53, 57, 60, 65], [48, 55, 59, 64], [55, 59, 62, 67]],
    beat: 0.55,
    wave: 'triangle',
    gain: 0.05,
  },
  neon: {
    // Driving minor bass: A — F — C — G, eighth notes.
    bass: [33, 33, 45, 33, 29, 29, 41, 29, 36, 36, 48, 36, 31, 31, 43, 31],
    beat: 0.24,
    wave: 'sawtooth',
    gain: 0.045,
  },
  pier: {
    // Sparse talk-show blips over a low drone.
    blips: [72, 0, 69, 0, 0, 67, 0, 72, 0, 0, 65, 0],
    beat: 0.32,
    wave: 'sine',
    gain: 0.04,
  },
};

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let radioGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let started = false;
  let station = 0;
  let radioStep = 0;
  let radioTimer = 0;

  function ensure() {
    if (started) return context !== null;
    started = true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(context.destination);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(context.destination);
      sirenOsc.start();
      radioGain = context.createGain();
      radioGain.gain.value = 1;
      radioGain.connect(context.destination);
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function blip(frequency, seconds, type, volume, when) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const t0 = when ?? context.currentTime;
      osc.type = type || 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume || 0.1, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      osc.connect(gain).connect(context.destination);
      osc.start(t0);
      osc.stop(t0 + seconds);
    } catch {
      // Sound is garnish: a failure here never stops the game.
    }
  }

  function radioNote(frequency, seconds, type, volume) {
    if (!ensure() || muted || !radioGain) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
      osc.connect(gain).connect(radioGain);
      osc.start();
      osc.stop(context.currentTime + seconds);
    } catch {
      // As above: never let sound stop the game.
    }
  }

  function stepRadio(dt) {
    if (!ensure() || muted) return;
    const def = STATION_NOTES[RADIO[station].id];
    if (!def) return;
    radioTimer -= dt;
    if (radioTimer > 0) return;
    radioTimer += def.beat;
    const step = radioStep;
    radioStep += 1;
    if (def.chords) {
      const chord = def.chords[Math.floor(step / 4) % def.chords.length];
      for (const note of chord) radioNote(midiToFreq(note), def.beat * 4.5, def.wave, def.gain);
    } else if (def.bass) {
      const note = def.bass[step % def.bass.length];
      radioNote(midiToFreq(note), def.beat * 1.8, def.wave, def.gain);
      if (step % 4 === 0) radioNote(midiToFreq(note + 12), def.beat, 'square', def.gain * 0.5);
    } else if (def.blips) {
      const note = def.blips[step % def.blips.length];
      if (note) radioNote(midiToFreq(note), def.beat * 1.4, def.wave, def.gain);
      radioNote(midiToFreq(36), def.beat * 2, 'sine', def.gain * 0.6);
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMuted() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    isMuted() {
      return muted;
    },
    station() {
      return station;
    },
    setStation(index) {
      station = ((index % RADIO.length) + RADIO.length) % RADIO.length;
      radioStep = 0;
      radioTimer = 0;
      return station;
    },
    // Call every frame: engine, siren and the radio scheduler.
    update(dt, speedRatio, driving, wanted) {
      if (!ensure()) return;
      if (muted || !driving) {
        if (engineGain) engineGain.gain.value = 0;
      } else {
        engineOsc.frequency.value = 50 + speedRatio * 170;
        engineGain.gain.value = 0.03 + speedRatio * 0.04;
      }
      if (muted || wanted < 2) {
        if (sirenGain) sirenGain.gain.value = 0;
      } else {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.value = sirenHigh ? 950 : 700;
        }
        sirenGain.gain.value = 0.035;
      }
      stepRadio(dt);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.12);
      blip(880, 0.16, 'sine', 0.1);
    },
    punch() {
      blip(140, 0.1, 'square', 0.1);
    },
    shoot(kind) {
      if (kind === 'shotgun') {
        blip(90, 0.25, 'sawtooth', 0.16);
        blip(55, 0.2, 'square', 0.12);
      } else if (kind === 'smg') {
        blip(320, 0.06, 'square', 0.09);
      } else {
        blip(220, 0.09, 'square', 0.11);
      }
    },
    nos() {
      blip(300, 0.5, 'sawtooth', 0.08);
      blip(600, 0.4, 'sawtooth', 0.06, (context ? context.currentTime : 0) + 0.15);
    },
    denied() {
      blip(180, 0.25, 'square', 0.1);
    },
    missionComplete() {
      blip(523, 0.14, 'triangle', 0.14);
      setTimeout(() => blip(659, 0.14, 'triangle', 0.14), 120);
      setTimeout(() => blip(784, 0.22, 'triangle', 0.14), 240);
    },
    busted() {
      blip(220, 0.4, 'sawtooth', 0.1);
      setTimeout(() => blip(165, 0.5, 'sawtooth', 0.1), 200);
    },
  };
}
