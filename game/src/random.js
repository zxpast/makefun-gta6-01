// A seeded random source for the whole game: the same seed deals the same
// city, the same traffic and the same missions, which is what makes the sim
// deterministic and the screenshot scenes repeatable. It is a small xorshift
// with four words of state, plus the helpers the city and the sim call on.

/** Mix a seed integer into four starting words. */
function seedWords(seed) {
  let w = seed >>> 0;
  const words = [0, 0, 0, 0];
  for (let i = 0; i < 4; i += 1) {
    w ^= w << 13;
    w ^= w >>> 17;
    w ^= w << 5;
    w >>>= 0;
    words[i] = w || 0x9e3779b9;
    w = (w + 0x6d2b79f5) >>> 0;
  }
  return words;
}

export function createRandom(seed) {
  const s = seedWords(seed);

  /** The next float in [0, 1). */
  function next() {
    const t = s[0] ^ (s[0] << 11);
    s[0] = s[1];
    s[1] = s[2];
    s[2] = s[3];
    s[3] = (s[3] ^ (s[3] >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return s[3] / 4294967296;
  }

  return {
    /** A float in [0, 1). */
    next,
    /** A float in [lo, hi). */
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    /** A whole number in [lo, hi]. */
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    /** One element of `list`, picked uniformly. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability `p`. */
    chance(p) {
      return next() < p;
    },
    /** A unit angle in radians. */
    angle() {
      return next() * Math.PI * 2;
    },
  };
}
