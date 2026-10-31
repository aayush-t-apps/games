// Card Lines: play a card from your hand and put a chip on a square of the board that shows it.
// Five chips in a line (across, down or on a slant) make a line; the four corners count for
// everyone. Each player has a colour; four players play in two pairs (seats 0 and 2 against 1 and
// 3), a colour for each pair. Two colours need two lines, three need one. A two-eyed jack (♦ ♣)
// goes on any open square; a one-eyed jack (♠ ♥) takes another colour's chip off, unless it is in
// a line. A card whose two squares are both taken is dead: trade it in, once a turn. A full board
// ends the match: the most lines win, then the longest row of chips.
import { check, copy, lines, nextSeat, placesBy } from "../../lib/board.js";
import { deal, draw, label, rank, refill, suit } from "../../lib/deck.js";
import { fork, int, shuffle } from "../../lib/rng.js";

const N = 10;
const CORNERS = new Set([0, 9, 90, 99]);
const HAND = [0, 0, 7, 6, 6];
const MAX_MOVES = 600;

/**
 * The board: 100 squares, a card on each (`-1` on a free corner). Every card but the jacks is on it
 * twice, square i and square 99 − i, so the board reads the same from both sides of the table.
 */
export const BOARD = (() => {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) if (r !== 11) cards.push(s * 13 + r - 1);
  const out = Array(N * N).fill(-1);
  let k = 0;
  for (let i = 0; i < 50; i++) {
    if (CORNERS.has(i)) continue;
    out[i] = cards[k];
    out[N * N - 1 - i] = cards[k];
    k++;
  }
  return out;
})();

const SPOTS = Array.from({ length: 52 }, (_, c) => BOARD.flatMap((b, i) => (b === c ? [i] : [])));
const WINDOWS = lines(N, N, 5).map((line) => line.map(([x, y]) => y * N + x));
const AT = Array.from({ length: N * N }, (_, i) => WINDOWS.filter((w) => w.includes(i)));
const DIRS = [1, N, N + 1, N - 1];

export const isJack = (c) => rank(c) === 11;
export const twoEyed = (c) => isJack(c) && (suit(c) === "D" || suit(c) === "C");
/** How many colours play: one a player, or two pairs when four play. */
export const colours = (seats) => (seats === 4 ? 2 : seats);

function init(seats, seed) {
  const s = {
    seats,
    colours: colours(seats),
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    chips: Array(N * N).fill(null),
    lines: [],
    hands: [],
    stock: [],
    discard: [],
    traded: false,
    passes: 0,
    last: null,
    note: null,
  };
  s.stock = shuffle(
    s,
    Array.from({ length: 104 }, (_, i) => i % 52),
  );
  s.hands = deal(s.stock, seats, HAND[seats]);
  return s;
}

const need = (s) => (s.colours === 2 ? 2 : 1);
const made = (s, c) => s.lines.filter((l) => l.colour === c).length;
const won = (s) => s.lines.length > 0 && made(s, s.lines[s.lines.length - 1].colour) >= need(s);
const full = (s) => s.chips.every((c, i) => c !== null || BOARD[i] === -1);
const over = (s) => won(s) || full(s) || s.passes >= s.seats || s.moves >= MAX_MOVES;
const mine = (chips, i, c) => CORNERS.has(i) || chips[i] === c;
const dead = (s, card) => !isJack(card) && SPOTS[card].every((i) => s.chips[i] !== null);
const ownLines = (s, c) => s.lines.filter((l) => l.colour === c).map((l) => l.cells);

/** The squares of colour c (or corners) in a row through square i, in direction d, in order. */
function row(chips, c, i, d) {
  // Walk back, then forward, while the squares are c's and stay on the board.
  const step = (j, sign) => {
    const k = j + sign * d;
    return k >= 0 && k < N * N && Math.abs((k % N) - (j % N)) <= 1 && mine(chips, k, c) ? k : -1;
  };
  let start = i;
  for (let k = step(start, -1); k !== -1; k = step(k, -1)) start = k;
  const out = [start];
  for (let k = step(start, 1); k !== -1; k = step(k, 1)) out.push(k);
  return out;
}

/** The longest row of colour c's chips (corners count). */
const longest = (chips, c) =>
  Math.max(0, ...chips.flatMap((x, i) => (x === c ? DIRS.map((d) => row(chips, c, i, d).length) : [])));

/** The new lines a chip of colour c on square i makes: one at most in each direction. */
function newLines(chips, taken, c, i) {
  const out = [];
  for (const d of DIRS) {
    const run = row(chips, c, i, d);
    if (run.length < 5) continue;
    const at = run.indexOf(i);
    for (let from = Math.max(0, at - 4); from <= Math.min(at, run.length - 5); from++) {
      const cells = run.slice(from, from + 5);
      // A second line may share one square with a line already made, no more.
      if ([...taken, ...out].every((l) => l.filter((x) => cells.includes(x)).length <= 1)) {
        out.push(cells);
        break;
      }
    }
  }
  return out;
}

