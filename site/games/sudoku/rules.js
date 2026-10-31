// Sudoku: fill the 9 × 9 grid so each row, column and 3 × 3 box holds 1 to 9 once. One player.
// The puzzle comes from the seed with exactly one solution, graded by the steps a person needs.
import { check, copy } from "../../lib/board.js";
import { int, shuffle } from "../../lib/rng.js";

const LEVELS = ["easy", "normal", "hard", "expert"];
const MAX_MOVES = 3000;
// The givens each level stops at (the least plus a seeded few) and the steps it may need:
// 1 naked singles, 2 naked and hidden singles, 3 anything while the solution stays unique.
// Hard and expert try a few grids for one that singles alone can't solve.
const PLAN = {
  easy: { least: 36, few: 5, steps: 1, tries: 1 },
  normal: { least: 30, few: 5, steps: 2, tries: 1 },
  hard: { least: 26, few: 4, steps: 3, tries: 3 },
  expert: { least: 17, few: 1, steps: 3, tries: 3 },
};
const ALL = Array.from({ length: 81 }, (_, i) => i);
// Each cell's row (0-8), column (9-17) and box (18-26), and the cells of each of those units.
const R = ALL.map((i) => Math.floor(i / 9));
const C = ALL.map((i) => 9 + (i % 9));
const B = ALL.map((i) => 18 + Math.floor(R[i] / 3) * 3 + Math.floor((i % 9) / 3));
const UNITS = Array.from({ length: 27 }, (_, u) => ALL.filter((i) => R[i] === u || C[i] === u || B[i] === u));
// How many digits a 9-bit mask holds, and the digit of a single bit.
const BITS = new Uint8Array(512);
for (let m = 1; m < 512; m++) BITS[m] = (m & 1) + BITS[m >> 1];
const digit = (bit) => 32 - Math.clz32(bit);

/** Put or take back `bit` at cell `i` in the units' used digits. */
function flip(used, i, bit) {
  used[R[i]] ^= bit;
  used[C[i]] ^= bit;
  used[B[i]] ^= bit;
}

/** The digits used in each unit, or null when a digit repeats. */
function usedBy(cells) {
  const used = new Int16Array(27);
  for (let i = 0; i < 81; i++) {
    const bit = cells[i] ? 1 << (cells[i] - 1) : 0;
    if ((used[R[i]] | used[C[i]] | used[B[i]]) & bit) return null;
    flip(used, i, bit);
  }
  return used;
}

const freeAt = (used, i) => ~(used[R[i]] | used[C[i]] | used[B[i]]) & 511;

/** The digits that fit somewhere among a unit's empty cells, and those that fit in one only. */
function spots(g, unit, free) {
  let once = 0;
  let twice = 0;
  for (const i of unit) {
    const m = g[i] ? 0 : free(i);
    twice |= once & m;
    once |= m;
  }
  return [once, once & ~twice];
}

/**
 * Count solutions up to `limit`: place a digit that fits one cell of a unit, else try the cell
 * with the fewest candidates. Digit `ban` is left out at cell `at`; the first solution goes into `out`.
 */
function solve(cells, limit, at = -1, ban = 0, out = null) {
  const g = cells.slice();
  const used = usedBy(g);
  if (!used) return 0;
  const free = (i) => freeAt(used, i) & (i === at ? ~ban : 511);
  let found = 0;
  const go = () => {
    let best = -1;
    let mask = 0;
    let fewest = 10;
    for (let i = 0; i < 81 && fewest > 1; i++) {
      const m = g[i] ? 0 : free(i);
      if (g[i] || BITS[m] >= fewest) continue;
      best = i;
      mask = m;
      fewest = BITS[m];
    }
    if (best < 0) {
      if (!found++ && out) out.splice(0, 81, ...g);
      return;
    }
    for (let u = 0; u < 27 && fewest > 1; u++) {
      const [once, lone] = spots(g, UNITS[u], free);
      // A digit with no cell left in this unit is a dead end.
      if (~used[u] & 511 & ~once) return;
      if (!lone) continue;
      mask = lone & -lone;
      best = UNITS[u].find((i) => !g[i] && free(i) & mask);
      fewest = 1;
    }
    for (let m = mask; m && found < limit; m &= m - 1) {
      g[best] = digit(m & -m);
      flip(used, best, m & -m);
      go();
      flip(used, best, m & -m);
    }
    g[best] = 0;
  };
  go();
  return found;
}

/** Whether singles alone solve it: naked singles, and hidden singles too when `hidden`. */
function bySingles(cells, hidden) {
  const g = cells.slice();
  const used = usedBy(g);
  const free = (i) => freeAt(used, i);
  const put = (i, bit) => {
    g[i] = digit(bit);
    flip(used, i, bit);
    moved = true;
  };
  let moved = true;
  while (moved && g.includes(0)) {
    moved = false;
    for (let i = 0; i < 81; i++) if (!g[i] && BITS[free(i)] === 1) put(i, free(i));
    if (moved || !hidden) continue;
    for (const unit of UNITS) {
      const lone = spots(g, unit, free)[1];
      const i = unit.find((j) => !g[j] && free(j) & lone & -lone);
      if (lone && i !== undefined) put(i, lone & -lone);
    }
  }
  return !g.includes(0);
}

