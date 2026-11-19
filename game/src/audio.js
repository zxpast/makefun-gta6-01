// Procedural audio: no music files, just oscillators. Three radio stations (SOL FM,
// NEON NIGHTS, PIER TALK — names, tempos and roots from config), an engine hum
// tied to speed, and a police siren.
import { RADIO } from './config.js';

// A minor arpeggio built on the station's own root frequency.
const ARPEGGIO = [1, 1.19, 1.5, 1.78, 1.5, 1.19];

export function createAudio() {
  let ctx = null;
  let station = 0;
  let musicTimer = null;
  let noteIndex = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let enabled = false;

  function ensure() {
    if (ctx !== null) return;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (AudioContext === undefined) return;
    ctx = new AudioContext();
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.type = 'sawtooth';
    engineOsc.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.type = 'sine';
    sirenOsc.connect(sirenGain);
    sirenGain.connect(ctx.destination);
    sirenOsc.start();
  }

  function playNote(freq, seconds) {
    if (ctx === null || !enabled) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = RADIO[station].wave ?? 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function startMusic() {
    stopMusic();
    const stationDef = RADIO[station];
    musicTimer = window.setInterval(() => {
      playNote(stationDef.root * ARPEGGIO[noteIndex % ARPEGGIO.length], 60 / stationDef.tempo);
      noteIndex += 1;
    }, 60000 / stationDef.tempo);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function start() {
    ensure();
    if (ctx === null) return;
    if (ctx.state === 'suspended') ctx.resume();
    enabled = true;
    startMusic();
  }

  function nextStation() {
    setStation((station + 1) % RADIO.length);
  }

  // The sim owns the radio index (R cycles it); the audio follows it, so the
  // station the HUD shows is the station the speakers play.
  function setStation(index) {
    station = ((index % RADIO.length) + RADIO.length) % RADIO.length;
    noteIndex = 0;
    if (enabled) startMusic();
  }

  function stationIndex() {
    return station;
  }

  function update(carSpeed, wanted) {
    if (ctx === null || !enabled) return;
    if (engineOsc !== null && engineGain !== null) {
      engineOsc.frequency.value = 40 + Math.abs(carSpeed) * 4;
      engineGain.gain.value = carSpeed === 0 ? 0 : 0.05;
    }
    if (sirenOsc !== null && sirenGain !== null) {
      if (wanted > 0) {
        sirenOsc.frequency.value = 700 + Math.sin(performance.now() / 300) * 250;
        sirenGain.gain.value = 0.04;
      } else {
        sirenGain.gain.value = 0;
      }
    }
  }

  function label() {
    return RADIO[station].name;
  }

  return { start, nextStation, setStation, stationIndex, update, label };
}
