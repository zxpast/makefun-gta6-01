// Solano Heat — save and load. Respect, cash, jobs and upgrades persist
// between sessions in localStorage, so the meta currency is really persistent.
import { createState, parseSave, serializeSave } from './sim.js';

export const SAVE_KEY = 'solano-heat-save-v1';

function readRaw() {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch { return null; }
}

export function loadSave() {
  const raw = readRaw();
  if (!raw) return createState();
  return parseSave(raw) || createState();
}
export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, serializeSave(state));
    return true;
  } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}
