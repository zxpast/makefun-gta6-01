// Solano Heat — drawing only: the world's state and the current screen in,
// pixels out.
//
// A top-down camera follows Lucia (or her car) over the city; the 1280x720 view
// is scaled to fit the window and centred. The picture is flat shapes and
// canvas text: district-tinted ground, asphalt roads with lane dashes, block
// buildings with roofs, the water at the south edge, cars, pedestrians, police
// with flashing light bars, the mission marker, and then the HUD — cash, wanted
// stars, clock, district, objective, countdown bar, stealth line, minimap,
// banners and the red edge flash when the heat rises. Text that holds a number
// is rebuilt only when the number changes, so a frame allocates nothing.
import { CITY, FONT, ON_FOOT, PALETTE, VIEW } from './config.js';
import { districtAt } from './city.js';

const ON_FOOT_RADIUS = ON_FOOT.radius;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';

const PANEL = { width: 640, top: 150, line: 32, bottom: 72 };
const MINIMAP = { size: 196, margin: 18 };
const STAR = '★';

function cachedText(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cashLabel = cachedText('$');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'top';
    context.fillText(value, x, y);
  }

  function drawCity(state, camera) {
    const city = state.city;
    context.fillStyle = PALETTE.ground;
    context.fillRect(camera.x - 40, camera.y - 40, VIEW.width + 80, VIEW.height + 80);

    // District tints, so the map reads at a glance.
    for (const d of city.districts || []) {
      context.fillStyle = d.tint;
      context.fillRect(d.x, d.y, d.w, d.h);
    }
    // Water along the south edge and the park in Downtown.
    context.fillStyle = PALETTE.water;
    context.fillRect(city.water.x, city.water.y, city.water.w, city.water.h);
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Roads: asphalt, then a dashed centre line each way.
    context.fillStyle = PALETTE.road;
    for (const rx of city.roads.vertical) context.fillRect(rx - city.halfRoad, 0, city.halfRoad * 2, CITY.height);
    for (const ry of city.roads.horizontal) context.fillRect(0, ry - city.halfRoad, CITY.width, city.halfRoad * 2);
    context.strokeStyle = PALETTE.lane;
    context.lineWidth = 2;
    context.setLineDash([18, 22]);
    context.beginPath();
    for (const rx of city.roads.vertical) {
      context.moveTo(rx, 0);
      context.lineTo(rx, CITY.height);
    }
    for (const ry of city.roads.horizontal) {
      context.moveTo(0, ry);
      context.lineTo(CITY.width, ry);
    }
    context.stroke();
    context.setLineDash([]);
    // Buildings: a coloured block, a darker roof line, and a lit window or two.
    for (const b of city.buildings) {
      context.fillStyle = b.shade === 'a' ? PALETTE.buildingA : b.shade === 'b' ? PALETTE.buildingB : PALETTE.buildingC;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, 8);
      context.fillStyle = 'rgba(242, 201, 76, 0.5)';
      context.fillRect(b.x + 10, b.y + 22, 10, 12);
      if (b.w > 90) context.fillRect(b.x + b.w - 22, b.y + 22, 10, 12);
    }
  }

  function drawMarker(state, camera, marker) {
    if (!marker) return;
    const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
    const r = 16 * pulse;
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(marker.x, marker.y, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
    context.fill();
    text(marker.label, marker.x, marker.y - 34, 16, PALETTE.marker, 'center');
  }

  function drawCarShape(car, color, lights) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(-car.length / 2, -car.width / 2, car.length, car.width, 7);
    context.fill();
    context.fillStyle = 'rgba(20, 20, 30, 0.85)';
    context.beginPath();
    context.roundRect(-6, -car.width / 2 + 4, 16, car.width - 8, 4);
    context.fill();
    if (lights) {
      context.fillStyle = Math.floor(performance.now() / 300) % 2 === 0 ? '#ff4b4b' : '#4b7bff';
      context.fillRect(-car.length / 2 - 4, -car.width / 2 - 2, 6, 8);
      context.fillRect(-car.length / 2 - 4, car.width / 2 - 6, 6, 8);
    }
    context.restore();
  }

  function drawEntities(state) {
    for (const car of state.cars) {
      if (car.playerDriven) continue;
      const color = car.kind === 'taxi' ? PALETTE.taxiCar : car.kind === 'target' ? '#c75a2e' : PALETTE.trafficCar;
      drawCarShape(car, color, false);
    }
    for (const cop of state.police) drawCarShape(cop, PALETTE.copCar, true);
    for (const ped of state.peds) {
      if (ped.down > 0) {
        context.fillStyle = ped.color;
        context.beginPath();
        context.ellipse(ped.x, ped.y, 10, 5, ped.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(ped.x, ped.y, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.beginPath();
      context.arc(ped.x - 2, ped.y - 2, 2, 0, Math.PI * 2);
      context.fill();
    }
    const player = state.player;
    if (player.inCar) {
      drawCarShape(player.inCar, PALETTE.playerCar, false);
    } else {
      // Lucia: a gold figure with a dark outline, blinking while punching.
      context.fillStyle = '#1a1420';
      context.beginPath();
      context.arc(player.x, player.y, ON_FOOT_RADIUS + 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(player.x, player.y, ON_FOOT_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#1a1420';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
      context.stroke();
    }
    for (const part of state.particles) {
      context.fillStyle = 'rgba(200, 200, 200, 0.5)';
      context.fillRect(part.x - 4, part.y - 4, 8, 8);
    }
  }

  function drawHud(state, screen) {
    // A dark panel behind the top strip so the text reads over bright sand and sky.
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, 0, VIEW.width, 64);
    const cash = state.missions.cash;
    text(cashLabel(cash), 20, 18, 30, PALETTE.gold, 'left');
    text(`Health ${Math.ceil(state.player.health)}`, 20, 44, 13, PALETTE.muted, 'left');
    const stars = STAR.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, VIEW.width - 220, 14, 26, state.wanted > 0 ? PALETTE.danger : PALETTE.muted, 'left');
    text(clockText(state.clockMinutes), VIEW.width - 220, 42, 15, PALETTE.text, 'left');
    text(districtAt(state.player.x, state.player.y), VIEW.width - 110, 42, 15, PALETTE.text, 'left');
    const objective = state.objectiveText || '';
    if (objective) {
      context.fillStyle = PALETTE.panel;
      const w = Math.min(720, context.measureText(objective).width + 320);
      context.fillRect(16, 74, 760, 30);
      text(objective, 28, 80, 17, PALETTE.text, 'left');
    }
    drawObjectiveExtras(state);
    drawMinimap(state);
    if (state.tutorialTimer > 0 && screen === SCREEN_PLAY && !state.player.inCar) {
      text('NEW HERE? Press M to start your first job — walk up to a car and press E to steal it.', VIEW.width / 2, VIEW.height - 44, 17, PALETTE.gold, 'center');
    }
    if (state.banner) {
      context.fillStyle = 'rgba(242, 201, 76, 0.92)';
      context.fillRect(VIEW.width / 2 - 260, 150, 520, 64);
      text(state.banner.text, VIEW.width / 2, 162, 26, '#1a1420', 'center');
      if (state.banner.sub) text(state.banner.sub, VIEW.width / 2, 192, 15, '#1a1420', 'center');
    }
    if (state.flash > 0) {
      context.strokeStyle = `rgba(229, 83, 75, ${Math.min(1, state.flash)})`;
      context.lineWidth = 14;
      context.strokeRect(7, 7, VIEW.width - 14, VIEW.height - 14);
      text(`HEAT RISING — ${state.wanted} STAR${state.wanted === 1 ? '' : 'S'}`, VIEW.width / 2, 120, 22, PALETTE.danger, 'center');
    }
  }

  function drawObjectiveExtras(state) {
    const step = state.stepInfo;
    if (!step) return;
    if (step.kind === 'timed' && state.timedLeft !== null && state.timedLeft !== undefined) {
      const total = step.seconds || 75;
      const ratio = Math.max(0, Math.min(1, state.timedLeft / total));
      const barW = 420;
      const x = VIEW.width / 2 - barW / 2;
      context.fillStyle = 'rgba(0,0,0,0.6)';
      context.fillRect(x - 4, 108, barW + 8, 22);
      context.fillStyle = ratio > 0.5 ? PALETTE.good : ratio > 0.25 ? PALETTE.gold : PALETTE.danger;
      context.fillRect(x, 112, barW * ratio, 14);
      text(`DELIVERY — ${Math.ceil(state.timedLeft)}s left`, VIEW.width / 2, 112, 14, PALETTE.text, 'center');
    }
    if (step.kind === 'stealth') {
      const clean = state.wanted === 0;
      context.fillStyle = clean ? PALETTE.good : PALETTE.danger;
      context.fillRect(VIEW.width / 2 - 130, 108, 260, 22);
      text(clean ? 'CLEAN — STAY QUIET' : 'SPOTTED — LOSE THE HEAT', VIEW.width / 2, 112, 14, '#1a1420', 'center');
    }
    if (step.kind === 'wait' && state.heldSeconds !== undefined) {
      text(`Holding turf… ${state.heldSeconds.toFixed(1)}s / ${step.seconds}s`, VIEW.width / 2, 112, 15, PALETTE.text, 'center');
    }
  }

  function drawMinimap(state) {
    const size = MINIMAP.size;
    const x0 = VIEW.width - size - MINIMAP.margin;
    const y0 = VIEW.height - size - MINIMAP.margin;
    const scale = size / CITY.width;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x0 - 6, y0 - 6, size + 12, size + 12);
    context.save();
    context.beginPath();
    context.rect(x0, y0, size, size);
    context.clip();
    context.fillStyle = '#14101c';
    context.fillRect(x0, y0, size, size);
    context.strokeStyle = 'rgba(138, 127, 90, 0.7)';
    context.lineWidth = 1;
    for (const rx of state.city.roads.vertical) {
      context.beginPath();
      context.moveTo(x0 + rx * scale, y0);
      context.lineTo(x0 + rx * scale, y0 + size);
      context.stroke();
    }
    for (const ry of state.city.roads.horizontal) {
      context.beginPath();
      context.moveTo(x0, y0 + ry * scale);
      context.lineTo(x0 + size, y0 + ry * scale);
      context.stroke();
    }
    if (state.mapMarker) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(x0 + state.mapMarker.x * scale, y0 + state.mapMarker.y * scale, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = PALETTE.danger;
    for (const cop of state.police) {
      context.fillRect(x0 + cop.x * scale - 2, y0 + cop.y * scale - 2, 4, 4);
    }
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x0 + state.player.x * scale, y0 + state.player.y * scale, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = 'rgba(242, 237, 228, 0.4)';
    context.lineWidth = 1;
    context.strokeRect(x0 - 6, y0 - 6, size + 12, size + 12);
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.gold, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 38, 22, PALETTE.gold, 'center');
  }

  function drawMissionMenu(state) {
    const lines = [];
    const chapters = state.chapterList || [];
    for (let i = 0; i < chapters.length; i += 1) {
      const done = state.completedChapters && state.completedChapters.includes(chapters[i].id);
      const current = i === state.chapterIndex;
      lines.push(`${done ? '✓' : current ? '►' : '·'} ${chapters[i].title} — $${chapters[i].reward}${done ? ' (done)' : ''}`);
    }
    lines.push('');
    lines.push('Side jobs — press 1 Taxi ($120) · 2 Courier ($150) · 3 Vigilante ($350) · 4 Repo ($500)');
    lines.push(`Cash $${state.missions.cash} · ${state.completedChapters ? state.completedChapters.length : 0} of ${chapters.length} chapters done`);
    drawPanel('SOLANO HEAT — Jobs', lines, 'Press M to close · 1-4 to take a side job');
  }

  /** Paint one frame: the city, the entities, then the HUD or a panel. */
  function draw(state, screen, extra) {
    const ui = extra || {};
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const camera = {
      x: Math.max(0, Math.min(CITY.width - VIEW.width, state.player.x - VIEW.width / 2)),
      y: Math.max(0, Math.min(CITY.height - VIEW.height, state.player.y - VIEW.height / 2)),
    };
    context.setTransform(view.scale, 0, 0, view.scale, view.x - camera.x * view.scale, view.y - camera.y * view.scale);
    drawCity(state, camera);
    drawMarker(state, camera, state.mapMarker);
    drawEntities(state);
    // Back to screen space for the HUD and panels.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLANO HEAT', ['Port Solano is yours — seven chapters, four side jobs,', 'one city that never sleeps. Steal a car, lose the cops,', 'get paid.'], 'Press Space or click to start');
      return;
    }
    const hudState = {
      ...state,
      objectiveText: ui.objective || '',
      stepInfo: ui.step || null,
      timedLeft: ui.timedLeft,
      heldSeconds: ui.heldSeconds,
      mapMarker: ui.marker || null,
      chapterList: ui.chapters || [],
      chapterIndex: ui.chapterIndex || 0,
      completedChapters: ui.completed || [],
    };
    drawHud(hudState, screen);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', ['The city waits for you.'], 'Press P to resume');
    else if (screen === SCREEN_OVER) drawPanel('Busted', ['The police caught up with you.'], 'Press Space to play again');
    else if (screen === SCREEN_MISSIONS) drawMissionMenu(hudState);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
