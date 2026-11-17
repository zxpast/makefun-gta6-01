// Solano Heat — saving between visits.
//
// One small JSON blob in localStorage: the cash, which chapters are done, which
// chapter is current, and the best (most cash held at once). Loading is
// forgiving — a missing, broken or private-mode store just starts a new game.
// Nothing here knows about the world; the caller hands it plain numbers.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number.isFinite(data.cash) ? data.cash : 0,
      chapter: Number.isInteger(data.chapter) ? data.chapter : 0,
      completed: Array.isArray(data.completed) ? data.completed : [],
      bestCash: Number.isFinite(data.bestCash) ? data.bestCash : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: save.cash,
      chapter: save.chapter,
      completed: save.completed,
      bestCash: save.bestCash,
    }));
    return true;
  } catch {
    // Private windows and full stores just mean the save lasts this visit.
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: the store is already unreachable.
  }
}
