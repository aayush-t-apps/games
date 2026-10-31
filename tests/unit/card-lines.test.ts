// Card Lines' own rules (change 0007): the board, lines of five, the jacks and dead cards. The
// shared tests in games.test.ts play it to the end.
import { describe, expect, it } from "vitest";
import game, { BOARD } from "../../site/games/card-lines/rules.js";

type Move = { t: string; card?: number; cell?: number };
type State = {
  turn: number;
  chips: (number | null)[];
  lines: { colour: number; cells: number[] }[];
  hands: number[][];
  traded: boolean;
};
const rules = game as unknown as {
  init(seats: number, seed: number): State;
  legalMoves(s: State, seat: number): Move[];
  apply(s: State, seat: number, m: Move): State;
  winner(s: State): { places: number[][] } | null;
  ai(s: State, seat: number, level: string): Move;
};
// Cards: suit * 13 + rank - 1 (spades, hearts, diamonds, clubs).
const JACK = { S: 10, H: 23, D: 36, C: 49 };
const at = (card: number) => BOARD.flatMap((c, i) => (c === card ? [i] : []));

/** A match of `seats` with seat 0 to move, holding `hand`, and chips of these colours on the board. */
function table(seats: number, hand: number[], chips: Record<number, number> = {}) {
  const s = rules.init(seats, 1);
  s.hands[0] = hand;
  for (const [i, colour] of Object.entries(chips)) s.chips[Number(i)] = colour;
  return s;
}

describe("Card Lines", () => {
  it("has every card but the jacks twice, square i and 99 − i, and four free corners", () => {
    expect([0, 9, 90, 99].map((i) => BOARD[i])).toEqual([-1, -1, -1, -1]);
    for (let card = 0; card < 52; card++) {
      const squares = at(card);
      if (card % 13 === 10) expect(squares).toEqual([]);
      else expect(squares).toEqual([squares[0], 99 - (squares[0] as number)]);
    }
  });

  it("makes a line of five with a corner, and two players need two lines", () => {
    // Row 0: the corner, then squares 1 to 4.
    const s = table(2, [BOARD[4] as number], { 1: 0, 2: 0, 3: 0 });
    const next = rules.apply(s, 0, { t: "play", card: BOARD[4], cell: 4 });
    expect(next.lines).toEqual([{ colour: 0, cells: [0, 1, 2, 3, 4] }]);
    expect(rules.winner(next)).toBeNull();
    expect(next.turn).toBe(1);
  });

  it("lets a second line share one square with the first, and that wins", () => {
    // Column 4 down from square 4, which is in the first line.
    const s = table(2, [BOARD[44] as number], { 1: 0, 2: 0, 3: 0, 4: 0, 14: 0, 24: 0, 34: 0 });
    s.lines = [{ colour: 0, cells: [0, 1, 2, 3, 4] }];
    const next = rules.apply(s, 0, { t: "play", card: BOARD[44], cell: 44 });
    expect(next.lines[1]).toEqual({ colour: 0, cells: [4, 14, 24, 34, 44] });
    expect(rules.winner(next)).toEqual({ places: [[0], [1]] });
  });

  it("lets a two-eyed jack go on any open square, and a one-eyed jack take a chip not in a line", () => {
    // Two players, so the other colour's one line doesn't end the match.
    const s = table(2, [JACK.D, JACK.S], { 55: 1, 56: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    s.lines = [{ colour: 1, cells: [1, 2, 3, 4, 5] }];
    const legal = rules.legalMoves(s, 0);
    expect(legal.filter((m) => m.card === JACK.D)).toHaveLength(96 - 7);
    expect(legal.filter((m) => m.t === "take")).toEqual([{ t: "take", card: JACK.S, cell: 55 }]);
    const next = rules.apply(s, 0, { t: "take", card: JACK.S, cell: 55 });
    expect(next.chips[55]).toBeNull();
  });

  it("trades a dead card in once a turn, and the turn goes on", () => {
    const card = BOARD[1] as number;
    const [a, b] = at(card) as [number, number];
    const s = table(2, [card, card], { [a]: 1, [b]: 1 });
    expect(rules.legalMoves(s, 0)).toEqual([{ t: "dead", card }]);
    expect(rules.ai(s, 0, "hard")).toEqual({ t: "dead", card });
    const next = rules.apply(s, 0, { t: "dead", card });
    expect(next.turn).toBe(0);
    expect(next.hands[0]).toHaveLength(2);
    expect(rules.legalMoves(next, 0).some((m) => m.t === "dead")).toBe(false);
  });

  it("plays four as two pairs: partners share a colour, a place and the win", () => {
    const s = table(4, [BOARD[4] as number], { 1: 0, 2: 0, 3: 0 });
    s.lines = [{ colour: 0, cells: [40, 50, 60, 70, 80] }];
    // Seat 2's chips are seat 0's colour: the pair's second line wins it.
    s.turn = 2;
    s.hands[2] = [BOARD[4] as number];
    const next = rules.apply(s, 2, { t: "play", card: BOARD[4], cell: 4 });
    expect(next.chips[4]).toBe(0);
    expect(rules.winner(next)).toEqual({
      places: [
        [0, 2],
        [1, 3],
      ],
    });
  });

  it("ends when the board is full: the most lines, then the longest row, come first", () => {
    // Two players, columns of each colour, and one line (of the two needed) for seat 1.
    const s = table(2, []);
    expect(rules.winner(s)).toBeNull();
    for (let i = 0; i < 100; i++) if (BOARD[i] !== -1) s.chips[i] = i % 2;
    s.lines = [{ colour: 1, cells: [1, 11, 21, 31, 41] }];
    expect(rules.winner(s)).toEqual({ places: [[1], [0]] });
    expect(rules.legalMoves(s, 0)).toEqual([]);
  });

  it("takes the winning square, and blocks another player's four on hard", () => {
    const card = BOARD[4] as number;
    const win = table(3, [card, BOARD[50] as number], { 1: 0, 2: 0, 3: 0 });
    expect(rules.ai(win, 0, "easy")).toEqual({ t: "play", card, cell: 4 });
    const block = table(3, [card, BOARD[50] as number], { 1: 1, 2: 1, 3: 1 });
    expect(rules.ai(block, 0, "hard")).toEqual({ t: "play", card, cell: 4 });
  });
});
