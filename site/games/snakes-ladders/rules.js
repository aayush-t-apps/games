// Snakes and Ladders: roll two dice, then pick how far to go: one die, the other, or both added.
// A ladder's foot takes a token up to its top; a snake's head takes it down to its tail. The finish
// (square 100) needs an exact count, so a pick that goes past it isn't allowed. The first player on
// 100 wins. Pick to climb ladders and miss snakes.
import { check, copy, nextSeat, placesBy } from "../../lib/board.js";
import { int, fork } from "../../lib/rng.js";

export const LAST = 100;
// Square → where it takes a token: a ladder goes up, a snake goes down. A layout of our own.
export const JUMPS = {
  4: 25,
  13: 46,
  33: 49,
  42: 63,
  50: 69,
  62: 81,
  74: 92,
  27: 5,
  40: 3,
  43: 18,
  54: 31,
  66: 45,
  76: 58,
  89: 53,
  93: 73,
  97: 78,
};
const MAX_MOVES = 3000;

function init(seats, seed) {
  return {
    seats,
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    pos: Array(seats).fill(0), // 0 is the start, off the board.
    dice: null, // The roll to pick from, until the pick.
    note: null,
  };
}

/** Where a token on `p` ends after `n` steps: past a ladder or a snake; null past the finish. */
export const land = (p, n) => (p + n > LAST ? null : (JUMPS[p + n] ?? p + n));
/** The steps a roll offers: each die and both added, each once. */
const steps = ([a, b]) => [...new Set([a, b, a + b])].sort((x, y) => x - y);
const done = (s) => s.pos.includes(LAST) || s.moves >= MAX_MOVES;

function picks(s, seat) {
  return steps(s.dice).filter((n) => land(s.pos[seat], n) !== null);
}

function legalMoves(s, seat) {
  if (seat !== s.turn || done(s)) return [];
  if (s.dice === null) return [{ t: "roll" }];
  return picks(s, seat).map((n) => ({ t: "move", n }));
}

function apply(s, seat, move) {
  check(
    legalMoves(s, seat),
    move,
    s.dice === null ? "Roll the dice first." : "Pick a move your roll gives that ends on 100 or before.",
  );
  const next = copy(s);
  next.moves += 1;
  if (move.t === "roll") {
    next.dice = [int(next, 6) + 1, int(next, 6) + 1];
    const [a, b] = next.dice;
    if (picks(next, seat).length) next.note = `@${seat} rolled ${a} and ${b}`;
    else {
      next.note = `@${seat} rolled ${a} and ${b}, too far for 100`;
      next.dice = null;
      next.turn = nextSeat(seat, next.seats);
    }
    return next;
  }
  const square = next.pos[seat] + move.n;
  const to = land(next.pos[seat], move.n);
  next.pos[seat] = to;
  next.note =
    to === LAST
      ? `@${seat} reached 100`
      : to > square
        ? `@${seat} climbed a ladder from ${square} to ${to}`
        : to < square
          ? `@${seat} slid down a snake from ${square} to ${to}`
          : `@${seat} moved ${move.n} to ${to}`;
  next.dice = null;
  next.turn = nextSeat(seat, next.seats);
  return next;
}

function winner(s) {
  if (!done(s)) return null;
  return { places: placesBy(s.pos.map((p) => (p === LAST ? Infinity : p))) };
}

const view = (s) => ({ pos: s.pos, dice: s.dice });

// Every roll of two dice (36), for the hard CPU's look one turn ahead.
const ROLLS = Array.from({ length: 36 }, (_, i) => [(i % 6) + 1, Math.floor(i / 6) + 1]);

/** How good square `p` is: the finish is best; else the square the next roll can reach, on average. */
function outlook(p) {
  if (p === LAST) return 1000;
  let sum = 0;
  for (const roll of ROLLS) {
    const ends = steps(roll).map((n) => land(p, n) ?? p);
    sum += ends.includes(LAST) ? 200 : Math.max(...ends);
  }
  return sum / ROLLS.length;
}

function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  if (legal[0].t === "roll") return legal[0];
  if (level === "easy") return legal[int(fork(s, seat), legal.length)];
  const from = s.pos[seat];
  // Normal takes the move that ends highest; hard also looks at what the next roll can do from there.
  const value = ({ n }) => (level === "normal" ? land(from, n) : outlook(land(from, n)));
  return legal.reduce((a, b) => (value(b) > value(a) ? b : a));
}

export default {
  id: "snakes-ladders",
  name: "Snakes and Ladders",
  version: 1,
  players: { min: 2, max: 4 },
  hidden: false,
  realtime: false,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
