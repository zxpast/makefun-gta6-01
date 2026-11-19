// Solano Heat — boot and the one loop. The sim advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one) and the Three.js
// renderer paints what is there. Screens: title, play, paused, busted,
// wasted, missions, garage. ?seed=N fixes the city. ?shot=chase|heli|
// roadblock|finale stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady. ?auto=1 lets the autopilot play.

import { CAR, GARAGE, RADIO, SPAWN, STEP, WEAPONS } from './config.js';
import { createSim, EVENT_BUSTED, EVENT_SHOT, EVENT_WASTED } from './sim.js';
import { createMissions } from './missions.js';
import { createAutopilot } from './autopilot.js';
import { createWorldRenderer } from './world3d.js';
import { createHud } from './hud.js';
import {
  ACTION_CONFIRM,
  ACTION_GARAGE,
  ACTION_MISSIONS,
  ACTION_PAUSE,
  ACTION_RADIO,
  ACTION_SOUND,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const auto = params.get('auto') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const sim = createSim(seed);
const missions = createMissions(sim);
const renderer = createWorldRenderer(canvas, sim);
const hud = createHud(sim, missions);
const audio = createAudio();
const save = createSave(sim, missions);

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, sim, missions);
  let painted = 0;
  function paint() {
    renderer.draw(0, missions.waypoint());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const pilot = createAutopilot(sim, missions);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let garageOpen = false;
  let missionsOpen = false;

  // Load progress, if any visit left some.
  const loaded = save.load();
  if (loaded) save.apply(loaded);

  function startGame() {
    sim.reset();
    missions.acknowledge();
    if (auto) missions.startChapter(0);
    accumulator = 0;
    screen = 'play';
    hud.showPanel(null);
    announce('Solano Heat. Steal a car and drive.');
    audio.start();
  }

  function showTitle() {
    screen = 'title';
    hud.showPanel(
      '<h1>SOLANO HEAT</h1>' +
        '<p>Sun-soaked 3D open-world crime — chase-cam driving, helicopter pursuits, roadblocks, radio and garage upgrades.</p>' +
        '<p>Lucia Vane came back to Port Solano broke. Eight chapters take her from her first stolen car to the Night Job.</p>' +
        '<p class="keys">W A S D drive · E steal car · Space punch · F shoot · Q weapon · R radio · G garage · M jobs · P pause</p>' +
        '<p>Press Space or click to start.</p>',
    );
  }

  function showMissionsPanel() {
    missionsOpen = true;
    let rows = '<h1>Jobs</h1>';
    missions.chapters.forEach((ch, i) => {
      const done = missions.completed.includes(i) ? '✓ ' : '';
      rows += `<p data-chapter="${i}">${done}${i + 1}. ${ch.name} — $${ch.reward}<br><span>${ch.brief}</span></p>`;
    });
    rows += '<h2>Side jobs</h2>';
    missions.sideJobs.forEach((job) => {
      rows += `<p data-side="${job.kind}">${job.name} — $${job.reward}<br><span>${job.text}</span></p>`;
    });
    rows += '<p>Click a job, or press 1–8 for a chapter. Esc closes.</p>';
    hud.showPanel(rows);
    const panel = document.getElementById('hud-panel');
    panel.querySelectorAll('[data-chapter]').forEach((row) => {
      row.addEventListener('click', () => {
        missions.startChapter(Number(row.dataset.chapter));
        closePanels();
      });
    });
    panel.querySelectorAll('[data-side]').forEach((row) => {
      row.addEventListener('click', () => {
        missions.startSideJob(row.dataset.side);
        closePanels();
      });
    });
  }

  function showGaragePanel() {
    garageOpen = true;
    const s = sim.state;
    const rows =
      '<h1>Eastside Garage</h1>' +
      `<p>Cash $${Math.floor(s.cash)}</p>` +
      `<p data-buy="armor">1. Armor +${GARAGE.armorBonus} max health — $${GARAGE.armorPrice}${s.garage.armor ? ' (owned)' : ''}</p>` +
      `<p data-buy="engine">2. Engine tune +${CAR.engineBonus} m/s top speed — $${GARAGE.enginePrice}${s.garage.engine ? ' (owned)' : ''}</p>` +
      `<p data-buy="nos">3. NOS kit (3 charges) — $${GARAGE.nosPrice}${s.garage.nos ? ' (owned)' : ''}</p>` +
      `<p data-buy="nosRefill">4. NOS refill — $${GARAGE.nosRefillPrice}</p>` +
      `<p data-buy="weapon:1">5. Pistol — $${WEAPONS[1].price}${s.player.owned[1] ? ' (owned)' : ''}</p>` +
      `<p data-buy="weapon:2">6. SMG — $${WEAPONS[2].price}${s.player.owned[2] ? ' (owned)' : ''}</p>` +
      `<p data-buy="weapon:3">7. Shotgun — $${WEAPONS[3].price}${s.player.owned[3] ? ' (owned)' : ''}</p>` +
      `<p data-buy="ammo">8. Ammo for the current weapon — $${WEAPONS[s.player.weapon].ammoPrice ?? '—'}</p>` +
      '<p>Click a row or press its number. Esc closes.</p>';
    hud.showPanel(rows);
    const panel = document.getElementById('hud-panel');
    panel.querySelectorAll('[data-buy]').forEach((row) => {
      row.addEventListener('click', () => buyRow(row.dataset.buy));
    });
  }

  function buyRow(what) {
    const map = { 1: 'armor', 2: 'engine', 3: 'nos', 4: 'nosRefill', 5: 'weapon:1', 6: 'weapon:2', 7: 'weapon:3', 8: 'ammo' };
    const key = map[what] ?? what;
    let ok = false;
    if (key.startsWith('weapon:')) ok = sim.buy('weapon', Number(key.slice(7)));
    else if (key === 'ammo') ok = sim.buy('ammo', sim.state.player.weapon);
    else ok = sim.buy(key);
    if (ok) {
      audio.cash();
      save.save();
      showGaragePanel();
    } else {
      announce('Cannot buy that right now.');
    }
  }

  function closePanels() {
    garageOpen = false;
    missionsOpen = false;
    hud.showPanel(null);
    screen = 'play';
  }

  function nearGarage() {
    const g = sim.city.places.garage;
    return Math.hypot(sim.state.player.x - g.x, sim.state.player.z - g.z) < 14;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_SOUND) {
      const on = audio.toggleSound();
      announce(on ? 'Sound on.' : 'Sound off.');
    }
    if (actions & ACTION_RADIO) {
      const next = (sim.state.radio + 1) % 3;
      sim.state.radio = next;
      audio.setStation(next);
      announce(`Radio: ${RADIO[next].name}.`);
    }
    if (screen === 'title' || screen === 'over') {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (garageOpen || missionsOpen) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) closePanels();
      return;
    }
    if (actions & ACTION_MISSIONS) {
      showMissionsPanel();
      return;
    }
    if (actions & ACTION_GARAGE) {
      if (nearGarage()) showGaragePanel();
      else announce('The garage is in Eastside — follow the map.');
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = 'paused';
      hud.showPanel('<h1>Paused</h1><p>Press P to keep playing.</p>');
      announce('Paused.');
    }
  }

  function step() {
    if (screen !== 'play') return;
    const simInput = auto ? pilot.input() : input.read();
    const events = sim.step(STEP, simInput);
    missions.update(STEP);
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_BUSTED) {
      const lost = Math.floor(sim.state.cash * 0.1);
      sim.state.cash -= lost;
      sim.state.wanted = 0;
      sim.state.player.health = sim.state.player.maxHealth;
      sim.state.player.x = SPAWN.x;
      sim.state.player.z = SPAWN.z;
      sim.state.player.onFoot = true;
      screen = 'over';
      hud.showPanel(`<h1>Busted</h1><p>The cops took $${lost}. Back on the street.</p><p>Press Space to play again.</p>`);
      announce('Busted.');
      save.save();
      return;
    }
    if (events & EVENT_WASTED) {
      const lost = Math.floor(sim.state.cash * 0.25);
      sim.state.cash -= lost;
      sim.state.player.health = sim.state.player.maxHealth;
      sim.state.player.x = SPAWN.x;
      sim.state.player.z = SPAWN.z;
      sim.state.player.onFoot = true;
      sim.state.wanted = 0;
      screen = 'over';
      hud.showPanel(`<h1>Wasted</h1><p>You woke up at the Marina, $${lost} lighter.</p><p>Press Space to play again.</p>`);
      announce('Wasted.');
      save.save();
      return;
    }
    if (missions.done) {
      audio.cash();
      save.save();
      missions.acknowledge();
    }
    if (missions.failed) {
      announce(missions.message);
      missions.acknowledge();
    }
    audio.setEngine(sim.state.player.speed, !sim.state.player.onFoot);
    audio.setSiren(sim.state.wanted > 0, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === 'paused') {
      if (input.takeActions() & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.showPanel(null);
        announce('Playing.');
      }
      renderer.draw(0, missions.waypoint());
      return;
    }
    handleActions();
    if (screen === 'title') {
      renderer.draw(0, missions.waypoint());
      return;
    }
    while (accumulator >= STEP && screen === 'play') {
      step();
      accumulator -= STEP;
      if (screen !== 'play') break;
    }
    if (screen === 'play' || screen === 'over') {
      renderer.draw(STEP, missions.waypoint());
      hud.update(STEP);
    }
  }

  // Garage and chapter number keys, while a panel is open.
  window.addEventListener('keydown', (event) => {
    if (!garageOpen && !missionsOpen) return;
    const n = Number.parseInt(event.key, 10);
    if (!Number.isInteger(n) || n < 1 || n > 8) return;
    if (garageOpen) buyRow(String(n));
    else if (missionsOpen && n <= 8) {
      missions.startChapter(n - 1);
      closePanels();
    }
  });

  // Leaving the tab pauses a running game rather than letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      hud.showPanel('<h1>Paused</h1><p>Press P to keep playing.</p>');
      announce('Paused.');
    }
  });

  showTitle();
  announce('Solano Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
