// A seeded random source (splitmix32): the same seed always deals the same
// city, traffic and pedestrians, which is what makes screenshots repeatable
// and the sim tests deterministic. Nothing in the game reads Math.random.
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    return z / 4294967296;
  }
  return {
    next,
    /** Uniform in [min, max). */
    range(min, max) { return min + next() * (max - min); },
    /** Uniform integer in [min, max]. */
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    /** Pick one element of a non-empty array. */
    pick(list) { return list[Math.floor(next() * list.length)]; },
  };
}
