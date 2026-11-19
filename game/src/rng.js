// Seeded random numbers for Solano Heat. Every procedural choice in the city
// (building heights, traffic colours, pedestrian routes) comes from one seed,
// so a given seed always builds the same streets. The seed lives in the URL
// (?seed=) and defaults to 7, the day the story ends.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, low, high) {
  return low + rng() * (high - low);
}

export function rangeInt(rng, low, high) {
  return low + Math.floor(rng() * (high - low + 1));
}

export function chance(rng, probability) {
  return rng() < probability;
}

// A tiny shuffle that never allocates a copy of the whole list twice.
export function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

// Pick one entry from a weighted table: [[weight, value], ...]. The weights
// need not sum to one; a zero weight never wins.
export function weightedPick(rng, table) {
  let total = 0;
  for (const [w] of table) total += w;
  let roll = rng() * total;
  for (const [w, value] of table) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return table[table.length - 1][1];
}
