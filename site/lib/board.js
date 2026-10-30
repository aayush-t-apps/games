// Grids and tracks for the rules, and the small helpers every game uses.

/**
 * A grid of `w` columns and `h` rows, as rows of cells, each `fill`.
 * @param {number} w
 * @param {number} h
 * @param {unknown} [fill]
 */
export function grid(w, h, fill = null) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}

/** Every line of `len` cells in a `w` × `h` grid: rows, columns and both diagonals. */
export function lines(w, h, len) {
  const out = [];
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (const [dx, dy] of dirs) {
        const ex = x + dx * (len - 1);
        const ey = y + dy * (len - 1);
        if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;
        out.push(Array.from({ length: len }, (_, i) => [x + dx * i, y + dy * i]));
      }
  return out;
}

/** The square `steps` ahead of `from` on a loop of `size` squares. */
export const ahead = (from, steps, size) => (((from + steps) % size) + size) % size;

/** The seat after `seat` among `count` seats. */
export const nextSeat = (seat, count) => (seat + 1) % count;

/** Two moves are the same when their fields are (moves are small flat objects). */
export function sameMove(a, b) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Throw `reason` unless `move` is one of `legal`. */
export function check(legal, move, reason) {
  if (!move || typeof move !== "object" || !legal.some((m) => sameMove(m, move)))
    throw new Error(reason);
}

/** Places from scores: the highest first, equal scores share a place. */
export function placesBy(scores, higherWins = true) {
  const seats = scores.map((_, i) => i);
  seats.sort((a, b) => (higherWins ? scores[b] - scores[a] : scores[a] - scores[b]) || a - b);
  const places = [];
  for (const s of seats) {
    const last = places[places.length - 1];
    if (last && scores[last[0]] === scores[s]) last.push(s);
    else places.push([s]);
  }
  return places;
}

/** A deep copy of a plain state (the rules never change the state they are given). */
export const copy = (state) => structuredClone(state);
