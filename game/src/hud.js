// Solano Heat — the DOM HUD and the live minimap. The 3D canvas shows the
// world; this shows cash, wanted stars, the clock, the district, the current
// objective, speed, NOS, weapon, radio and the garage / mission menus.
import { WEAPONS } from './config.js';

function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

export function createHud(doc, city) {
  const el = (id) => doc.getElementById(id);
  const cashEl = el('hud-cash');
  const wantedEl = el('hud-wanted');
  const clockEl = el('hud-clock');
  const districtEl = el('hud-district');
  const objectiveEl = el('hud-objective');
  const speedEl = el('hud-speed');
  const nosEl = el('hud-nos');
  const weaponEl = el('hud-weapon');
  const radioEl = el('hud-radio');
  const feedEl = el('hud-feed');
  const bannerEl = el('hud-banner');
  const mapCanvas = el('hud-map');
  const mapCtx = mapCanvas.getContext('2d');
  const garageEl = el('menu-garage');
  const missionsEl = el('menu-missions');
  const titleEl = el('screen-title');
  const pauseEl = el('screen-pause');
  const overEl = el('screen-over');
  const statusEl = el('status');
  let bannerTimer = 0;

  function clockText(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function drawMap(state) {
    const W = mapCanvas.width;
    const H = mapCanvas.height;
    const sx = W / 960;
    const sy = H / 640;
    mapCtx.fillStyle = '#10141c';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.strokeStyle = '#3a4150';
    mapCtx.lineWidth = 2;
    for (const x of city.verticals) {
      mapCtx.beginPath();
      mapCtx.moveTo(x * sx, 0);
      mapCtx.lineTo(x * sx, H);
      mapCtx.stroke();
    }
    for (const z of city.horizontals) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, z * sy);
      mapCtx.lineTo(W, z * sy);
      mapCtx.stroke();
    }
    const dot = (x, z, color, r) => {
      mapCtx.fillStyle = color;
      mapCtx.beginPath();
      mapCtx.arc(x * sx, z * sy, r, 0, Math.PI * 2);
      mapCtx.fill();
    };
    if (state.marker) dot(state.marker.x, state.marker.z, '#ffcf3d', 5);
    for (const c of state.police) dot(c.x, c.z, '#3d6bff', 3);
    if (state.heli.active) dot(state.heli.x, state.heli.z, '#ff5a3d', 4);
    dot(state.player.x, state.player.z, '#e8b13c', 4);
  }

  function update(state, wanted, objectiveText, extra = {}) {
    cashEl.textContent = `$${state.cash}`;
    wantedEl.textContent = stars(wanted);
    wantedEl.style.color = wanted >= 4 ? '#ff5a3d' : wanted > 0 ? '#ffb13d' : '#f2f4f7';
    clockEl.textContent = clockText(state.clockMinutes);
    districtEl.textContent = state.district;
    objectiveEl.textContent = objectiveText;
    const kmh = Math.round(Math.abs(state.player.speed || 0) * 3.6);
    speedEl.textContent = state.car ? `${kmh} km/h` : 'On foot';
    const nos = state.upgrades.nos ? Math.round(state.upgrades.nosAmount) : 0;
    nosEl.textContent = state.upgrades.nos ? `NOS ${nos}%` : 'NOS —';
    const w = state.weapons.current;
    const ammo = w === 'fists' ? '∞' : `${state.weapons.ammo[w] ?? 0}`;
    weaponEl.textContent = `${WEAPONS[w].name} · ${ammo}`;
    radioEl.textContent = extra.radio || '';
    feedEl.innerHTML = state.feed.map((f) => `<div>${f}</div>`).join('');
    drawMap(state);
    if (bannerTimer > 0) {
      bannerTimer -= 1 / 60;
      if (bannerTimer <= 0) bannerEl.textContent = '';
    }
  }

  function banner(text, seconds = 3) {
    bannerEl.textContent = text;
    bannerTimer = seconds;
    statusEl.textContent = text;
  }

  function showGarage(state, buy) {
    const g = state.upgrades;
    garageEl.innerHTML = `
      <h2>Eastside Garage</h2>
      <p>Cash $${state.cash} — press G to leave</p>
      <p>[1] Body Armor $800 ${g.armor ? '— fitted' : ''}</p>
      <p>[2] Engine Tune $1200 ${g.engine ? '— fitted' : ''}</p>
      <p>[3] NOS Kit $600 ${g.nos ? `— ${Math.round(g.nosAmount)}%` : ''} · [4] NOS refill $100</p>
      <p>[5] Pistol $300 · [6] SMG $900 · [7] Shotgun $1200</p>
      <p>Ammo: pistol $60 · SMG $120 · shotgun $180 (buy with 5/6/7 when owned)</p>`;
    garageEl.style.display = 'block';
    garageEl._buy = buy;
  }

  function showMissions(missions) {
    const list = missions.chapters.map((c, i) => {
      const done = missions.state.completed.includes(c.id);
      const next = i === missions.state.chapterIndex && !missions.state.active;
      return `<p>${done ? '✓' : next ? '▶' : '·'} ${c.title} — $${c.pay}</p>`;
    }).join('');
    const jobs = missions.sideJobs.map((j) => `<p>[${j.id === 'taxi' ? 1 : j.id === 'courier-job' ? 2 : j.id === 'vigilante' ? 3 : 4}] ${j.title} — $${j.pay}</p>`).join('');
    missionsEl.innerHTML = `<h2>Jobs</h2>${list}<h3>Side jobs</h3>${jobs}<p>Press M to close · 1–4 take a side job</p>`;
    missionsEl.style.display = 'block';
  }

  function hideMenus() {
    garageEl.style.display = 'none';
    missionsEl.style.display = 'none';
  }

  function showScreen(name) {
    titleEl.style.display = name === 'title' ? 'block' : 'none';
    pauseEl.style.display = name === 'pause' ? 'block' : 'none';
    overEl.style.display = name === 'over' ? 'block' : 'none';
  }

  function setOverText(text) {
    overEl.querySelector('p').textContent = text;
  }

  return { update, banner, showGarage, showMissions, hideMenus, showScreen, setOverText };
}