/** A full grid: three random boxes on the diagonal, then the first way to fill the rest. */
function fullGrid(h) {
  const cells = Array(81).fill(0);
  for (const box of [18, 22, 26]) {
    const digits = shuffle(h, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    UNITS[box].forEach((i, k) => (cells[i] = digits[k]));
  }
  solve(cells.slice(), 1, -1, 0, cells);
  return cells;
}

/** Take cells away in a seeded order while the puzzle stays within the level. */
function makePuzzle(h, plan) {
  const sol = fullGrid(h);
  const cells = sol.slice();
  const goal = plan.least + int(h, plan.few);
  let left = 81;
  for (const i of shuffle(h, ALL)) {
    if (left <= goal) break;
    const d = cells[i];
    cells[i] = 0;
    // A removed digit keeps one solution when no other digit fits there.
    const ok = plan.steps < 3 ? bySingles(cells, plan.steps > 1) : !solve(cells, 1, i, 1 << (d - 1));
    if (ok) left--;
    else cells[i] = d;
  }
  return { cells, sol };
}

function init(_seats, seed, pick) {
  const level = LEVELS.includes(pick) ? pick : "normal";
  const h = { rng: seed >>> 0 };
  const plan = PLAN[level];
  let made = makePuzzle(h, plan);
  for (let n = 1; n < plan.tries && bySingles(made.cells, true); n++) made = makePuzzle(h, plan);
  return {
    turn: 0,
    moves: 0,
    rng: h.rng,
    note: null,
    level,
    given: made.cells,
    grid: made.cells.slice(),
    marks: Array(81).fill(0),
    mistakes: 0,
    sol: made.sol,
  };
}

const solved = (s) => s.grid.every((d, i) => d === s.sol[i]);
const over = (s) => solved(s) || s.moves >= MAX_MOVES;

function legalMoves(s, seat) {
  if (seat !== 0 || over(s)) return [];
  const out = [];
  for (let i = 0; i < 81; i++) {
    if (s.given[i]) continue;
    for (let d = 1; d <= 9; d++) if (s.grid[i] !== d) out.push({ t: "put", i, d });
    if (!s.grid[i]) for (let d = 1; d <= 9; d++) out.push({ t: "note", i, d });
    if (s.grid[i] || s.marks[i]) out.push({ t: "clear", i });
  }
  return out;
}

function why(s, seat, move) {
  if (over(s)) return "The puzzle is over.";
  if (seat !== 0) return "This puzzle has one player.";
  if (s.given[move?.i]) return "That square is part of the puzzle.";
  return "Pick an empty square and a digit.";
}

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, why(s, seat, move));
  const next = copy(s);
  const { i, d } = move;
  next.moves += 1;
  next.note = null;
  if (move.t === "note") next.marks[i] ^= 1 << (d - 1);
  else if (move.t === "clear") [next.grid[i], next.marks[i]] = [0, 0];
  else {
    next.grid[i] = d;
    next.marks[i] = 0;
    // The digit leaves the pencil marks of the cells that see this one.
    for (const u of [R[i], C[i], B[i]]) for (const j of UNITS[u]) next.marks[j] &= ~(1 << (d - 1));
    const wrong = d !== s.sol[i];
    if (wrong) next.mistakes += 1;
    const names = ["row", "column", "box"];
    const done = [R[i], C[i], B[i]]
      .map((u, k) => (UNITS[u].every((j) => next.grid[j] === s.sol[j]) ? `${names[k]} ${(u % 9) + 1}` : ""))
      .filter(Boolean);
    next.note = solved(next)
      ? "@0 solved it"
      : `@0 put a ${d}${wrong ? ", a mistake" : done.length ? ` and finished ${done.join(" and ")}` : ""}`;
  }
  return next;
}

function winner(s) {
  return over(s) ? { places: [[0]] } : null;
}

/** Cells whose digit repeats in its row, column or box. */
const conflicts = (g) =>
  ALL.filter((i) => g[i] && [R[i], C[i], B[i]].some((u) => UNITS[u].some((j) => j !== i && g[j] === g[i])));

function view(s) {
  return {
    level: s.level,
    given: s.given,
    grid: s.grid,
    marks: s.marks,
    conflicts: conflicts(s.grid),
    mistakes: s.mistakes,
    left: s.grid.filter((d) => !d).length,
  };
}

/**
 * The next step a person would find: a wrong digit to clear, else a naked single, else a hidden
 * single, else the empty cell with the fewest candidates. Every level plays the same sure step.
 */
function ai(s) {
  const wrong = s.grid.findIndex((d, i) => d && d !== s.sol[i]);
  if (wrong >= 0) return { t: "clear", i: wrong };
  const used = usedBy(s.grid);
  const free = (i) => freeAt(used, i);
  const put = (i) => ({ t: "put", i, d: s.sol[i] });
  let best = -1;
  for (let i = 0; i < 81; i++) {
    if (s.grid[i]) continue;
    if (BITS[free(i)] === 1) return put(i);
    if (best < 0 || BITS[free(i)] < BITS[free(best)]) best = i;
  }
  for (const unit of UNITS) {
    const lone = spots(s.grid, unit, free)[1];
    if (lone) return put(unit.find((j) => !s.grid[j] && free(j) & lone & -lone));
  }
  return put(best);
}

export default {
  id: "sudoku",
  name: "Sudoku",
  version: 1,
  players: { min: 1, max: 1 },
  hidden: false,
  realtime: false,
  puzzle: true,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
