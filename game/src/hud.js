// The HUD for Port Solano: DOM text over the 3D canvas, plus a live
// 2D minimap. Cash, wanted stars, clock, district, objective, timer,
// speed, NOS, weapon and radio station are plain DOM nodes the main loop
// updates only when their text changes; the minimap is a small canvas
// painted every frame (roads, districts, marker, police, helicopter and
// the player). Panels — title, pause, missions, garage — are DOM divs
// the main loop shows and hides. Nothing here steps the simulation.
import { CITY, GARAGE, NOS, RADIO, WEAPONS } from './config.js';
import { districtNameAt } from './city.js';

const STAR_FULL = '★';
const STAR_EMPTY = '☆';

function clockText(clock) {
  // The clock is a fraction of the day starting at dawn; show it as a
  // 24-hour time so the HUD reads like a city clock.
  const minutes = Math.floor(((clock * 24) % 24) * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const cashEl = el('hud-cash');
  const healthEl = el('hud-health');
  const starsEl = el('hud-stars');
  const clockEl = el('hud-clock');
  const districtEl = el('hud-district');
  const objectiveEl = el('hud-objective');
  const timerEl = el('hud-timer');
  const speedEl = el('hud-speed');
  const nosEl = el('hud-nos');
  const weaponEl = el('hud-weapon');
  const radioEl = el('hud-radio');
  const bannerEl = el('hud-banner');
  const bannerText = el('hud-banner-text');
  const bannerSub = el('hud-banner-sub');
  const hintEl = el('hud-hint');
  const mapCanvas = el('hud-minimap');
  const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;
  const panels = {
    title: el('panel-title'),
    paused: el('panel-paused'),
    missions: el('panel-missions'),
    garage: el('panel-garage'),
  };
  const missionsList = el('missions-list');
  const garageList = el('garage-list');
  const garageCash = el('garage-cash');

  const last = { cash: -1, health: -1, stars: '', clock: '', district: '', objective: '', timer: '', speed: -1, nos: -1, weapon: '', radio: '' };

  function drawMinimap(state, marker) {
    if (!mapCtx) return;
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const sx = w / CITY.width;
    const sy = h / CITY.height;
    mapCtx.fillStyle = '#14101c';
    mapCtx.fillRect(0, 0, w, h);
    for (const d of state.city.districts) {
      mapCtx.fillStyle = d.tint;
      mapCtx.fillRect(d.x * sx, d.z * sy, d.w * sx, d.h * sy);
    }
    mapCtx.strokeStyle = 'rgba(216, 201, 122, 0.65)';
    mapCtx.lineWidth = 1;
    for (const rx of state.city.roads.vertical) {
      mapCtx.beginPath();
      mapCtx.moveTo(rx * sx, 0);
      mapCtx.lineTo(rx * sx, h);
      mapCtx.stroke();
    }
    for (const rz of state.city.roads.horizontal) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, rz * sy);
      mapCtx.lineTo(w, rz * sy);
      mapCtx.stroke();
    }
    if (marker) {
      mapCtx.fillStyle = '#f2c94c';
      mapCtx.beginPath();
      mapCtx.arc(marker.x * sx, marker.z * sy, 5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    mapCtx.fillStyle = '#e5534b';
    for (const cop of state.police) {
      mapCtx.fillRect(cop.x * sx - 2, cop.z * sy - 2, 4, 4);
    }
    if (state.heli.active) {
      mapCtx.fillStyle = '#fff2b0';
      mapCtx.beginPath();
      mapCtx.arc(state.heli.x * sx, state.heli.z * sy, 4, 0, Math.PI * 2);
      mapCtx.fill();
    }
    const p = state.player;
    mapCtx.fillStyle = '#f2c94c';
    mapCtx.beginPath();
    mapCtx.arc(p.x * sx, p.z * sy, 4, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.strokeStyle = '#f2c94c';
    mapCtx.beginPath();
    mapCtx.moveTo(p.x * sx, p.z * sy);
    mapCtx.lineTo(p.x * sx + Math.cos(p.angle) * 9, p.z * sy + Math.sin(p.angle) * 9);
    mapCtx.stroke();
  }

  function update(state, ui) {
    const missions = state.missions;
    const cash = missions.cash;
    if (cash !== last.cash) { last.cash = cash; cashEl.textContent = `$${cash}`; }
    const health = Math.ceil(state.player.health);
    if (health !== last.health) { last.health = health; healthEl.textContent = `Health ${health}`; }
    const stars = STAR_FULL.repeat(state.wanted) + STAR_EMPTY.repeat(5 - state.wanted);
    if (stars !== last.stars) {
      last.stars = stars;
      starsEl.textContent = stars;
      starsEl.style.color = state.wanted > 0 ? '#e5534b' : '#a89f92';
    }
    const clock = clockText(state.clock);
    if (clock !== last.clock) { last.clock = clock; clockEl.textContent = clock; }
    const district = districtNameAt(state.player.x, state.player.z);
    if (district !== last.district) { last.district = district; districtEl.textContent = district; }
    if (ui.objective !== last.objective) { last.objective = ui.objective; objectiveEl.textContent = ui.objective; }
    let timer = '';
    if (ui.step && ui.step.kind === 'timed' && ui.timedLeft != null) {
      timer = `DELIVERY — ${Math.ceil(ui.timedLeft)}s left`;
    } else if (ui.step && ui.step.kind === 'wait') {
      timer = `Holding turf… ${(ui.heldSeconds || 0).toFixed(1)}s / ${ui.step.seconds}s`;
    } else if (ui.step && ui.step.kind === 'stealth') {
      timer = state.wanted === 0 ? 'CLEAN — STAY QUIET' : 'SPOTTED — LOSE THE HEAT';
    } else if (state.heli.active) {
      timer = 'HELICOPTER OVERHEAD';
    }
    if (timer !== last.timer) { last.timer = timer; timerEl.textContent = timer; }
    const car = state.player.inCar;
    const speed = car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
    if (speed !== last.speed) { last.speed = speed; speedEl.textContent = car ? `${speed} km/h` : 'On foot'; }
    const nos = state.garage.nos ? Math.round(state.nos) : -1;
    if (nos !== last.nos) {
      last.nos = nos;
      nosEl.textContent = state.garage.nos ? `NOS ${nos}%` : 'NOS —';
      nosEl.style.color = state.nos > 20 ? '#6fce7e' : '#e5534b';
    }
    const weapon = WEAPONS[state.weapon];
    const ammoText = weapon.ammo < 0 ? '∞' : String(state.ammo[weapon.id]);
    const weaponText = `${weapon.name} [${ammoText}]`;
    if (weaponText !== last.weapon) { last.weapon = weaponText; weaponEl.textContent = weaponText; }
    const radioText = `♪ ${RADIO[state.radio].name}`;
    if (radioText !== last.radio) { last.radio = radioText; radioEl.textContent = radioText; }
    if (state.banner) {
      bannerEl.style.display = 'block';
      bannerText.textContent = state.banner.text;
      bannerSub.textContent = state.banner.sub || '';
    } else {
      bannerEl.style.display = 'none';
    }
    hintEl.style.display = state.tutorialTimer > 0 && !state.player.inCar ? 'block' : 'none';
    drawMinimap(state, ui.marker);
  }

  function showPanel(name, state) {
    for (const key of Object.keys(panels)) {
      if (panels[key]) panels[key].style.display = key === name ? 'block' : 'none';
    }
    if (name === 'missions' && missionsList) {
      const lines = [];
      const chapters = state.chapters || [];
      for (let i = 0; i < chapters.length; i += 1) {
        const done = state.completed.includes(chapters[i].id);
        const current = i === state.chapterIndex;
        lines.push(`<div>${done ? '✓' : current ? '►' : '·'} ${chapters[i].title} — $${chapters[i].reward}${done ? ' (done)' : ''}</div>`);
      }
      lines.push(`<div class="muted">Side jobs — 1 Taxi ($120) · 2 Courier ($150) · 3 Vigilante ($350) · 4 Repo ($500)</div>`);
      lines.push(`<div>Cash $${state.cash} · ${state.completed.length} of ${chapters.length} chapters done</div>`);
      missionsList.innerHTML = lines.join('');
    }
    if (name === 'garage' && garageList) {
      const g = state.garage;
      const rows = [
        { key: 'armor', label: `Armor +${60} max health`, cost: GARAGE.armorCost, owned: g.armor },
        { key: 'speed', label: `Engine tune +${6} m/s top speed`, cost: GARAGE.speedCost, owned: g.speed },
        { key: 'nos', label: `NOS kit — Shift to boost (${NOS.capacity}%)`, cost: GARAGE.nosCost, owned: g.nos, refill: true },
      ];
      garageList.innerHTML = rows.map((r) => (
        `<div>${r.owned && !r.refill ? '✓' : '·'} ${r.label} — $${r.cost}${r.owned && !r.refill ? ' (owned)' : ''}</div>`
      )).join('') + '<div class="muted">Press 1 Armor · 2 Engine · 3 NOS to buy</div>';
      garageCash.textContent = `Cash $${state.cash}`;
    }
  }

  function hidePanels() {
    for (const key of Object.keys(panels)) {
      if (panels[key]) panels[key].style.display = 'none';
    }
  }

  return { update, showPanel, hidePanels };
}
