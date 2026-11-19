// Solano Heat — progress that survives a visit: cash, garage, weapons and
// finished chapters. The payload is plain JSON; the browser half only knows
// localStorage, so the tests can exercise the same code without a window.

import { SAVE_KEY } from './config.js';

/** The save payload from a sim and its missions. */
export function serialize(sim, missions) {
  const data = sim.saveData(missions.completed);
  // JSON has no Infinity: the fists' unlimited ammo would serialise as
  // null and come back as null, which the shoot check reads as empty.
  // Store it as -1 (ammo is never negative in the game) and map it back
  // in deserialize.
  data.ammo = data.ammo.map((a) => (a === Infinity ? -1 : a));
  return JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    ...data,
  });
}

function isAmmo(value) {
  return value === -1 || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/** Parse a payload back, or null when it is not a save we wrote. */
export function deserialize(text) {
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== 1) return null;
    // A hand-edited or truncated save must not reach the sim: every field
    // is checked, and anything the wrong shape is rejected outright.
    if (typeof data.cash !== 'number' || !Number.isFinite(data.cash) || data.cash < 0) return null;
    if (data.garage && typeof data.garage !== 'object') return null;
    if (data.garage && (typeof data.garage.armor !== 'boolean' || typeof data.garage.engine !== 'boolean' || typeof data.garage.nos !== 'boolean')) return null;
    if (data.garage && (typeof data.garage.nosLeft !== 'number' || !Number.isFinite(data.garage.nosLeft) || data.garage.nosLeft < 0)) return null;
    if (!Number.isInteger(data.weapon) || data.weapon < 0 || data.weapon > 3) return null;
    if (!Array.isArray(data.owned) || data.owned.length !== 4 || !data.owned.every((o) => typeof o === 'boolean')) return null;
    if (!Array.isArray(data.ammo) || data.ammo.length !== 4 || !data.ammo.every(isAmmo)) return null;
    if (typeof data.maxHealth !== 'number' || !Number.isFinite(data.maxHealth) || data.maxHealth <= 0) return null;
    if (!Array.isArray(data.chapters) || !data.chapters.every((c) => Number.isInteger(c) && c >= 0 && c <= 7)) return null;
    data.ammo = data.ammo.map((a) => (a === -1 || a === null ? Infinity : a));
    return data;
  } catch {
    return null;
  }
}

export function createSave(sim, missions) {
  return {
    /** Write progress now. */
    save() {
      try {
        window.localStorage.setItem(SAVE_KEY, serialize(sim, missions));
        return true;
      } catch {
        return false;
      }
    },
    /** Read progress back, or null when there is none. */
    load() {
      try {
        const text = window.localStorage.getItem(SAVE_KEY);
        return text ? deserialize(text) : null;
      } catch {
        return null;
      }
    },
    /** Apply a loaded payload to the sim and its missions. */
    apply(data) {
      if (!data) return false;
      sim.loadSaveData(data);
      if (Array.isArray(data.chapters)) {
        for (const c of data.chapters) {
          if (typeof c === 'number' && !missions.completed.includes(c)) missions.completed.push(c);
        }
      }
      return true;
    },
  };
}
