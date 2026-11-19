// Solano Heat — HUD and minimap. DOM readouts for wanted level, cash, respect,
// district, objective and speed, plus a live canvas minimap that labels all
// sixteen districts and tracks the player, police, missions and shops.
import { DISTRICTS, CITY_HALF, starLabel } from './sim.js';

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.map = this.el('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this.menuInner = this.el('menu') ? this.el('menu').firstElementChild : null;
    this.lastBanner = '';
  }
  setText(id, value) {
    const e = this.el(id);
    if (e && e.textContent !== String(value)) e.textContent = value;
  }
  update(view) {
    this.setText('stars', starLabel(view.wanted));
    this.setText('cash', '$' + Math.round(view.cash).toLocaleString('en-US'));
    this.setText('respect', '◆ ' + view.respect + ' ' + view.rank);
    this.setText('district', view.district || 'Solano Bay');
    this.setText('objective', view.objective);
    this.setText('speed', Math.round(view.speedKmh) + ' km/h');
    this.setText('radio', view.radio);
    this.setText('prompt', view.prompt || '');
    this.setText('dayline', view.dayline);
    const nos = this.el('nosfill');
    if (nos) nos.style.width = Math.round(view.nos) + '%';
    const dmg = this.el('dmgfill');
    if (dmg) dmg.style.width = Math.round(view.damage) + '%';
    if (view.banner && view.banner !== this.lastBanner) {
      this.lastBanner = view.banner;
      this.setText('banner', view.banner);
      const b = this.el('banner');
      if (b) { b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
    }
    this.drawMinimap(view);
  }
  drawMinimap(view) {
    if (!this.mapCtx) return;
    // Redraw at most every 150ms: the minimap is the priciest HUD piece and
    // it does not need to refresh every simulation step.
    const now = performance.now();
    if (now - (this.lastMap || 0) < 150) return;
    this.lastMap = now;
    const g = this.mapCtx, S = 168, k = S / (CITY_HALF * 2);
    const px = (x) => (x + CITY_HALF) * k;
    const pz = (z) => (z + CITY_HALF) * k;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(8,12,18,0.85)';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    for (let v = -CITY_HALF; v <= CITY_HALF; v += 100) {
      g.beginPath(); g.moveTo(px(v), 0); g.lineTo(px(v), S); g.stroke();
      g.beginPath(); g.moveTo(0, pz(v)); g.lineTo(S, pz(v)); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '7px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const d of DISTRICTS) {
      const cx = px(d.gx * 300 - CITY_HALF + 150), cz = pz(d.gz * 300 - CITY_HALF + 150);
      const short = d.name.replace(/^The /, '').split(' ')[0].toUpperCase();
      g.fillText(short, cx, cz);
    }
    const dot = (x, z, color, r) => {
      g.fillStyle = color;
      g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2); g.fill();
    };
    if (view.target) dot(view.target.x, view.target.z, '#f5c542', 5);
    for (const s of view.shops || []) dot(s.x, s.z, '#4fc3f7', 3);
    for (const h of view.houses || []) dot(h.x, h.z, '#7ee787', 3);
    for (const p of view.police || []) dot(p.x, p.z, '#ff4444', 3);
    // Player arrow.
    g.save();
    g.translate(px(view.px), pz(view.pz));
    g.rotate(view.heading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }
  showMenu(html) {
    const m = this.el('menu');
    if (!m) return;
    if (this.menuInner) this.menuInner.innerHTML = html;
    m.classList.add('open');
  }
  hideMenu() {
    const m = this.el('menu');
    if (m) { m.classList.remove('open'); if (this.menuInner) this.menuInner.innerHTML = ''; }
  }
  showToast(text) {
    const t = this.el('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }
}
