// Word Guess's own rules (change 0009): the marks, the topics, the guesses it takes, the hint and
// the end. The shared tests in games.test.ts solve every topic with the hint.
import { describe, expect, it } from "vitest";
import game, { isGuess, marks, TOPICS } from "../../site/games/word-guess/rules.js";

type Move = { t: string; word?: string; i?: number };
type State = {
  word: string;
  guesses: string[];
  marks: string[];
  shown: number[];
  note: string | null;
  moves: number;
};
const rules = game as unknown as {
  init(seats: number, seed: number, pick?: string): State;
  view(s: State, seat: number | null): Record<string, unknown>;
  legalMoves(s: State, seat: number): Move[];
  apply(s: State, seat: number, m: Move): State;
  winner(s: State): { places: number[][] } | null;
  ai(s: State, seat: number, level: string): Move;
};

/** A match whose word is `word`. */
function withWord(word: string) {
  const s = rules.init(1, 1, "animals");
  s.word = word;
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

describe("Word Guess", () => {
  it("marks green, then yellow from the letters left, never a letter more times than it is there", () => {
    expect(marks("crane", "crane")).toBe("ggggg");
    expect(marks("nacre", "crane")).toBe("yyyyg");
    expect(marks("plumb", "crane")).toBe("-----");
    // Two Es in the guess, one in the word: only one is marked.
    expect(marks("geese", "crane")).toBe("----g");
    expect(marks("eerie", "crane")).toBe("--y-g");
    expect(marks("speed", "abide")).toBe("--y-y");
  });

  it("has topics of five-letter words, each a guess it takes", () => {
    expect(Object.keys(TOPICS)).toEqual(["places", "animals", "food", "nature", "home", "sports"]);
    for (const [topic, list] of Object.entries(TOPICS)) {
      const words = list.split(" ");
      expect(words.length, topic).toBeGreaterThanOrEqual(30);
      expect(new Set(words).size, topic).toBe(words.length);
      for (const w of words) {
        expect(w, topic).toMatch(/^[a-z]{5}$/);
        expect(isGuess(w), w).toBe(true);
      }
    }
    for (const w of ["crane", "slate", "adieu", "fjord", "delhi"]) expect(isGuess(w), w).toBe(true);
    expect(isGuess("xqzzy")).toBe(false);
  });

  it("picks the word from the topic, and the same word for the same seed (today's word)", () => {
    for (let seed = 1; seed < 20; seed++)
      expect(TOPICS.places.split(" ")).toContain(rules.init(1, seed, "places").word);
    expect(rules.init(1, 20261106, "today").word).toBe(rules.init(1, 20261106, "today").word);
  });

  it("takes a guess, marks it, and ends when the word is found", () => {
    let s = withWord("tiger");
    s = rules.apply(s, 0, { t: "guess", word: "TRAIN" });
    expect(s.marks).toEqual(["gy-y-"]);
    expect(s.note).toBe("@0 tried TRAIN");
    expect(rules.winner(s)).toBeNull();
    s = rules.apply(s, 0, { t: "guess", word: "tiger" });
    expect(s.note).toBe("@0 found TIGER in 2 guesses");
    expect(rules.winner(s)).toEqual({ places: [[0]] });
    expect(rules.legalMoves(s, 0)).toEqual([]);
    expect(reason(() => rules.apply(s, 0, { t: "guess", word: "zebra" }))).toBe(
      "You found the word.",
    );
  });

  it("refuses a guess that isn't a word of the list, or was tried, and says why", () => {
    const s = rules.apply(withWord("tiger"), 0, { t: "guess", word: "train" });
    expect(reason(() => rules.apply(s, 0, { t: "guess", word: "trai" }))).toBe(
      "Type a word of five letters.",
    );
    expect(reason(() => rules.apply(s, 0, { t: "guess", word: "xqzzy" }))).toBe(
      "XQZZY isn't in the word list.",
    );
    expect(reason(() => rules.apply(s, 0, { t: "guess", word: "train" }))).toBe(
      "You tried TRAIN already.",
    );
  });

  it("hints one right letter in its square, then the word once every square is known", () => {
    let s = rules.apply(withWord("tiger"), 0, { t: "guess", word: "train" });
    // T is green: the first unknown square is the second.
    expect(rules.ai(s, 0, "best")).toEqual({ t: "show", i: 1 });
    s = rules.apply(s, 0, { t: "show", i: 1 });
    expect(s.note).toBe("@0 took a hint: letter 2 is I");
    expect(rules.view(s, 0).shown).toEqual([[1, "i"]]);
    expect(reason(() => rules.apply(s, 0, { t: "show", i: 1 }))).toBe(
      "That letter is known already.",
    );
    for (const i of [2, 3, 4]) s = rules.apply(s, 0, { t: "show", i });
    expect(rules.legalMoves(s, 0)).toEqual([{ t: "guess", word: "tiger" }]);
  });

  it("keeps the word out of the view until it is found", () => {
    const s = withWord("tiger");
    expect(JSON.stringify(rules.view(s, 0))).not.toContain("tiger");
  });

  it("ends a match that runs too long by putting the word in", () => {
    let s = withWord("tiger");
    s.moves = 59;
    s = rules.apply(s, 0, { t: "guess", word: "train" });
    expect(s.guesses.at(-1)).toBe("tiger");
    expect(s.note).toBe("The word was TIGER");
    expect(rules.winner(s)).toEqual({ places: [[0]] });
  });
});
