// Juice for Solano Heat: skid sparks, crash debris, muzzle flashes and the
// floating text that says "+$450" when a job lands. Particles live in one
// fixed pool, so a long chase never allocates; shake decays on its own so the
// camera settles without anyone telling it to.

export function makeEffects() {
  return {
    particles: [],
    shake: 0,
    texts: [],
    maxParticles: 240,
  };
}

export function spawnParticles(effects, x, y, z, count, color, speed = 8) {
  for (let i = 0; i < count; i += 1) {
    if (effects.particles.length >= effects.maxParticles) effects.particles.shift();
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    effects.particles.push({
      x, y, z,
      vx: Math.cos(a) * v,
      vy: 2 + Math.random() * 5,
      vz: Math.sin(a) * v,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color,
      size: 0.4 + Math.random() * 0.5,
    });
  }
}

export function stepEffects(effects, dt) {
  for (const p of effects.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 18 * dt;
    p.life -= dt;
  }
  effects.particles = effects.particles.filter((p) => p.life > 0);
  effects.shake = Math.max(0, effects.shake - dt * 2.2);
  for (const t of effects.texts) {
    t.age += dt;
    t.y += 26 * dt;
  }
  effects.texts = effects.texts.filter((t) => t.age < 1.4);
}

export function addShake(effects, amount) {
  effects.shake = Math.min(1.2, effects.shake + amount);
}

export function shakeOffset(effects) {
  const s = effects.shake * effects.shake;
  return {
    x: (Math.random() - 0.5) * s * 1.6,
    y: (Math.random() - 0.5) * s * 1.1,
  };
}

export function floatText(effects, text, kind = 'cash') {
  effects.texts.push({ text, kind, age: 0, y: 0 });
}

// Hit-stop: freeze the world for a beat on a hard impact, so it lands.
export function hitStop(effects, amount = 0.06) {
  effects.freeze = Math.max(effects.freeze || 0, amount);
}

// An explosion: orange core, grey smoke, a ring of fast sparks.
export function spawnExplosion(effects, x, y, z) {
  spawnParticles(effects, x, y, z, 14, 0xff6a3d, 14);
  spawnParticles(effects, x, y + 1, z, 8, 0x555555, 5);
  spawnParticles(effects, x, y, z, 10, 0xffd24d, 18);
}

export function consumeFreeze(effects, dt) {
  if (!effects.freeze || effects.freeze <= 0) return dt;
  effects.freeze -= dt;
  return 0;
}
