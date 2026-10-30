// Memory: pairs lie face down; flip two. A pair scores and plays again. A miss stays open until the
// next flip, so everyone sees it. The CPU remembers each card it has seen with a chance by level.
import { check, copy, nextSeat, placesBy } from "../../lib/board.js";
import { int, fork, seedOf, shuffle } from "../../lib/rng.js";

const PAIRS = 10;
const COLS = 5;
const MAX_MOVES = 2000;
const RECALL = { easy: 0.35, normal: 0.7, hard: 0.95, best: 1 };

function init(seats, seed) {
  const s = {
    seats,
    seed: seed >>> 0,
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    cards: [],
    gone: Array(PAIRS * 2).fill(false),
    seen: Array(PAIRS * 2).fill(false),
    open: [],
    miss: null,
    pairs: Array(seats).fill(0),
    note: null,
  };
  const symbols = Array.from({ length: PAIRS * 2 }, (_, i) => i % PAIRS);
  s.cards = shuffle(s, symbols);
  return s;
}

const done = (s) => s.gone.every(Boolean) || s.moves >= MAX_MOVES;

function legalMoves(s, seat) {
  if (seat !== s.turn || done(s)) return [];
  const out = [];
  s.cards.forEach((_, i) => {
    if (!s.gone[i] && !s.open.includes(i)) out.push({ t: "flip", i });
  });
  return out;
}

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, "Pick a card that is face down.");
  const next = copy(s);
  next.moves += 1;
  next.seen[move.i] = true;
  next.miss = null;
  if (!next.open.length) {
    next.open = [move.i];
    next.note = `@${seat} turned a card`;
    return next;
  }
  const first = next.open[0];
  next.open = [];
  if (next.cards[first] === next.cards[move.i]) {
    next.gone[first] = true;
    next.gone[move.i] = true;
    next.pairs[seat] += 1;
    next.note = `@${seat} found a pair and plays again`;
  } else {
    next.miss = [first, move.i];
    next.turn = nextSeat(seat, s.seats);
    next.note = `@${seat} missed`;
  }
  return next;
}

function winner(s) {
  return done(s) ? { places: placesBy(s.pairs) } : null;
}

function view(s) {
  const faces = s.cards.map((symbol, i) =>
    s.gone[i] ? -1 : s.open.includes(i) || s.miss?.includes(i) ? symbol : null,
  );
  return { cols: COLS, faces, open: s.open, miss: s.miss, pairs: s.pairs, gone: s.gone };
}

function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  const recall = RECALL[level] ?? RECALL.hard;
  const r = fork(s, seat);
  // The CPU remembers a seen card when its fixed chance for this card is under its recall.
  const knows = (i) => s.seen[i] && seedOf(`${s.seed}:${seat}:${i}`) / 4294967296 < recall;
  const known = legal.filter((m) => knows(m.i));
  const unknown = legal.filter((m) => !knows(m.i));
  const random = (list) => list[int(r, list.length)];
  if (s.open.length) {
    const symbol = s.cards[s.open[0]];
    return (
      known.find((m) => s.cards[m.i] === symbol) ?? random(unknown.length ? unknown : legal)
    );
  }
  for (const a of known) {
    const pair = known.find((b) => b.i !== a.i && s.cards[b.i] === s.cards[a.i]);
    if (pair) return a;
  }
  return random(unknown.length ? unknown : legal);
}

export default {
  id: "memory",
  name: "Memory",
  version: 1,
  players: { min: 1, max: 4 },
  hidden: false,
  realtime: false,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
