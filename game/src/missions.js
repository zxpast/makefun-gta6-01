// Solano Heat — mission runtime. Twelve story jobs over seven days, each
// with a beacon, a timer where the story needs one, and a saw-tooth curve:
// new systems enter gently, peak, then the next job breathes.
import { MISSIONS, missionById, missionTarget, objectiveText, daysLeft, completeMission } from './sim.js';
import { makeBeacon } from './city.js';

const SIDE_JOB_NAMES = {
  taxi: 'Taxi Fare — drop the passenger off',
  courier: 'Courier — deliver the package',
  vigilante: 'Vigilante — ram the getaway car',
  repo: 'Repo Job — bring the car back',
};

// How long the clock runs for each job shape; 0 means no timer at all.
function jobTimeLimit(type) {
  if (type === 'timed') return 75;
  if (type === 'escape') return 120;
  if (type === 'finale') return 240;
  return 0;
}

export class MissionRunner {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.active = null; // { mission, target, phase, timer, beacon, timerMax }
    this.banner = '';
    this.bannerUntil = 0;
    this.sideJob = null;
  }
  current() { return this.active ? this.active.mission : null; }
  start(id) {
    const m = missionById(id);
    if (!m) return false;
    this.clearBeacon();
    const target = missionTarget(id);
    const beacon = makeBeacon(m.id === 12 ? 0xff4444 : 0xf5c542);
    beacon.position.set(target.x, 0, target.z);
    this.scene.add(beacon);
    const timerMax = jobTimeLimit(m.type);
    this.active = { mission: m, target, phase: 'go', timer: timerMax, timerMax, beacon, noDamage: true, stunts: 0 };
    this.banner = `DAY ${m.day} — ${m.name.toUpperCase()}: ${m.blurb}`;
    return true;
  }
  startSideJob(kind) {
    const label = SIDE_JOB_NAMES[kind] || 'Side job';
    const target = { x: (Math.random() * 2 - 1) * 480, z: (Math.random() * 2 - 1) * 480 };
    this.clearBeacon();
    const beacon = makeBeacon(0x4fc3f7);
    beacon.position.set(target.x, 0, target.z);
    this.scene.add(beacon);
    this.sideJob = { kind, target, beacon, label };
    this.banner = 'SIDE JOB: ' + label;
    return this.sideJob;
  }
  clearBeacon() {
    if (this.active && this.active.beacon) this.scene.remove(this.active.beacon);
    if (this.sideJob && this.sideJob.beacon) this.scene.remove(this.sideJob.beacon);
    if (this.active) this.active.beacon = null;
    if (this.sideJob) this.sideJob.beacon = null;
  }
  abort() {
    this.clearBeacon();
    this.active = null;
    this.sideJob = null;
  }
  // Returns { done, failed, reason, gain } when the job resolves.
  update(dt, player, wanted, time) {
    const out = { done: false, failed: false };
    if (this.active) {
      const a = this.active;
      if (a.timerMax > 0) {
        a.timer -= dt;
        if (a.timer <= 0) {
          this.abort();
          out.failed = true;
          out.reason = 'Time ran out.';
          return out;
        }
      }
      const dx = player.x - a.target.x;
      const dz = player.z - a.target.z;
      const dist = Math.hypot(dx, dz);
      a.dist = dist;
      if (a.mission.type === 'stealth') {
        // Failing the stealth job means being spotted up close at speed.
        if (wanted >= 3 && dist < 200 && Math.abs(player.speed) > 5) {
          this.abort();
          out.failed = true;
          out.reason = 'Spotted. The streets saw you.';
          return out;
        }
      }
      if (a.mission.type === 'combat' && a.phase === 'go' && dist < 26) {
        a.phase = 'fight';
        this.banner = 'Take down the rival crew — click to shoot, then get out.';
      }
      const inCombat = a.mission.type === 'combat' && a.phase === 'fight';
      if (inCombat || a.mission.type !== 'combat') {
        if (dist < 14) {
          if (inCombat && !a.fightDone) {
            a.fightDone = true;
            a.target = { x: a.target.x + 120, z: a.target.z + 80 };
            a.beacon.position.set(a.target.x, 0, a.target.z);
            this.banner = 'Crew down. Now vanish — reach the new marker.';
            return out;
          }
          const gain = completeMission(this.state, a.mission.id, {
            timeBonus: a.timerMax > 0 && a.timer > a.timerMax * 0.25,
            noDamage: a.noDamage,
            stunts: a.stunts,
          });
          this.clearBeacon();
          this.active = null;
          out.done = true;
          out.gain = gain;
          out.mission = a.mission;
          return out;
        }
      }
      if (a.beacon && a.beacon.userData.ring) {
        const s = 1 + Math.sin(time * 4) * 0.18;
        a.beacon.userData.ring.scale.set(s, s, 1);
      }
    }
    if (this.sideJob) {
      const s = this.sideJob;
      const dist = Math.hypot(player.x - s.target.x, player.z - s.target.z);
      if (dist < 14) {
        this.state.cash += 120;
        this.state.respect += 5;
        this.clearBeacon();
        this.sideJob = null;
        this.banner = 'Side job done: +$120, +5 respect.';
        out.sideDone = true;
      }
    }
    return out;
  }
  objectiveLine() {
    if (this.active) {
      const m = this.active.mission;
      const t = this.active.target;
      const dist = this.active.dist !== undefined ? Math.round(this.active.dist) : 0;
      const clock = this.active.timerMax > 0 ? ` — ${Math.max(0, Math.ceil(this.active.timer))}s` : '';
      return `${objectiveText(m)} — ${dist}m${clock} — ${daysLeft(m.id)} days to the Night Job`;
    }
    if (this.sideJob) return this.sideJob.label;
    return 'Free roam — pick a mission (M) or find a side job marker';
  }
  progress() {
    return { done: this.state.completed.length, total: MISSIONS.length, next: this.state.nextMission };
  }
}
