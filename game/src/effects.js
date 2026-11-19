// Solano Heat — juice. Screen shake on impacts, a hit-stop freeze, spark
// particles at the point of action, and floating respect text. Every effect
// marks something the player did; nothing is decoration alone.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.freeze = 0;
    this.particles = [];
    this.floaters = [];
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
    this.mat = new THREE.PointsMaterial({ color: 0xffc860, size: 0.9, transparent: true, opacity: 0.95 });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }
  impact(x, y, z, strength = 1) {
    this.shake = Math.min(1.4, this.shake + 0.55 * strength);
    this.freeze = Math.max(this.freeze, 0.05 * strength);
    const n = Math.floor(26 * strength);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 6 + 2;
      this.particles.push({
        x, y: y + 0.5, z,
        vx: Math.cos(a) * (4 + Math.random() * 8),
        vy: up,
        vz: Math.sin(a) * (4 + Math.random() * 8),
        life: 0.5 + Math.random() * 0.4,
      });
    }
    this.particles = this.particles.slice(-240);
  }
  floatText(text, x, y, z) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#000'; g.lineWidth = 6;
    g.strokeText(text, 128, 32);
    g.fillStyle = '#ffd94a'; g.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(14, 3.5, 1);
    s.position.set(x, y + 3, z);
    this.scene.add(s);
    this.floaters.push({ sprite: s, life: 1.1 });
  }
  update(dt) {
    if (this.freeze > 0) { this.freeze -= dt; return 0; }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < 240; i++) {
      const p = this.particles[i];
      if (p) {
        p.life -= dt;
        p.vy -= 22 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.4; }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      } else {
        pos[i * 3 + 1] = -100;
      }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    this.geo.attributes.position.needsUpdate = true;
    for (const f of this.floaters) {
      f.life -= dt;
      f.sprite.position.y += dt * 2.2;
      f.sprite.material.opacity = Math.max(0, f.life);
    }
    const dead = this.floaters.filter(f => f.life <= 0);
    for (const f of dead) { this.scene.remove(f.sprite); f.sprite.material.dispose(); }
    this.floaters = this.floaters.filter(f => f.life > 0);
    return this.shake;
  }
  shakeOffset() {
    if (this.shake <= 0) return [0, 0];
    const s = this.shake * 0.5;
    return [(Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s];
  }
}
