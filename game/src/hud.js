// The HUD for Solano Heat: wanted stars, cash, respect, the day countdown,
// the mission objective, and the minimap that names all sixteen districts.
// DOM is cheap and readable; the minimap is a 2D canvas redrawn each frame
// from the same city data the 3D world uses, so the two never disagree.

import { DISTRICTS, HALF, districtCenter } from './city.js';
import { MAX_STARS } from './sim.js';

const $ = (id) => document.getElementById(id);

export function makeHud() {
  return {
    last: {},
    map: $('minimap'),
    mapCtx: null,
  };
}

function setText(hud, id, value) {
  if (hud.last[id] === value) return;
  hud.last[id] = value;
  const el = $(id);
  if (el) el.textContent = value;
}

export function drawMinimap(hud, game) {
  const canvas = hud.map;
  if (!canvas) return;
  if (!hud.mapCtx) hud.mapCtx = canvas.getContext('2d');
  const ctx = hud.mapCtx;
  const w = canvas.width;
  const h = canvas.height;
  const scale = w / (HALF * 2 + 40);
  const px = (v) => (v + HALF + 20) * scale;
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, w, h);
  // District washes and names.
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'center';
  DISTRICTS.forEach((d, i) => {
    const c = districtCenter(i);
    ctx.fillStyle = `#${d.tint.toString(16).padStart(6, '0')}`;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(px(c.x - 74), px(c.z - 74), 148 * scale, 148 * scale);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#c8ccd4';
    ctx.fillText(d.name.toUpperCase(), px(c.x), px(c.z) + 2);
  });
  // Streets.
  ctx.strokeStyle = '#4a5058';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    const p = px(-HALF + i * 74 + 7);
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
  }
  const dot = (x, z, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px(x), px(z), r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Traffic, faint.
  for (const car of game.traffic || []) dot(car.x, car.z, '#8a8f96', 1.2);
  // Police, red.
  for (const car of game.police.cars || []) dot(car.x, car.z, '#ff3b30', 2.4);
  // Mission target, gold ring.
  const target = game.missionTarget;
  if (target) {
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(target.x), px(target.z), 6, 0, Math.PI * 2);
    ctx.stroke();
    dot(target.x, target.z, '#ffd24d', 2.5);
  }
  // Shops and safehouses.
  for (const s of game.city.shops || []) dot(s.x, s.z, '#4dd0ff', 2);
  for (const s of game.city.safehouses || []) dot(s.x, s.z, '#7dff6a', 2);
  // Helicopter, white.
  if (game.police.heli) dot(game.police.heli.x, game.police.heli.z, '#ffffff', 3);
  // Player arrow: heading 0 is +z, which is down on the map, so the arrow
  // (drawn pointing up) rotates by PI minus the heading.
  const p = game.onFoot ? game.walker : game.player;
  ctx.save();
  ctx.translate(px(p.x), px(p.z));
  ctx.rotate(Math.PI - p.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.6, 4);
  ctx.lineTo(-3.6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function updateHud(hud, game) {
  const stars = '★'.repeat(game.police.stars) + '☆'.repeat(MAX_STARS - game.police.stars);
  setText(hud, 'stars', stars);
  $('stars').style.color = game.police.stars >= 4 ? '#ff3b30' : '#ffd24d';
  setText(hud, 'cash', `$${Math.floor(game.economy.cash).toLocaleString()}`);
  setText(hud, 'respect', `${Math.floor(game.economy.respect)} ${game.rank}`);
  setText(hud, 'day', `DAY ${game.day} / 7 — ${7 - game.day} LEFT`);
  const speed = Math.abs(game.onFoot ? game.walker.speed : game.player.speed) * 2.4;
  setText(hud, 'speed', `${Math.round(speed)} km/h`);
  setText(hud, 'nos', game.player.nos > 0 ? `NOS ${Math.ceil(game.player.nos)}s` : '');
  const m = game.mission;
  if (m) {
    setText(hud, 'objective-text', `${m.name} — ${m.brief}`);
    const d = Math.hypot(m.target.x - game.player.x, m.target.z - game.player.z);
    setText(hud, 'distance', `${Math.round(d)}m · ${m.target.district}`);
    setText(hud, 'timer', `TIME ${Math.floor(game.missionTimer)}s / ${m.par}s`);
  } else {
    setText(hud, 'objective-text', 'Press M — pick a job. Rook is free.');
    setText(hud, 'distance', '');
    setText(hud, 'timer', '');
  }
  setText(hud, 'district', game.district);
  setText(hud, 'radio', game.radioName);
  drawMinimap(hud, game);
  // Floating texts: cash and respect popups near the centre.
  const host = $('floats');
  if (host) {
    for (const t of game.effects.texts) {
      if (t.rendered) continue;
      t.rendered = true;
      const div = document.createElement('div');
      div.className = `float-text ${t.kind}`;
      div.textContent = t.text;
      host.appendChild(div);
      setTimeout(() => div.remove(), 1400);
    }
  }
}

export function toast(hud, text, ms = 2600) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

export function renderMenu(hud, game) {
  const menu = $('menu');
  if (!menu) return;
  const list = game.menuMissions;
  menu.innerHTML = list.map((m, i) => {
    const done = game.completed.includes(m.id) ? '✓ ' : '';
    const sel = i === game.menuIndex ? ' class="sel"' : '';
    return `<div${sel}>${done}DAY ${m.day} — ${m.name} · $${m.cash} · ${m.respect} RES</div>`;
  }).join('');
  menu.classList.toggle('show', game.menuOpen);
}
