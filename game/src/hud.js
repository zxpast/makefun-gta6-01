// The 2D overlay: cash, wanted stars, speed, clock, the current objective, the
// minimap, and the radio. Drawn on a canvas laid over the 3D view, with no DOM.
import { WORLD } from './config.js';

const MINIMAP = 150;

export function createHud(canvas, sim, missions, radio) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function star(x, y, r, filled, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(angle) * rr;
      const py = y + Math.sin(angle) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? color : 'rgba(255,255,255,0.25)';
    ctx.fill();
  }

  function drawMinimap() {
    const w = canvas.width;
    const size = MINIMAP;
    const ox = w - size - 16;
    const oy = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ox, oy, size, size);
    const sx = (x) => ox + ((x + WORLD.width / 2) / WORLD.width) * size;
    const sy = (z) => oy + ((z + WORLD.depth / 2) / WORLD.depth) * size;
    ctx.fillStyle = '#3a3f46';
    for (const x of sim.city.roadsX) ctx.fillRect(sx(x) - 1, oy, 2, size);
    for (const z of sim.city.roadsZ) ctx.fillRect(ox, sy(z) - 1, size, 2);
    const target = missions.target();
    if (target !== null) {
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(sx(target.x), sy(target.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = sim.state.player;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.z), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(sx(p.x), sy(p.z));
    ctx.lineTo(sx(p.x) + Math.sin(p.angle) * 10, sy(p.z) + Math.cos(p.angle) * 10);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText('MAP', ox + 6, oy + size - 6);
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const s = sim.state;
    const p = s.player;

    // Cash and clock, top left.
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`$${Math.floor(s.cash)}`, 18, 36);
    ctx.font = '18px monospace';
    const { hour, minute } = sim.hourMinute();
    const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    ctx.fillText(clock, 18, 64);
    ctx.fillText(`Chapter ${missions.completed.length + 1}/8`, 18, 90);
    ctx.fillText(sim.city.districtAt(p.x, p.z), 18, 116);

    // Wanted stars, top centre.
    for (let i = 0; i < 5; i += 1) {
      star(w / 2 - 66 + i * 30, 32, 12, i < s.wanted, '#f59e0b');
    }

    // Speed and radio, bottom right.
    if (s.car !== null) {
      ctx.font = 'bold 30px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Math.round(Math.abs(s.car.speed) * 3.6)} km/h`, w - 190, h - 58);
    }
    ctx.font = '16px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(radio.label(), w - 190, h - 30);
    if (s.car !== null && s.car.nos > 0) {
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(`NOS ${Math.round(s.car.nos * 100)}%`, w - 190, h - 86);
    }

    // Objective and message, bottom left.
    ctx.font = '16px monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`> ${missions.objective()}`, 18, h - 58);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(missions.message, 18, h - 30);

    // Context prompts.
    if (p.onFoot && sim.city.parked.length > 0) {
      const nearest = sim.city.parked[0];
      if (Math.hypot(nearest.x - p.x, nearest.z - p.z) < 6) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('Press E to steal the car', w / 2 - 110, h / 2 + 60);
      }
    }
    if (s.car !== null && sim.nearPlace('garage', 12)) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('GARAGE: 1 Armor  2 Engine  3 NOS  |  Q weapons', w / 2 - 210, h / 2 + 60);
    }
    if (missions.failed) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('MISSION FAILED — press M to retry', w / 2 - 200, h / 2 - 40);
    }
    if (missions.completed.length >= 8) {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('ALL CHAPTERS COMPLETE — Solano is yours.', w / 2 - 240, h / 2 - 40);
    }

    drawMinimap();
  }

  return { draw };
}
