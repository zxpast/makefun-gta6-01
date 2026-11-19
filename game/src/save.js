// Save and load through localStorage. The sim serializes to plain JSON (no Infinity —
// off timers use -1), so a save round-trips exactly and a corrupt save is ignored.
import { SAVE_KEY } from './config.js';

export function createSave(sim, missions) {
  function saveGame() {
    try {
      const data = {
        sim: sim.serialize(),
        completed: missions.completed,
        at: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw === null) return false;
      const data = JSON.parse(raw);
      if (data === null || typeof data !== 'object') return false;
      if (data.sim === undefined) return false;
      sim.deserialize(data.sim);
      if (Array.isArray(data.completed)) missions.restore(data.completed);
      return true;
    } catch {
      return false;
    }
  }

  function hasSave() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // No storage available; nothing to clear.
    }
  }

  return { saveGame, loadGame, hasSave, clearSave };
}