function legalMoves(s, seat) {
  if (seat !== s.turn || over(s)) return [];
  const out = [];
  const colour = seat % s.colours;
  const locked = new Set(s.lines.flatMap((l) => l.cells));
  const seen = new Set();
  for (const card of s.hands[seat]) {
    if (seen.has(card)) continue;
    seen.add(card);
    if (twoEyed(card)) {
      for (let i = 0; i < N * N; i++) if (BOARD[i] !== -1 && s.chips[i] === null) out.push({ t: "play", card, cell: i });
    } else if (isJack(card)) {
      for (let i = 0; i < N * N; i++)
        if (s.chips[i] !== null && s.chips[i] !== colour && !locked.has(i)) out.push({ t: "take", card, cell: i });
    } else for (const i of SPOTS[card]) if (s.chips[i] === null) out.push({ t: "play", card, cell: i });
  }
  if (!s.traded) for (const card of seen) if (dead(s, card)) out.push({ t: "dead", card });
  if (!out.length) out.push({ t: "pass" });
  return out;
}

const where = (i) => `row ${Math.floor(i / N) + 1}, column ${(i % N) + 1}`;

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, "Play a card on an open square that shows it.");
  const next = copy(s);
  next.moves += 1;
  if (move.t === "pass") {
    next.passes += 1;
    next.traded = false;
    next.note = `@${seat} passed`;
    next.turn = nextSeat(seat, next.seats);
    return next;
  }
  const hand = next.hands[seat];
  hand.splice(hand.indexOf(move.card), 1);
  next.discard.push(move.card);
  refill(next, next.stock, next.discard);
  draw(next.stock, hand);
  if (move.t === "dead") {
    // The turn goes on: the new card may be played.
    next.traded = true;
    next.note = `@${seat} traded in a dead ${label(move.card)}`;
    return next;
  }
  next.passes = 0;
  if (move.t === "take") {
    next.chips[move.cell] = null;
    next.note = `@${seat} took a chip off ${where(move.cell)} with ${label(move.card)}`;
  } else {
    const colour = seat % next.colours;
    next.chips[move.cell] = colour;
    const fresh = newLines(next.chips, ownLines(next, colour), colour, move.cell);
    for (const cells of fresh) next.lines.push({ colour, cells });
    next.note = `@${seat} played ${label(move.card)} on ${where(move.cell)}${fresh.length ? " and made a line" : ""}`;
  }
  next.last = { cell: move.cell, t: move.t };
  next.traded = false;
  if (!over(next)) next.turn = nextSeat(seat, next.seats);
  return next;
}

// Places by colour: partners share theirs.
function winner(s) {
  if (!over(s)) return null;
  const scores = Array.from(
    { length: s.colours },
    (_, c) => (made(s, c) >= need(s) ? 1000 : 0) + made(s, c) * N + longest(s.chips, c),
  );
  const seats = Array.from({ length: s.seats }, (_, i) => i);
  return { places: placesBy(scores).map((group) => seats.filter((i) => group.includes(i % s.colours))) };
}

// With no seat (`null`), the public view: no hand, for spectators and a table.
function view(s, seat) {
  return {
    colours: s.colours,
    chips: s.chips,
    lines: s.lines,
    need: need(s),
    hand: seat === null ? [] : s.hands[seat].slice().sort((a, b) => a - b),
    counts: s.hands.map((h) => h.length),
    stock: s.stock.length,
    last: s.last,
  };
}

// The CPU. A square's worth to a colour: each stretch of five through it that no other colour
// blocks counts by how many of that colour's chips it would hold. Normal and hard also block the
// other colours, and keep the jacks for when they matter. Hard blocks only a stretch where another
// colour already has three: blocking less, it builds more, and wins more.
const GROW = [0, 1, 4, 16, 64, 1000];
const PLAN = { normal: { keep: 15, block: 0.5, low: 1 }, hard: { keep: 25, block: 0.3, low: 4 } };

function worth(chips, own, i, c, low = 1) {
  let v = 0;
  for (const w of AT[i]) {
    if (own.some((l) => l.filter((x) => w.includes(x)).length > 1)) continue;
    let n = 0;
    for (const j of w) {
      if (j === i || mine(chips, j, c)) n++;
      else if (chips[j] !== null) {
        n = -1;
        break;
      }
    }
    if (n >= low) v += GROW[n];
  }
  return v;
}

function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  if (legal[0].t === "pass") return legal[0];
  const colour = seat % s.colours;
  const others = Array.from({ length: s.colours }, (_, c) => c).filter((c) => c !== colour);
  const wins = (m) => {
    if (m.t !== "play") return false;
    const chips = s.chips.slice();
    chips[m.cell] = colour;
    return made(s, colour) + newLines(chips, ownLines(s, colour), colour, m.cell).length >= need(s);
  };
  const win = legal.find(wins);
  if (win) return win;
  if (level === "easy") return legal[int(fork(s, seat), legal.length)];
  const trade = legal.find((m) => m.t === "dead");
  if (trade) return trade;
  const { keep, block, low } = PLAN[level] ?? PLAN.hard;
  const value = (m) => {
    const at = s.chips[m.cell];
    if (m.t === "take") return worth(s.chips, ownLines(s, at), m.cell, at) - keep;
    const threat = Math.max(...others.map((c) => worth(s.chips, ownLines(s, c), m.cell, c, low)));
    return worth(s.chips, ownLines(s, colour), m.cell, colour) + block * threat - (isJack(m.card) ? keep : 0);
  };
  let best = legal[0];
  let bestValue = -Infinity;
  for (const m of legal) {
    const v = value(m);
    if (v > bestValue) {
      best = m;
      bestValue = v;
    }
  }
  return best;
}

export default {
  id: "card-lines",
  name: "Card Lines",
  version: 1,
  players: { min: 2, max: 4 },
  hidden: true,
  realtime: false,
  // Seats that share a place are partners: a shared first place is a win (four players).
  teams: true,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
