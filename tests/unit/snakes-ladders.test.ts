// Snakes and Ladders' own rules (change 0008): the pick of a roll, ladders, snakes and the exact
// finish. The shared tests in games.test.ts play it to the end.
import { describe, expect, it } from "vitest";
import game, { JUMPS, land } from "../../site/games/snakes-ladders/rules.js";

type Move = { t: string; n?: number };
type State = { turn: number; pos: number[]; dice: number[] | null; note: string | null };
const rules = game as unknown as {
  init(seats: number, seed: number): State;
  legalMoves(s: State, seat: number): Move[];
  apply(s: State, seat: number, m: Move): State;
  winner(s: State): { places: number[][] } | null;
  ai(s: State, seat: number, level: string): Move;
};

/** Seat 0 to pick from `dice`, on square `from`. */
function rolled(dice: number[], from: number, seats = 2) {
  const s = rules.init(seats, 1);
  s.pos[0] = from;
  s.dice = dice;
  return s;
}

describe("Snakes and Ladders", () => {
  it("has a layout where no jump ends on another's start, nor on 100", () => {
    const starts = Object.keys(JUMPS).map(Number);
    for (const [from, to] of Object.entries(JUMPS)) {
      expect(starts).not.toContain(to);
      expect(to).not.toBe(Number(from));
      expect([from, to].map(Number).every((p) => p > 1 && p < 100)).toBe(true);
    }
  });

  it("offers each die and both added, once each (AC13.1)", () => {
    expect(rules.legalMoves(rolled([2, 5], 10), 0)).toEqual([
      { t: "move", n: 2 },
      { t: "move", n: 5 },
      { t: "move", n: 7 },
    ]);
    expect(rules.legalMoves(rolled([3, 3], 10), 0)).toEqual([
      { t: "move", n: 3 },
      { t: "move", n: 6 },
    ]);
  });

  it("takes a token up a ladder and down a snake, and says so (AC13.2)", () => {
    const up = rules.apply(rolled([4, 6], 0), 0, { t: "move", n: 4 });
    expect(up.pos[0]).toBe(JUMPS[4]);
    expect(up.note).toBe("@0 climbed a ladder from 4 to 25");
    expect(up.turn).toBe(1);
    const down = rules.apply(rolled([2, 5], 25), 0, { t: "move", n: 2 });
    expect(down.pos[0]).toBe(5);
    expect(down.note).toBe("@0 slid down a snake from 27 to 5");
  });

  it("needs an exact count for 100: a roll with no fit passes the turn (AC13.3)", () => {
    expect(rules.legalMoves(rolled([2, 5], 95), 0)).toEqual([
      { t: "move", n: 2 },
      { t: "move", n: 5 },
    ]);
    // From 99 only a die of 1 fits.
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = rules.init(2, seed);
      s.pos[0] = 99;
      const next = rules.apply(s, 0, { t: "roll" });
      if (next.turn === 0) {
        expect(rules.legalMoves(next, 0)).toEqual([{ t: "move", n: 1 }]);
        seen.add("fits");
      } else {
        expect(next.pos[0]).toBe(99);
        expect(next.dice).toBeNull();
        expect(next.note).toMatch(/^@0 rolled \d and \d, too far for 100$/);
        seen.add("passes");
      }
    }
    expect(seen.size).toBe(2);
  });

  it("ends when a token reaches 100, with the others placed by their square", () => {
    const s = rolled([1, 4], 96, 3);
    s.pos[1] = 30;
    s.pos[2] = 60;
    const end = rules.apply(s, 0, { t: "move", n: 4 });
    expect(end.note).toBe("@0 reached 100");
    expect(rules.winner(end)).toEqual({ places: [[0], [2], [1]] });
    expect(rules.legalMoves(end, 1)).toEqual([]);
  });

  it("has a CPU that climbs ladders and misses snakes", () => {
    // From 0 with 4 and 6: 4 is a ladder to 25, 10 is plain.
    expect(rules.ai(rolled([4, 6], 0), 0, "normal")).toEqual({ t: "move", n: 4 });
    // From 23 with 4 and 6: 27 is a snake to 5, 29 is plain, and 33 is a ladder to 49.
    expect(land(23, 4)).toBe(5);
    for (const level of ["normal", "hard"])
      expect(rules.ai(rolled([4, 6], 23), 0, level)).toEqual({ t: "move", n: 10 });
    // Hard takes a win when it has one.
    expect(rules.ai(rolled([1, 3], 96), 0, "hard")).toEqual({ t: "move", n: 4 });
  });
});
