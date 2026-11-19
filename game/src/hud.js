// Solano Heat — the HUD: cash, health, wanted stars, clock and district,
// weapon and radio, the objective line, and a live minimap. All DOM, all
// plain: the sim never sees this file, and this file never rules the game.

import { PALETTE, RADIO, WEAPONS, WORLD } from './config.js';

const MAP_W = 190;
const MAP_H = 150;

function el(tag, parent, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function stars(n) {
  let out = '';
  for (let i = 0; i < 5; i += 1) out += i < n ? '★' : '☆';
  return out;
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHud(sim, missions) {
  const root = document.getElementById('hud');
  const top = el('div', root);
  top.id = 'hud-top';
  const cash = el('div', top, '$0');
  cash.id = 'hud-cash';
  const health = el('div', top);
  health.id = 'hud-health';
  const healthBar = el('div', health);
  healthBar.id = 'hud-health-bar';
  const wanted = el('div', top, '☆☆☆☆☆');
  wanted.id = 'hud-wanted';
  const clock = el('div', top, '');
  clock.id = 'hud-clock';

  const right = el('div', root);
  right.id = 'hud-right';
  const weapon = el('div', right, 'Fists');
  weapon.id = 'hud-weapon';
  const radio = el('div', right, 'SOL FM');
  radio.id = 'hud-radio';

  const objective = el('div', root, '');
  objective.id = 'hud-objective';
  const timer = el('div', root, '');
  timer.id = 'hud-timer';
  const speed = el('div', root, '');
  speed.id = 'hud-speed';
  const banner = el('div', root, '');
  banner.id = 'hud-banner';
  const minimap = document.createElement('canvas');
  minimap.id = 'hud-map';
  minimap.width = MAP_W;
  minimap.height = MAP_H;
  root.appendChild(minimap);
  const mapCtx = minimap.getContext('2d');

  const panel = el('div', root, '');
  panel.id = 'hud-panel';
  panel.style.display = 'none';

  let bannerTimer = 0;
  let lastMessage = '';

  function drawMap(waypoint) {
    const s = sim.state;
    const sx = MAP_W / WORLD.width;
    const sz = MAP_H / WORLD.height;
    mapCtx.fillStyle = '#10141c';
    mapCtx.fillRect(0, 0, MAP_W, MAP_H);
    mapCtx.strokeStyle = '#3a3f4a';
    mapCtx.lineWidth = 2;
    for (const ax of s.city.avenues) {
      mapCtx.beginPath();
      mapCtx.moveTo(ax * sx, 0);
      mapCtx.lineTo(ax * sx, MAP_H);
      mapCtx.stroke();
    }
    for (const sz2 of s.city.streets) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, sz2 * sz);
      mapCtx.lineTo(MAP_W, sz2 * sz);
      mapCtx.stroke();
    }
    mapCtx.fillStyle = '#2a2f3a';
    for (const b of s.city.buildings) {
      mapCtx.fillRect(b.x0 * sx, b.z0 * sz, (b.x1 - b.x0) * sx, (b.z1 - b.z0) * sz);
    }
    if (waypoint) {
      mapCtx.fillStyle = PALETTE.marker;
      mapCtx.beginPath();
      mapCtx.arc(waypoint.x * sx, waypoint.z * sz, 5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    for (const cop of s.police) {
      mapCtx.fillStyle = '#2f6fd0';
      mapCtx.beginPath();
      mapCtx.arc(cop.x * sx, cop.z * sz, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    if (s.heli.active) {
      mapCtx.fillStyle = '#e8e8e8';
      mapCtx.beginPath();
      mapCtx.arc(s.heli.x * sx, s.heli.z * sz, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    const p = s.player;
    mapCtx.save();
    mapCtx.translate(p.x * sx, p.z * sz);
    mapCtx.rotate(Math.atan2(Math.sin(p.angle), Math.cos(p.angle)) + Math.PI / 2);
    mapCtx.fillStyle = PALETTE.player;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4, 5);
    mapCtx.lineTo(-4, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    update(dt) {
      const s = sim.state;
      const p = s.player;
      cash.textContent = `$${Math.floor(s.cash)}`;
      const healthPct = Math.max(0, Math.round((p.health / p.maxHealth) * 100));
      healthBar.style.width = `${healthPct}%`;
      healthBar.textContent = `${healthPct}`;
      wanted.textContent = stars(s.wanted);
      wanted.style.color = s.wanted > 0 ? PALETTE.wanted : PALETTE.muted;
      clock.textContent = `${clockText(s.clockMinutes)} · ${sim.district()}`;
      const w = WEAPONS[p.weapon];
      const ammo = p.ammo[p.weapon] === Infinity ? '∞' : String(p.ammo[p.weapon]);
      weapon.textContent = `${w.name} · ${ammo}`;
      radio.textContent = `♪ ${RADIO[s.radio].name}`;
      objective.textContent = missions.objective();
      const left = missions.timeLeft();
      timer.textContent = left === null ? '' : `${Math.ceil(left)}s`;
      timer.style.color = left !== null && left < 20 ? PALETTE.wanted : PALETTE.text;
      if (p.onFoot) {
        speed.textContent = p.speed > 0.5 ? 'On foot' : '';
      } else {
        const nos = s.garage.nos ? ` · NOS ${s.garage.nosLeft}` : '';
        speed.textContent = `${Math.round(p.speed * 3.6)} km/h${nos}`;
      }
      const msg = missions.message;
      if (msg !== lastMessage) {
        lastMessage = msg;
        if (msg) {
          banner.textContent = msg;
          banner.style.display = 'block';
          bannerTimer = 4;
        }
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) banner.style.display = 'none';
      }
      drawMap(missions.waypoint());
    },
    /** Show a full-screen panel (title, paused, over, missions, garage). */
    showPanel(html) {
      if (!html) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
      }
      panel.innerHTML = html;
      // flex, not block: the panel's CSS centres its content with
      // flex-direction column, and display:block would switch that off.
      panel.style.display = 'flex';
    },
    announce(text) {
      banner.textContent = text;
      banner.style.display = 'block';
      bannerTimer = 4;
      lastMessage = text;
    },
  };
}
