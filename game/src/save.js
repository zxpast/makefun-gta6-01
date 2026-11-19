// Solano Heat — save and load. Respect, cash, missions and upgrades persist
// between sessions in localStorage, so the meta currency is really persistent.
import { createState, parseSave, serializeSave } from './sim.js';
export const SAVE_KEY = 'solano-heat-save-v1';
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createState();
    return parseSave(raw) || createState();
  } catch { return createState(); }
}
export function writeSave(state) {
  try { localStorage.setItem(SAVE_KEY, serializeSave(state)); return true; }
  catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}
