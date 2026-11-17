// Solano Heat — synthesised sound.
//
// No audio files: every sound is made by the Web Audio API at run time — an
// engine tone that follows the car's speed, a two-tone siren while the police
// are after you, a blip on pickup and a little arpeggio when a mission pays.
// It starts on the first user gesture (browsers demand that) and stays silent
// in headless runs where there is no audio device. N toggles it.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let started = false;

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
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function blip(frequency, seconds, type, volume) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume || 0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
      osc.connect(gain).connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + seconds);
    } catch {
      // Sound is garnish: a failure here never stops the game.
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
    /** The engine note follows speed: 0 at rest, up to a whine at full speed. */
    engine(speedRatio, driving) {
      if (!ensure() || muted || !driving) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      engineOsc.frequency.value = 50 + speedRatio * 160;
      engineGain.gain.value = 0.03 + speedRatio * 0.04;
    },
    /** The siren wails while wanted is 2 or more; quiet otherwise. */
    siren(wanted, dt) {
      if (!ensure() || muted || wanted < 2) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      sirenTimer += dt;
      if (sirenTimer > 0.45) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 950 : 700;
      }
      sirenGain.gain.value = 0.035;
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.12);
      blip(880, 0.16, 'sine', 0.1);
    },
    punch() {
      blip(140, 0.1, 'square', 0.1);
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
