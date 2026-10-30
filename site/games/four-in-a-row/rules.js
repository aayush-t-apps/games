// Four in a Row: two players drop discs into a 7 × 6 grid; four in a line wins.
import { check, copy, lines } from "../../lib/board.js";
import { int, fork } from "../../lib/rng.js";

const W = 7;
const H = 6;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DEPTH = { easy: 1, normal: 4, hard: 7, best: 7 };
const LINES = lines(W, H, 4).map((line) => line.map(([x, y]) => y * W + x));
const LINES_AT = Array.from({ length: W * H }, (_, i) => LINES.filter((l) => l.includes(i)));
const WIN = 1_000_000;

function init(seats, seed) {
  return {
    cells: Array(W * H).fill(null),
    turn: 0,
    seats,
    moves: 0,
    rng: seed >>> 0,
    last: null,
    line: null,
    note: null,
  };
}

const over = (s) => s.line !== null || s.moves === W * H;
const top = (cells, col) => {
  for (let row = H - 1; row >= 0; row--) if (cells[row * W + col] === null) return row;
  return -1;
};

function legalMoves(s, seat) {
  if (seat !== s.turn || over(s)) return [];
  const out = [];
  for (let col = 0; col < W; col++) if (s.cells[col] === null) out.push({ t: "drop", col });
  return out;
}

const winLine = (cells, i) =>
  LINES_AT[i].find((line) => line.every((j) => cells[j] === cells[i])) ?? null;

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, "Pick a column that isn't full.");
  const next = copy(s);
  const row = top(next.cells, move.col);
  const i = row * W + move.col;
  next.cells[i] = seat;
  next.moves += 1;
  next.last = i;
  next.line = winLine(next.cells, i);
  next.note = `@${seat} dropped a disc in column ${move.col + 1}`;
  if (!over(next)) next.turn = 1 - seat;
  return next;
}

function winner(s) {
  if (s.line) return { places: [[s.cells[s.line[0]]], [1 - s.cells[s.line[0]]]] };
  if (s.moves === W * H) return { places: [[0, 1]] };
  return null;
}

const view = (s) => ({ cols: W, rows: H, cells: s.cells, last: s.last, line: s.line });

// The CPU: negamax with alpha-beta to a fixed depth, so the same position gives the same move.
// The search keeps, for every line of four, how many discs each seat has in it, so a move updates
// the score and finds a win from the few lines through its cell.
const LINE_IDS = Array.from({ length: W * H }, (_, i) =>
  LINES.flatMap((line, k) => (line.includes(i) ? [k] : [])),
);
const WEIGHT = [0, 1, 5, 50, 0];
const lineValue = (a, b) => (b === 0 ? WEIGHT[a] : a === 0 ? -WEIGHT[b] : 0);

function search(cells) {
  const counts = [new Int8Array(LINES.length), new Int8Array(LINES.length)];
  const heights = new Int8Array(W);
  let delta = 0;
  let won = false;
  // Put seat p's disc in column col: sets `delta` (the score change for seat 0) and `won`.
  const place = (col, p) => {
    const i = (H - 1 - heights[col]) * W + col;
    heights[col] += 1;
    const own = counts[p];
    delta = col === 3 ? (p === 0 ? 3 : -3) : 0;
    won = false;
    for (const k of LINE_IDS[i]) {
      const before = lineValue(counts[0][k], counts[1][k]);
      own[k] += 1;
      if (own[k] === 4) won = true;
      delta += lineValue(counts[0][k], counts[1][k]) - before;
    }
  };
  const lift = (col, p) => {
    heights[col] -= 1;
    for (const k of LINE_IDS[(H - 1 - heights[col]) * W + col]) counts[p][k] -= 1;
  };
  let score = 0;
  for (let col = 0; col < W; col++)
    for (let row = H - 1; row >= 0 && cells[row * W + col] !== null; row--) {
      place(col, cells[row * W + col]);
      score += delta;
    }

  function negamax(p, depth, alpha, beta, filled, value) {
    if (filled === W * H) return 0;
    if (depth === 0) return p === 0 ? value : -value;
    let best = -Infinity;
    for (const col of ORDER) {
      if (heights[col] === H) continue;
      place(col, p);
      const v = won ? WIN + depth : -negamax(1 - p, depth - 1, -beta, -alpha, filled + 1, value + delta);
      lift(col, p);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Each open column's value for seat p, searched `depth` moves deep. */
  return (p, depth, filled) => {
    const out = [];
    let alpha = -Infinity;
    for (const col of ORDER) {
      if (heights[col] === H) continue;
      place(col, p);
      const v = won ? WIN + depth : -negamax(1 - p, depth - 1, -Infinity, -alpha, filled + 1, score + delta);
      lift(col, p);
      out.push({ col, v });
      if (v > alpha) alpha = v;
    }
    return out;
  };
}

function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  const values = search(s.cells)(seat, level === "easy" ? 1 : (DEPTH[level] ?? DEPTH.hard), s.moves);
  if (level === "easy") {
    const win = values.find((x) => x.v >= WIN);
    return win ? { t: "drop", col: win.col } : legal[int(fork(s, seat), legal.length)];
  }
  const best = values.reduce((a, b) => (b.v > a.v ? b : a));
  return { t: "drop", col: best.col };
}

export default {
  id: "four-in-a-row",
  name: "Four in a Row",
  version: 1,
  players: { min: 2, max: 2 },
  hidden: false,
  realtime: false,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
