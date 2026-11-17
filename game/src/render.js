// Solano Heat — drawing only: the world in, pixels out. The camera follows the
// player; the HUD (cash, health, wanted stars, clock, weapon, minimap) and the
// screens (title, pause, wasted) are drawn on top. No rules live here.
import {
  AVENUES, BEACH_X, BUILDING_COLORS, CAR, CLOCK_START_MINUTES, PLAYER, SEA_X,
  STREETS, VIEW_H, VIEW_W, WORLD_H, WORLD_W,
} from './config.js';
import { districtAt } from './config.js';
import { WEAPONS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_HELP = 'help';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = { x: 16, y: VIEW_H - 156, w: 220, h: 140 };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / VIEW_W, h / VIEW_H);
    view.x = (w - VIEW_W * view.scale) / 2;
    view.y = (h - VIEW_H * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function daylight(clockMinutes) {
    const hour = clockMinutes / 60;
    if (hour >= 7 && hour < 17) return 1;
    if (hour >= 17 && hour < 19) return 0.85;
    if (hour >= 19 && hour < 21) return 0.68;
    if (hour >= 21 || hour < 5) return 0.55;
    if (hour >= 5 && hour < 7) return 0.75;
    return 1;
  }

  function drawGround(game) {
    const cam = game.camera;
    const x0 = cam.x - 40;
    const y0 = cam.y - 40;
    const x1 = cam.x + VIEW_W + 40;
    const y1 = cam.y + VIEW_H + 40;
    // Grass / ground base.
    ctx.fillStyle = '#5d7a4a';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Sea (west) and sand.
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect(x0, y0, SEA_X - x0 > 0 ? SEA_X - x0 : 0, y1 - y0);
    ctx.fillStyle = '#e8d5a3';
    ctx.fillRect(Math.max(x0, SEA_X), y0, Math.min(x1, BEACH_X) - Math.max(x0, SEA_X), y1 - y0);
    // Sidewalk blocks: light pavement squares between roads.
    ctx.fillStyle = '#9aa0a8';
    for (let ax = 0; ax < AVENUES.length; ax += 1) {
      for (let st = 0; st < STREETS.length; st += 1) {
        const bx = AVENUES[ax] + 48;
        const by = STREETS[st] + 48;
        const nx = ax + 1 < AVENUES.length ? AVENUES[ax + 1] - 48 : WORLD_W;
        const ny = st + 1 < STREETS.length ? STREETS[st + 1] - 48 : WORLD_H;
        if (nx > x0 && bx < x1 && ny > y0 && by < y1) ctx.fillRect(bx, by, nx - bx, ny - by);
      }
    }
    // Roads: dark asphalt with centre dashes.
    ctx.fillStyle = '#33363d';
    for (const a of AVENUES) ctx.fillRect(a - 48, Math.max(y0, 0), 96, Math.min(y1, WORLD_H) - Math.max(y0, 0));
    for (const s of STREETS) ctx.fillRect(Math.max(x0, BEACH_X), s - 48, Math.min(x1, WORLD_W) - Math.max(x0, BEACH_X), 96);
    ctx.strokeStyle = '#d8c25a';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    for (const a of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(a, Math.max(y0, 0));
      ctx.lineTo(a, Math.min(y1, WORLD_H));
      ctx.stroke();
    }
    for (const s of STREETS) {
      ctx.beginPath();
      ctx.moveTo(Math.max(x0, BEACH_X), s);
      ctx.lineTo(Math.min(x1, WORLD_W), s);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Parks.
    for (const park of game.city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = '#4a7a3f';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = '#2f5d2a';
      for (let i = 0; i < park.trees; i += 1) {
        const tx = park.x + 20 + ((i * 67) % Math.max(20, park.w - 40));
        const ty = park.y + 20 + ((i * 43) % Math.max(20, park.h - 40));
        ctx.beginPath();
        ctx.arc(tx, ty, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Palm trees on the boardwalk.
    ctx.fillStyle = '#2f6b2f';
    for (const palm of game.city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      ctx.beginPath();
      ctx.arc(palm.x, palm.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBuildings(game) {
    const cam = game.camera;
    const x0 = cam.x - 60;
    const y0 = cam.y - 60;
    const x1 = cam.x + VIEW_W + 60;
    const y1 = cam.y + VIEW_H + 60;
    for (const b of game.city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      // Height shading: a darker offset block reads as a shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Rooftop detail + windows.
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 10);
      ctx.fillStyle = 'rgba(20,30,50,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 30));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          ctx.fillRect(b.x + 8 + cx * 26, b.y + 22 + cy * 30, 14, 16);
        }
      }
      if (b.sign) {
        ctx.fillStyle = '#ff2e88';
        ctx.font = `bold ${Math.min(20, b.w / 4)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2);
      }
    }
    // Landmarks: named, coloured, labelled.
    const lmColors = {
      safehouse: '#27ae60', marina: '#2980b9', docks: '#7f8c8d', bank: '#b7950b',
      warehouse: '#8e44ad', pier: '#16a085', hospital: '#e74c3c', police: '#1a5276',
    };
    for (const lm of game.city.landmarks) {
      if (lm.x > x1 || lm.x + lm.w < x0 || lm.y > y1 || lm.y + lm.h < y0) continue;
      ctx.fillStyle = lmColors[lm.kind] || '#888888';
      ctx.fillRect(lm.x, lm.y, lm.w, lm.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(lm.x, lm.y, lm.w, lm.h);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(lm.name, lm.x + lm.w / 2, lm.y + lm.h / 2 + 5);
    }
  }

  function drawCarShape(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    ctx.fill();
    ctx.fillStyle = car.isPolice ? '#f4f6f7' : car.color;
    roundRect(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    ctx.fill();
    if (car.isPolice) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(-6, -CAR.width / 2, 12, CAR.width);
      // Flashing light bar.
      const phase = Math.floor(performance.now() / 220) % 2;
      ctx.fillStyle = phase === 0 ? '#ff0000' : '#0066ff';
      ctx.fillRect(-4, -CAR.width / 2 - 2, 8, 6);
      ctx.fillStyle = phase === 0 ? '#0066ff' : '#ff0000';
      ctx.fillRect(-4, CAR.width / 2 - 4, 8, 6);
    }
    // Windshield + roof.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.fillRect(4, -CAR.width / 2 + 3, 12, CAR.width - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-10, -CAR.width / 2 + 4, 10, CAR.width - 8);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 2, 3, 5);
    ctx.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 7, 3, 5);
    if (isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      roundRect(ctx, -CAR.length / 2 - 3, -CAR.width / 2 - 3, CAR.length + 6, CAR.width + 6, 10);
      ctx.stroke();
    }
    ctx.restore();
    if (car.smoke > 0.3) {
      ctx.fillStyle = 'rgba(120,120,120,0.7)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.angle) * 10, car.y - Math.sin(car.angle) * 10, 6 + car.smoke * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, bodyColor, skinColor, label, isPlayer) {
    ctx.save();
    ctx.translate(x, y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    // Head + facing gun / direction.
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 4, Math.sin(angle) * 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
    ctx.lineTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
    ctx.stroke();
    if (isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (label) {
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(label, x, y - 18);
    }
  }

  function drawWorld(game) {
    drawGround(game);
    drawBuildings(game);
    // Pickups.
    for (const p of game.pickups) {
      if (p.taken) continue;
      const colors = { health: '#e74c3c', armor: '#3498db', ammo: '#f39c12', cash: '#2ecc71' };
      const glyph = { health: '+', armor: 'A', ammo: '»', cash: '$' };
      ctx.fillStyle = colors[p.kind] || '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(glyph[p.kind] || '?', p.x, p.y + 5);
    }
    // Mission target ring.
    const target = game.missionTarget();
    if (target) {
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.12;
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(target.x, target.y, (target.radius || 120) * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f1c40f';
      ctx.font = `bold 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('▼', target.x, target.y - (target.radius || 120) - 8);
    }
    // Traffic + police cars.
    for (const car of game.traffic) if (!car.dead) drawCarShape(car, false);
    for (const car of game.policeCars) if (!car.dead) drawCarShape(car, false);
    // Pedestrians.
    for (const ped of game.peds) {
      if (ped.dead) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.skin, null, false);
    }
    // Rivals (Salt Kings) with a purple marker.
    for (const r of game.rivals) {
      if (r.dead) continue;
      drawPerson(r.x, r.y, r.angle, r.color, '#e0ac69', 'SALT KING', false);
    }
    for (const cop of game.policeFoot) {
      if (cop.dead) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#1a5276', cop.skin, 'POLICE', false);
    }
    // Player.
    const player = game.player;
    if (!player.inCar && !player.dead) {
      drawPerson(player.x, player.y, player.angle, '#e67e22', '#f1c27d', 'LUCIA', true);
    } else if (player.inCar && !player.inCar.dead) {
      drawCarShape(player.inCar, true);
    }
    // Bullets.
    ctx.fillStyle = '#ffe14d';
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff5a4d';
    for (const b of game.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap(game) {
    const { x, y, w, h } = MINIMAP;
    const sx = w / WORLD_W;
    const sy = h / WORLD_H;
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 8);
    ctx.clip();
    ctx.fillStyle = '#3d5a3a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#555a63';
    ctx.lineWidth = 2;
    for (const a of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(x + a * sx, y);
      ctx.lineTo(x + a * sx, y + h);
      ctx.stroke();
    }
    for (const s of STREETS) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * sy);
      ctx.lineTo(x + w, y + s * sy);
      ctx.stroke();
    }
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect(x, y, SEA_X * sx, h);
    const target = game.missionTarget();
    if (target) {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(x + target.x * sx, y + target.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of game.policeCars) {
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(x + car.x * sx, y + car.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const player = game.player;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(x + player.x * sx, y + player.y * sy);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('N', x + w - 14, y + 16, 12, '#ffffff', 'center', 'bold');
  }

  function drawHud(game) {
    const player = game.player;
    // Top-left: cash, health, armour.
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    roundRect(ctx, 12, 12, 250, 92, 10);
    ctx.fill();
    text(`$${player.money.toLocaleString('en-US')}`, 26, 44, 26, '#2ecc71', 'left', 'bold');
    text(`Respect ${player.respect}`, 26, 68, 15, '#f1c40f', 'left');
    // Health bar.
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(26, 76, 180, 10);
    ctx.fillStyle = player.health > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(26, 76, 180 * (player.health / PLAYER.health), 10);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(26, 90, 180 * (player.armor / PLAYER.armor), 5);
    text('HP', 212, 86, 11, '#ffffff', 'left');
    // Top-right: wanted stars + clock + district.
    const stars = '★'.repeat(player.wanted) + '☆'.repeat(5 - player.wanted);
    text(stars, VIEW_W - 16, 46, 30, player.wanted > 0 ? '#ffd700' : '#888888', 'right', 'bold');
    const hh = Math.floor(game.clockMinutes / 60);
    const mm = Math.floor(game.clockMinutes % 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    text(clock, VIEW_W - 16, 74, 20, '#ffffff', 'right', 'bold');
    text(districtAt(player.x, player.y), VIEW_W - 16, 96, 14, '#dddddd', 'right');
    // Bottom-centre: mission objective.
    const objective = game.objectiveText();
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    const ow = Math.min(720, 40 + objective.length * 8);
    roundRect(ctx, (VIEW_W - ow) / 2, VIEW_H - 52, ow, 34, 8);
    ctx.fill();
    text(objective, VIEW_W / 2, VIEW_H - 29, 15, '#ffffff', 'center');
    // Bottom-right: weapon + ammo + speed.
    const weapon = WEAPONS[player.weapon];
    const ammo = player.ammo[player.weapon];
    text(weapon.name, VIEW_W - 16, VIEW_H - 170, 16, '#ffffff', 'right', 'bold');
    text(ammo === Infinity ? '∞' : `${ammo} rounds`, VIEW_W - 16, VIEW_H - 148, 14, '#dddddd', 'right');
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 0.55);
      text(`${kmh} km/h`, VIEW_W - 16, VIEW_H - 120, 22, '#ffffff', 'right', 'bold');
      text(player.inCar.name, VIEW_W - 16, VIEW_H - 98, 13, '#f1c40f', 'right');
    }
    // Message banner.
    const m = game.missions;
    if (m.messageTimer > 0 && m.message) {
      ctx.fillStyle = 'rgba(10,14,24,0.8)';
      const mw = Math.min(860, 60 + m.message.length * 8.5);
      roundRect(ctx, (VIEW_W - mw) / 2, 116, mw, 40, 8);
      ctx.fill();
      text(m.message, VIEW_W / 2, 142, 16, '#ffe14d', 'center', 'bold');
    }
    // Controls hint, first minute only.
    if (game.elapsed < 25) {
      text('WASD move/drive · E steal/exit car · Mouse aim, Click shoot · M mission · P pause', VIEW_W / 2, 118, 13, 'rgba(255,255,255,0.75)', 'center');
    }
    // Crosshair at the mouse (world aim).
    if (!player.inCar && !player.dead) {
      const mx = (game.aimScreen && game.aimScreen.x) || VIEW_W / 2;
      const my = (game.aimScreen && game.aimScreen.y) || VIEW_H / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 14, my);
      ctx.lineTo(mx - 6, my);
      ctx.moveTo(mx + 6, my);
      ctx.lineTo(mx + 14, my);
      ctx.moveTo(mx, my - 14);
      ctx.lineTo(mx, my - 6);
      ctx.moveTo(mx, my + 6);
      ctx.lineTo(mx, my + 14);
      ctx.stroke();
    }
    drawMinimap(game);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (VIEW_W - width) / 2;
    const y = (VIEW_H - height) / 2;
    ctx.fillStyle = 'rgba(8,10,20,0.88)';
    roundRect(ctx, x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || '#f1c40f';
    ctx.lineWidth = 3;
    ctx.stroke();
    text(title, VIEW_W / 2, y + 74, 46, '#ffffff', 'center', 'bold');
    lines.forEach((line, i) => text(line, VIEW_W / 2, y + 122 + i * 34, 18, '#dddddd', 'center'));
    text(prompt, VIEW_W / 2, y + height - 30, 18, '#f1c40f', 'center');
  }

  function drawTitle(game, best) {
    // The city keeps living behind the title: the game steps in demo mode.
    drawWorld(game);
    // Back to screen space before drawing any overlay text or panels.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.fillStyle = 'rgba(8,10,20,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('SOLANO HEAT', VIEW_W / 2, 128, 84, '#ff9f1c', 'center', 'bold');
    text('An open-world crime story in Port Solano', VIEW_W / 2, 166, 24, '#ffffff', 'center');
    text('Lucia Vega is back — and the Salt Kings owe her a garage.', VIEW_W / 2, 194, 17, '#dddddd', 'center');
    drawPanel('How to play', [
      'WASD — walk / drive · Mouse — aim · Click — shoot · E — steal or exit a car',
      'M — start a mission · F — punch · 1-4 — weapons · Shift — sprint · P — pause',
      'Steal cars, run missions, lose the police. Your progress saves automatically.',
      best > 0 ? `Best score: ${best}` : 'A completely original game — no Rockstar names, maps or art.',
    ], 'Press Space or click to start', '#ff9f1c');
  }

  function draw(game, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = game.shake ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = game.shake ? (Math.random() - 0.5) * game.shake : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    // Camera: translate the world so the camera's top-left is the view origin.
    ctx.translate(-game.camera.x, -game.camera.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(game, best);
      return;
    }
    drawWorld(game);
    // Night tint.
    const light = daylight(game.clockMinutes);
    if (light < 1) {
      ctx.fillStyle = `rgba(8,12,40,${(1 - light) * 0.55})`;
      ctx.fillRect(game.camera.x, game.camera.y, VIEW_W, VIEW_H);
    }
    // Back to screen space for the HUD.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawHud(game);
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(8,10,20,0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('Paused', ['The city waits. Your progress is saved.', 'M — missions · H — help'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      ctx.fillStyle = 'rgba(40,4,4,0.5)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('WASTED', [
        `Lucia went down in ${districtAt(game.player.x, game.player.y)}.`,
        `Score ${game.score()} · $${game.player.money} · ${game.player.kills} takedowns`,
        'The hospital patched her up. The story continues from the last save.',
      ], 'Press Space to try again', '#e74c3c');
    } else if (screen === SCREEN_HELP) {
      drawPanel('Help — Solano Heat', [
        'WASD move / drive · E steal or exit a car · Mouse aim, Click shoot',
        'M start a mission or side job · F punch · 1-4 switch weapon',
        'Wanted stars bring police. Hide from them and stars fade, one by one.',
        'Pickups: red + health, blue A armour, orange » ammo, green $ cash.',
      ], 'Press H or Esc to close');
    }
    void CLOCK_START_MINUTES;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}
