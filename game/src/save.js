// Solano Heat — saving. One job: persist the campaign (money, mission progress,
// position, stats) to localStorage and read it back. Nothing here touches the
// network; a save that cannot be written is simply forgotten, never fatal.
export const SAVE_KEY = 'solano-heat.save.v1';

export function saveGame(game) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      player: {
        x: game.player.x,
        y: game.player.y,
        money: game.player.money,
        respect: game.player.respect,
        health: game.player.health,
        armor: game.player.armor,
        weapon: game.player.weapon,
        ammo: game.player.ammo,
        kills: game.player.kills,
        carsStolen: game.player.carsStolen,
        distanceDriven: game.player.distanceDriven,
      },
      missionIndex: game.missions.index,
      completed: game.missions.completed,
      clockMinutes: game.clockMinutes,
      best: game.best,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
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
    if (!data || data.version !== 1 || !data.player) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}
