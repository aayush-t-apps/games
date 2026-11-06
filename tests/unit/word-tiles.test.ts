// Word Tiles' own rules (change 0009): the board and the tiles, a play's words and points, swaps,
// the end, the word list and the CPU. The shared tests in games.test.ts play it to the end.
import { describe, expect, it } from "vitest";
import game, {
  CENTRE,
  findPlays,
  isWord,
  judge,
  N,
  PREMIUM,
  playOf,
} from "../../site/games/word-tiles/rules.js";

type Move = { t: string; tiles?: string };
type State = {
  turn: number;
  moves: number;
  board: string;
  racks: string[];
  bag: string;
  scores: number[];
  scoreless: number;
  over: boolean;
  note: string | null;
};
const rules = game as unknown as {
  init(seats: number, seed: number): State;
  legalMoves(s: State, seat: number): Move[];
  apply(s: State, seat: number, m: Move): State;
  winner(s: State): { places: number[][] } | null;
  ai(s: State, seat: number, level: string): Move;
};
type Tiles = [number, string][];

/** A board with words on it: [first square, step (1 across, N down), letters]. */
function boardWith(...words: [number, number, string][]) {
  const b = Array(N * N).fill(".");
  for (const [at, step, w] of words)
    [...w].forEach((ch, k) => {
      b[at + k * step] = ch;
    });
  return b.join("");
}
const EMPTY = boardWith();
// CAT across the centre: row 8, columns 7 to 9.
const CAT = boardWith([CENTRE - 1, 1, "CAT"]);

/** Seat 0 to move, with this rack and board. */
function position(rack: string, board = EMPTY, seats = 2) {
  const s = rules.init(seats, 1);
  s.racks[0] = rack;
  s.board = board;
  return s;
}

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

