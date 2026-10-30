import { describe, expect, it } from "vitest";
import {
  ahead,
  check,
  copy,
  grid,
  lines,
  nextSeat,
  placesBy,
  sameMove,
} from "../../site/lib/board.js";
import {
  card,
  deal,
  draw,
  label,
  newDeck,
  rank,
  refill,
  sortHand,
  spoken,
  suit,
} from "../../site/lib/deck.js";
import { fork, int, next, pick, seedOf, shuffle } from "../../site/lib/rng.js";

describe("rng", () => {
  it("gives the same numbers for the same seed", () => {
    const a = { rng: seedOf(42) };
    const b = { rng: seedOf(42) };
    const seqA = Array.from({ length: 5 }, () => next(a));
    expect(Array.from({ length: 5 }, () => next(b))).toEqual(seqA);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seedOf("x")).not.toBe(seedOf("y"));
  });

  it("picks, shuffles and makes whole numbers in range", () => {
    const h = { rng: 7 };
    for (let i = 0; i < 100; i++) expect(int(h, 6)).toBeLessThan(6);
    expect(["a", "b"]).toContain(pick(h, ["a", "b"]));
    const list = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(h, list);
    expect(out.slice().sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("forks a generator without changing the state", () => {
    const state = { rng: 99, moves: 3 };
    const f = fork(state, "cpu1");
    next(f);
    expect(state.rng).toBe(99);
    expect(fork(state, "cpu1").rng).toBe(fork({ rng: 99, moves: 3 }, "cpu1").rng);
    expect(fork(state, "cpu2").rng).not.toBe(fork(state, "cpu1").rng);
  });
});

describe("deck", () => {
  it("has 52 different cards with ranks and suits", () => {
    const deck = newDeck({ rng: 1 });
    expect(new Set(deck).size).toBe(52);
    expect(rank(card(12, "H"))).toBe(12);
    expect(suit(card(12, "H"))).toBe("H");
    expect(label(card(1, "S"))).toBe("A♠");
    expect(label(card(10, "D"))).toBe("10♦");
    expect(label(card(11, "C"))).toBe("J♣");
    expect(label(card(13, "H"))).toBe("K♥");
    expect(spoken(card(12, "H"))).toBe("queen of hearts");
  });

  it("deals, draws and refills the stock from the discard pile", () => {
    const stock = newDeck({ rng: 2 });
    const hands = deal(stock, 3, 5);
    expect(hands.map((h) => h.length)).toEqual([5, 5, 5]);
    expect(stock.length).toBe(37);
    const hand: number[] = [];
    expect(draw(stock, hand)).toBe(true);
    expect(hand.length).toBe(1);
    const empty: number[] = [];
    expect(draw(empty, hand)).toBe(false);
    const discard = [1, 2, 3, 4];
    expect(refill({ rng: 3 }, empty, discard)).toBe(true);
    expect(discard).toEqual([4]);
    expect(empty.slice().sort()).toEqual([1, 2, 3]);
    expect(refill({ rng: 3 }, empty, discard)).toBe(false);
    expect(sortHand([40, 3, 20])).toEqual([3, 20, 40]);
  });
});

describe("board", () => {
  it("makes grids and every line of four in a 7 × 6 grid", () => {
    expect(grid(3, 2, 0)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(lines(7, 6, 4).length).toBe(69);
  });

  it("moves along a loop and to the next seat", () => {
    expect(ahead(50, 4, 52)).toBe(2);
    expect(nextSeat(3, 4)).toBe(0);
  });

  it("compares moves and refuses one that isn't legal, with the reason", () => {
    expect(sameMove({ t: "a", c: 1 }, { t: "a", c: 1 })).toBe(true);
    expect(sameMove({ t: "a", c: 1 }, { t: "a" })).toBe(false);
    expect(() => check([{ t: "a" }], { t: "b" }, "Not now.")).toThrow("Not now.");
    expect(() => check([{ t: "a" }], null, "Not now.")).toThrow("Not now.");
    expect(() => check([{ t: "a" }], { t: "a" }, "Not now.")).not.toThrow();
  });

  it("ranks scores into places, ties sharing one", () => {
    expect(placesBy([2, 5, 2])).toEqual([[1], [0, 2]]);
    expect(placesBy([3, 1], false)).toEqual([[1], [0]]);
    const s = { a: [1] };
    const c = copy(s);
    c.a.push(2);
    expect(s.a).toEqual([1]);
  });
});
