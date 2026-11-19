// A small seeded random number generator (splitmix32): the same seed gives the same
// game, which is what makes the screenshot scenes and the sim tests repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x9e3779b9) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    t ^= t >>> 15;
    return (t >>> 0) / 4294967296;
  };
}

/** An integer in [min, max). */
export function randInt(random, min, max) {
  return min + Math.floor(random() * (max - min));
}

/** One element of `list`, uniformly. */
export function randPick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A seeded generator from a string (a hashed seed), so named saves and named
 *  screenshot scenes can share the same repeatable randomness as a number seed. */
export function createRandomFromString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return createRandom(hash | 0);
}

/** A value in [min, max). */
export function randRange(random, min, max) {
  return min + random() * (max - min);
}