describe("Word Tiles", () => {
  it("has the classic premium squares, the same from every side", () => {
    const count = (ch: string) => [...PREMIUM].filter((p) => p === ch).length;
    expect([count("T"), count("D"), count("t"), count("d")]).toEqual([8, 17, 12, 24]);
    expect(PREMIUM[CENTRE]).toBe("D");
    for (let i = 0; i < N * N; i++) {
      const [r, c] = [Math.floor(i / N), i % N];
      expect(PREMIUM[N * N - 1 - i]).toBe(PREMIUM[i]);
      expect(PREMIUM[c * N + r]).toBe(PREMIUM[i]);
    }
  });

  it("deals 100 tiles: seven on each rack, the rest in the bag", () => {
    const s = rules.init(4, 1);
    expect(s.racks.map((r) => r.length)).toEqual([7, 7, 7, 7]);
    const all = [...s.racks.join(""), ...s.bag];
    expect(all).toHaveLength(100);
    expect(all.filter((ch) => ch === "E")).toHaveLength(12);
    expect(all.filter((ch) => ch === "?")).toHaveLength(2);
  });

  it("scores a word's letters, with the premiums under the new tiles only (AC14.2)", () => {
    // The centre is a 2W: (3 + 1 + 1) × 2.
    expect(
      judge(EMPTY, [
        [CENTRE - 1, "C"],
        [CENTRE, "A"],
        [CENTRE + 1, "T"],
      ]),
    ).toEqual({ words: ["CAT"], score: 10 });
    // The centre's 2W is used: CATS is 6.
    expect(judge(CAT, [[CENTRE + 2, "S"]])).toEqual({ words: ["CATS"], score: 6 });
    // TO under AT makes three words: TO (O on a 2L), AT and TO down.
    expect(
      judge(CAT, [
        [CENTRE + N, "T"],
        [CENTRE + N + 1, "O"],
      ]),
    ).toEqual({ words: ["TO", "AT", "TO"], score: 8 });
    // A blank is worth 0.
    expect(
      judge(EMPTY, [
        [CENTRE - 1, "C"],
        [CENTRE, "a"],
        [CENTRE + 1, "T"],
      ]),
    ).toEqual({ words: ["CAT"], score: 8 });
  });

  it("adds 50 for all seven tiles at once (AC14.2)", () => {
    const tiles = [..."RETAINS"].map((ch, k) => [CENTRE - 3 + k, ch]) as Tiles;
    expect(judge(EMPTY, tiles)).toEqual({ words: ["RETAINS"], score: 7 * 2 + 50 });
  });

  it("refuses a play that breaks a rule, and says why (AC14.1)", () => {
    const cases: [string, Tiles, string][] = [
      [EMPTY, [], "Put tiles on the board first."],
      [
        EMPTY,
        [
          [0, "A"],
          [1, "T"],
        ],
        "The first word must cover the centre star.",
      ],
      [EMPTY, [[CENTRE, "A"]], "A word needs two letters or more."],
      [
        EMPTY,
        [
          [CENTRE, "A"],
          [CENTRE + N + 1, "T"],
        ],
        "Put your tiles in one line, across or down.",
      ],
      [
        EMPTY,
        [
          [CENTRE, "A"],
          [CENTRE + 2, "T"],
        ],
        "Leave no gaps between your tiles.",
      ],
      [CAT, [[CENTRE, "O"]], "Put each tile on an empty square."],
      [
        CAT,
        [
          [0, "A"],
          [1, "T"],
        ],
        "Join your word to the tiles on the board.",
      ],
      [
        EMPTY,
        [
          [CENTRE, "X"],
          [CENTRE + 1, "Q"],
        ],
        "XQ isn't in the word list.",
      ],
    ];
    for (const [board, tiles, why] of cases) expect(judge(board, tiles).error).toBe(why);
  });

  it("knows common words in American and British spelling, and the short ones", () => {
    for (const w of [
      "cat",
      "colour",
      "color",
      "something",
      "replaying",
      "fjord",
      "aa",
      "qi",
      "za",
      "xu",
    ])
      expect(isWord(w), w).toBe(true);
    for (const w of ["zzzz", "xq", "catt", "a"]) expect(isWord(w), w).toBe(false);
  });

  it("plays tiles from the rack, scores them and draws back to seven (AC14.1)", () => {
    const s = position("?ACQSTZ");
    const next = rules.apply(
      s,
      0,
      playOf([
        [CENTRE - 1, "C"],
        [CENTRE, "a"],
        [CENTRE + 1, "T"],
      ]),
    );
    expect(next.board.slice(CENTRE - 1, CENTRE + 2)).toBe("CaT");
    expect(next.scores[0]).toBe(8);
    expect(next.racks[0]).toHaveLength(7);
    expect(next.bag).toHaveLength(s.bag.length - 3);
    expect(next.note).toBe("@0 played CAT for 8");
    expect(next.turn).toBe(1);
    // Only tiles on the rack, and a blank only from a "?".
    expect(
      reason(() =>
        rules.apply(
          s,
          0,
          playOf([
            [CENTRE, "B"],
            [CENTRE + 1, "E"],
          ]),
        ),
      ),
    ).toBe("Play only tiles from your rack.");
    expect(
      reason(() =>
        rules.apply(
          position("ACQSTZE"),
          0,
          playOf([
            [CENTRE, "a"],
            [CENTRE + 1, "T"],
          ]),
        ),
      ),
    ).toBe("Play only tiles from your rack.");
    expect(reason(() => rules.apply(s, 0, { t: "play", tiles: "999A" }))).toBe(
      "Play a word, swap tiles or pass.",
    );
    expect(reason(() => rules.apply(s, 1, { t: "pass" }))).toBe("It isn't your turn.");
  });

  it("takes any play that follows the rules, not only those the CPU lists", () => {
    const s = position("ACEINST");
    const move = playOf([
      [CENTRE, "A"],
      [CENTRE + 1, "T"],
    ]);
    expect(rules.legalMoves(s, 0)).not.toContainEqual(move);
    expect(rules.apply(s, 0, move).scores[0]).toBe(4);
  });

  it("swaps tiles back into the bag while it holds seven or more (AC14.3)", () => {
    const s = position("AEQRSTZ");
    const next = rules.apply(s, 0, { t: "swap", tiles: "QZ" });
    expect(next.racks[0]).toHaveLength(7);
    for (const ch of "AERST") expect(next.racks[0]).toContain(ch);
    expect(next.bag).toHaveLength(s.bag.length);
    expect(next.note).toBe("@0 swapped 2 tiles");
    expect(reason(() => rules.apply(s, 0, { t: "swap", tiles: "B" }))).toBe(
      "Swap tiles from your rack.",
    );
    expect(reason(() => rules.apply(s, 0, { t: "swap", tiles: "" }))).toBe(
      "Pick the tiles to swap.",
    );
    const low = { ...s, bag: "ABC" };
    expect(rules.legalMoves(low, 0)).not.toContainEqual(expect.objectContaining({ t: "swap" }));
    expect(reason(() => rules.apply(low, 0, { t: "swap", tiles: "Q" }))).toBe(
      "You can swap only while the bag holds 7 tiles or more.",
    );
  });

  it("ends when a player goes out with the bag empty: they gain the others' tiles (AC14.4)", () => {
    const s = position("AT");
    s.bag = "";
    s.racks[1] = "QZ";
    const end = rules.apply(
      s,
      0,
      playOf([
        [CENTRE, "A"],
        [CENTRE + 1, "T"],
      ]),
    );
    expect(end.over).toBe(true);
    expect(end.scores).toEqual([4 + 20, -20]);
    expect(end.note).toBe("@0 played AT for 4, and went out");
    expect(rules.winner(end)).toEqual({ places: [[0], [1]] });
    expect(rules.legalMoves(end, 0)).toEqual([]);
    expect(reason(() => rules.apply(end, 0, { t: "pass" }))).toBe("The match is over.");
  });

  it("ends when every player passed or swapped twice in a row: each loses their tiles' worth (AC14.4)", () => {
    let s = position("AEIOU?Q");
    s.racks[1] = "Z";
    for (let n = 0; n < 4; n++) {
      expect(rules.winner(s)).toBeNull();
      s = rules.apply(s, s.turn, { t: "pass" });
    }
    expect(s.over).toBe(true);
    expect(s.scores).toEqual([-15, -10]);
    expect(s.note).toBe("@1 passed, and the match ends");
  });

  it("finds only plays the rules take, at the points they score", () => {
    let s = rules.init(3, 7);
    for (let n = 0; n < 12 && !rules.winner(s); n++) {
      const { plays, best } = findPlays(s.board, s.racks[s.turn]);
      for (const p of [...plays, ...(best ? [best] : [])])
        expect(judge(s.board, p.tiles)).toEqual({ words: expect.any(Array), score: p.score });
      s = rules.apply(s, s.turn, rules.ai(s, s.turn, "hard"));
    }
    // The best opening for these letters is a seven-letter word over a 2L: 66.
    expect(findPlays(EMPTY, "AEINRST").plays[0]?.score).toBe(66);
  });

  it("lists a spread of plays, a swap and a pass; the CPU picks among them by level", () => {
    const s = position("AEINRST");
    const legal = rules.legalMoves(s, 0);
    expect(legal.length).toBeLessThanOrEqual(15);
    expect(legal.slice(-2)).toEqual([{ t: "swap", tiles: "AEINRST" }, { t: "pass" }]);
    expect(rules.ai(s, 0, "normal")).toEqual(legal[0]);
    for (const level of ["easy", "normal", "hard", "best"])
      expect(legal).toContainEqual(rules.ai(s, 0, level));
    // No word fits: swap, or pass when the bag is low.
    const stuck = position("QQQQQQQ", CAT);
    expect(rules.ai(stuck, 0, "hard")).toEqual({ t: "swap", tiles: "QQQQQQQ" });
    expect(rules.ai({ ...stuck, bag: "" }, 0, "hard")).toEqual({ t: "pass" });
  });

  it("plays better by level: normal beats easy, hard beats normal more often than not", () => {
    const match = (levels: string[], seed: number) => {
      let s = rules.init(2, seed);
      while (!rules.winner(s))
        s = rules.apply(s, s.turn, rules.ai(s, s.turn, levels[s.turn] as string));
      return s.scores as [number, number];
    };
    let normal = 0;
    let hard = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const [a, b] = match(seed % 2 ? ["easy", "normal"] : ["normal", "easy"], seed);
      if ((seed % 2 ? b - a : a - b) > 0) normal++;
      const [c, d] = match(seed % 2 ? ["normal", "hard"] : ["hard", "normal"], seed);
      if ((seed % 2 ? d - c : c - d) > 0) hard++;
    }
    expect(normal).toBeGreaterThanOrEqual(9);
    expect(hard).toBeGreaterThanOrEqual(5);
  });
});
