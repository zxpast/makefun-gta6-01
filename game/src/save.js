// Solano Heat — saves between visits: cash, garage, weapons, completed
// chapters and the player's last spot. Kept small and versioned; a save
// from an older version is ignored, never trusted.
import { SAVE_KEY } from './config.js';

const SAVE_VERSION = 5;

function pack(sim, missions) {
  const s = sim.state;
  return {
    version: SAVE_VERSION,
    cash: s.cash,
    upgrades: s.upgrades,
    weapons: s.weapons,
    completed: missions.state.completed,
    chapterIndex: missions.state.chapterIndex,
    player: { x: s.player.x, z: s.player.z },
  };
}

export function saveGame(sim, missions) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(pack(sim, missions)));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(sim, missions, data) {
  if (!data) return;
  const s = sim.state;
  s.cash = data.cash ?? s.cash;
  Object.assign(s.upgrades, data.upgrades ?? {});
  Object.assign(s.weapons, data.weapons ?? {});
  missions.state.completed = data.completed ?? [];
  missions.state.chapterIndex = data.chapterIndex ?? 0;
  if (data.player) {
    s.player.x = data.player.x;
    s.player.z = data.player.z;
  }
}
