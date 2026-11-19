// Solano Heat — the respect economy. Respect is the persistent meta
// currency: jobs and stunts earn it, it never resets, and it buys permanent
// garage upgrades and weapons. Shops and safehouses are places in the city,
// not menus.
import { SHOPS, SAFEHOUSES, WEAPONS, AMMO_PRICE, CLINIC_HEAL_PRICE, buyUpgrade, buyWeapon, upgradeCost, UPGRADE_NAMES } from './sim.js';

const SENSE_RANGE = 16;

export class Economy {
  constructor(state) {
    this.state = state;
    this.nearShop = null;
    this.nearHouse = null;
    this.shopOpen = false;
    this.message = '';
  }
  // The shop only ever sells one thing at a time: find the closest place
  // within reach, shops first, then safehouses.
  sense(px, pz) {
    this.nearShop = SHOPS.find(s => Math.hypot(px - s.x, pz - s.z) < SENSE_RANGE) || null;
    this.nearHouse = this.nearShop
      ? null
      : SAFEHOUSES.find(h => Math.hypot(px - h.x, pz - h.z) < SENSE_RANGE) || null;
    return { shop: this.nearShop, house: this.nearHouse };
  }
  shopLines() {
    const s = this.nearShop;
    if (!s) return [];
    const st = this.state;
    if (s.kind === 'weapons') {
      const lines = WEAPONS.map(w => ({
        label: `${w.name} — $${w.price}${st.weapons[w.id] ? ' (owned)' : ''}`,
        action: () => {
          const r = buyWeapon(st, w.id);
          this.message = r.ok ? `Bought the ${w.name}.` : r.reason === 'broke' ? 'Not enough cash.' : 'Already owned.';
        },
      }));
      lines.push({
        label: `Ammo pack — $${AMMO_PRICE}`,
        action: () => {
          if (st.cash < AMMO_PRICE) {
            this.message = 'Not enough cash.';
            return;
          }
          st.cash -= AMMO_PRICE;
          st.ammo[st.activeWeapon] = (st.ammo[st.activeWeapon] || 0) + 30;
          this.message = '+30 ammo.';
        },
      });
      return lines;
    }
    if (s.kind === 'garage') {
      return ['engine', 'armor', 'nos', 'tires'].map(kind => {
        const level = st.upgrades[kind] || 0;
        const cost = level >= 3 ? null : upgradeCost(kind, level + 1);
        return {
          label: `${UPGRADE_NAMES[kind]} Lv${level} → Lv${level + 1}${cost ? ` — $${cost}` : ' (MAX)'}`,
          action: () => {
            const r = buyUpgrade(st, kind);
            this.message = r.ok ? `${UPGRADE_NAMES[kind]} upgraded to Lv${r.level}.` : r.reason === 'broke' ? 'Not enough cash.' : 'Already maxed.';
          },
        };
      });
    }
    return [{
      label: `Full repair + heal — $${CLINIC_HEAL_PRICE}`,
      action: () => {
        if (st.cash < CLINIC_HEAL_PRICE) {
          this.message = 'Not enough cash.';
          return;
        }
        st.cash -= CLINIC_HEAL_PRICE;
        st.health = 100;
        this.message = 'Patched up. Health restored.';
      },
    }];
  }
  useSafehouse(car) {
    this.state.health = 100;
    if (car) car.repair();
    this.state.respect += 5;
    this.message = 'Safehouse: saved, healed, +5 respect.';
    return true;
  }
  respectBar() {
    // Respect ranks: 0 Street, 100 Known, 250 Feared, 500 Legend.
    const r = this.state.respect;
    if (r >= 500) return 'LEGEND';
    if (r >= 250) return 'FEARED';
    if (r >= 100) return 'KNOWN';
    return 'STREET';
  }
}
