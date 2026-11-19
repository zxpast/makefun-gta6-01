// Money and respect in Solano Bay. Cash buys guns, health and paint; respect
// is the meta currency that never resets — it opens garage tiers and marks
// Rook's standing on the street. Saves live in localStorage and load back
// exactly as they were left.

import { blankSave, validSave, SAVE_KEY, garagePrice, shopPrice, respectRank, GARAGE_PARTS, SHOP_ITEMS } from './sim.js';

export function makeEconomy(save) {
  const base = validSave(save) ? save : blankSave();
  return {
    cash: base.cash,
    respect: base.respect,
    mission: base.mission,
    completed: [...base.completed],
    garage: { ...base.garage },
    weapons: { ...base.weapons },
    ammo: base.ammo,
    day: base.day,
  };
}

export function addReward(economy, reward) {
  economy.cash += reward.cash;
  economy.respect += reward.respect;
  return economy;
}

export function spend(economy, amount) {
  if (!canAfford(economy, amount)) return false;
  economy.cash -= amount;
  return true;
}

export function canAfford(economy, amount) {
  return economy.cash >= amount;
}

// Wipe the save and start over with a fresh $500. Used by a new game.
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function buyGarage(economy, part) {
  const level = economy.garage[part] ?? 0;
  if (part !== 'paint' && level >= 3) return { ok: false, reason: 'Already maxed.' };
  const price = garagePrice(part, part === 'paint' ? 1 : level + 1);
  if (!spend(economy, price)) return { ok: false, reason: 'Not enough cash.' };
  if (part === 'paint') economy.garage.paint = (economy.garage.paint + 1) % 6;
  else economy.garage[part] = level + 1;
  return { ok: true, price };
}

export function buyShop(economy, item) {
  const price = shopPrice(item);
  if (!price) return { ok: false, reason: 'No such item.' };
  if (!spend(economy, price)) return { ok: false, reason: 'Not enough cash.' };
  if (item === 'health') return { ok: true, heal: SHOP_ITEMS.health.heal };
  if (item === 'ammo') {
    economy.ammo += SHOP_ITEMS.ammo.rounds;
    return { ok: true };
  }
  economy.weapons[item] = true;
  economy.ammo += 30;
  return { ok: true };
}

export function rankName(economy) {
  return respectRank(economy.respect);
}

export function garageSummary(economy) {
  return Object.keys(GARAGE_PARTS).map((part) => ({
    part,
    name: GARAGE_PARTS[part].name,
    level: economy.garage[part] ?? 0,
    price: garagePrice(part, part === 'paint' ? 1 : (economy.garage[part] ?? 0) + 1),
  }));
}

export function toSave(economy) {
  return {
    cash: economy.cash,
    respect: economy.respect,
    mission: economy.mission,
    completed: [...economy.completed],
    garage: { ...economy.garage },
    weapons: { ...economy.weapons },
    ammo: economy.ammo,
    day: economy.day,
  };
}

export function persist(economy) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(economy)));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
