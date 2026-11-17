// Solano Heat — a small seeded random number generator.
//
// The same seed gives the same stream of numbers, which is what makes the city
// layout, the traffic and the screenshot scenes repeatable: a scene staged from
// seed 7 always looks the same. It is a tiny integer generator (sfc32-style):
// four 32-bit words of state, stirred with multiplies and rotations, read out
// as a float in [0, 1). No browser in here, no allocation after creation.
export function createRandom(seed) {
  let a = (seed | 0) || 1;
  let b = (a ^ 0x9e3779b9) >>> 0;
  let c = (Math.imul(a, 2654435761) ^ 0x85ebca6b) >>> 0;
  let d = (c + 0x27d4eb2f) >>> 0;

  function next() {
    const t = (a + b + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + ((c << 3) | (c >>> 29))) | 0;
    c = (Math.imul(c, 3) + t) | 0;
    return ((t >>> 0) % 4294967296) / 4294967296;
  }

  // An integer in [0, n), and a pick from a list, both from the same stream.
  next.int = function intBelow(n) {
    return Math.floor(next() * n);
  };
  next.pick = function pickOne(list) {
    return list[Math.floor(next() * list.length)];
  };
  next.range = function rangeBetween(low, high) {
    return low + next() * (high - low);
  };
  return next;
}
