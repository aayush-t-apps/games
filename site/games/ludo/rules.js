// Ludo: roll the die, then move a token. A 6 brings a token out of its base and plays again.
// Landing on another player's token sends it home to its base, except on a safe square. A token
// goes once round the 52-square track, up its own home column, and needs an exact roll to finish.
// The first player with all four tokens home wins.
import { ahead, check, copy, nextSeat, placesBy } from "../../lib/board.js";
import { int, fork } from "../../lib/rng.js";

export const TRACK = 52;
export const HOME = 56; // 0..50 on the track, 51..55 in the home column, 56 home.
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const MAX_MOVES = 4000;

function init(seats, seed) {
  return {
    seats,
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    // Two players sit opposite each other (colours 0 and 2).
    colors: seats === 2 ? [0, 2] : Array.from({ length: seats }, (_, i) => i),
    tokens: Array.from({ length: seats }, () => [-1, -1, -1, -1]),
    die: null,
    sixes: 0,
    note: null,
  };
}

/** The track square (0..51) of a token at progress `p`, or null off the track. */
export const square = (color, p) => (p >= 0 && p <= 50 ? ahead(color * 13, p, TRACK) : null);
const target = (p, die) => (p === -1 ? (die === 6 ? 0 : null) : p + die <= HOME ? p + die : null);
const done = (s) => s.tokens.some((t) => t.every((p) => p === HOME)) || s.moves >= MAX_MOVES;

function movable(s, seat) {
  const out = [];
  s.tokens[seat].forEach((p, k) => {
    if (p !== HOME && target(p, s.die) !== null) out.push(k);
  });
  return out;
}

function legalMoves(s, seat) {
  if (seat !== s.turn || done(s)) return [];
  if (s.die === null) return [{ t: "roll" }];
  return movable(s, seat).map((k) => ({ t: "move", k }));
}

function endTurn(s, seat) {
  s.die = null;
  s.sixes = 0;
  s.turn = nextSeat(seat, s.seats);
}

function apply(s, seat, move) {
  check(
    legalMoves(s, seat),
    move,
    s.die === null ? "Roll the die first." : "Move a token that can go that far.",
  );
  const next = copy(s);
  next.moves += 1;
  if (move.t === "roll") {
    next.die = int(next, 6) + 1;
    next.sixes = next.die === 6 ? next.sixes + 1 : 0;
    if (next.sixes === 3) {
      next.note = `@${seat} rolled a third 6 in a row, and the turn ends`;
      endTurn(next, seat);
    } else if (!movable(next, seat).length) {
      next.note = `@${seat} rolled ${next.die} and can't move`;
      endTurn(next, seat);
    } else next.note = `@${seat} rolled ${next.die}`;
    return next;
  }
  const color = next.colors[seat];
  const p = target(next.tokens[seat][move.k], next.die);
  next.tokens[seat][move.k] = p;
  const at = square(color, p);
  let captured = 0;
  if (at !== null && !SAFE.includes(at)) {
    next.tokens.forEach((list, other) => {
      if (other === seat) return;
      list.forEach((q, k) => {
        if (square(next.colors[other], q) === at) {
          list[k] = -1;
          captured += 1;
        }
      });
    });
  }
  next.note =
    p === HOME
      ? `@${seat} brought a token home`
      : captured
        ? `@${seat} captured a token`
        : p === 0
          ? `@${seat} brought a token out`
          : `@${seat} moved a token ${next.die}`;
  if (next.die === 6 && !done(next)) next.die = null;
  else endTurn(next, seat);
  return next;
}

const progress = (list) => list.reduce((n, p) => n + p + 1, 0);

function winner(s) {
  if (!done(s)) return null;
  const first = s.tokens.findIndex((t) => t.every((p) => p === HOME));
  const scores = s.tokens.map((t, seat) => (seat === first ? Infinity : progress(t)));
  return { places: placesBy(scores) };
}

const view = (s) => ({ colors: s.colors, tokens: s.tokens, die: s.die, safe: SAFE });

// How many opponent tokens could land on `at` with their next roll.
function danger(s, seat, at) {
  if (at === null || SAFE.includes(at)) return 0;
  let n = 0;
  s.tokens.forEach((list, other) => {
    if (other === seat) return;
    for (const q of list) {
      const from = square(s.colors[other], q);
      if (from === null) continue;
      const gap = (at - from + TRACK) % TRACK;
      if (gap >= 1 && gap <= 6 && q + gap <= 50) n += 1;
    }
  });
  return n;
}

function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  if (legal[0].t === "roll") return legal[0];
  const r = fork(s, seat);
  if (level === "easy") return legal[int(r, legal.length)];
  const color = s.colors[seat];
  const value = ({ k }) => {
    const from = s.tokens[seat][k];
    const p = target(from, s.die);
    const at = square(color, p);
    const hits = s.tokens.some(
      (list, o) => o !== seat && list.some((q) => at !== null && square(s.colors[o], q) === at),
    );
    let v = p / 10;
    if (hits && !SAFE.includes(at)) v += 100;
    if (p === HOME) v += 60;
    if (from === -1) v += 40;
    if (level === "normal") return v;
    if (at !== null && SAFE.includes(at)) v += 15;
    if (p > 50) v += 20;
    v -= 30 * danger(s, seat, at);
    v += 25 * danger(s, seat, square(color, from));
    return v;
  };
  return legal.reduce((a, b) => (value(b) > value(a) ? b : a));
}

export default {
  id: "ludo",
  name: "Ludo",
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
