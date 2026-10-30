// The shared tests every game passes (AC1.1, AC1.3, AC1.4, AC1.5): a game is a folder in
// site/games/ with rules.js and view.js, and a line in site/games/index.json.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import crazyEights from "../../site/games/crazy-eights/rules.js";
import fourInARow from "../../site/games/four-in-a-row/rules.js";
import goFish from "../../site/games/go-fish/rules.js";
import ludo from "../../site/games/ludo/rules.js";
import memory from "../../site/games/memory/rules.js";
import quizRace from "../../site/games/quiz-race/rules.js";

type Move = Record<string, unknown>;
type State = Record<string, unknown> & { turn: number };
type Rules = {
  id: string;
  name: string;
  version: number;
  players: { min: number; max: number };
  hidden: boolean;
  init(seats: number, seed: number): State;
  view(state: State, seat: number | null): Record<string, unknown>;
  legalMoves(state: State, seat: number): Move[];
  apply(state: State, seat: number, move: Move): State;
  winner(state: State): { places: number[][] } | null;
  ai(state: State, seat: number, level: string): Move;
};

const GAMES = [crazyEights, goFish, memory, ludo, fourInARow, quizRace] as Rules[];
const LEVELS = ["easy", "normal", "hard"];
const SEEDS = 200;
const DIR = "site/games";
const same = (a: Move, b: Move) => JSON.stringify(a) === JSON.stringify(b);

/** Play a whole match CPU against CPU; check every move on the way. */
function play(game: Rules, seed: number) {
  const span = game.players.max - game.players.min + 1;
  const seats = game.players.min + (seed % span);
  const levels = Array.from({ length: seats }, (_, i) => LEVELS[(seed + i) % 3] as string);
  let state = game.init(seats, seed);
  const moves: Move[] = [];
  for (let n = 0; n < 5000 && !game.winner(state); n++) {
    const seat = state.turn;
    const fail = (why: string) => {
      throw new Error(`${game.id} seed ${seed} move ${n}: ${why}`);
    };
    if (game.legalMoves(state, (seat + 1) % seats).length && seats > 1)
      fail("a seat that isn't to move has legal moves");
    const legal = game.legalMoves(state, seat);
    const move = game.ai(state, seat, levels[seat] as string);
    if (!legal.some((m) => same(m, move))) fail(`${JSON.stringify(move)} isn't legal`);
    moves.push(move);
    if (n % 50 === 0) {
      const old = state;
      const before = JSON.stringify(old);
      state = game.apply(old, seat, move);
      if (JSON.stringify(old) !== before) fail("apply changed the state it was given");
      if (JSON.stringify(state) === before) fail("apply changed nothing");
    } else state = game.apply(state, seat, move);
  }
  return { state, moves, seats, result: game.winner(state) };
}

describe.each(GAMES.map((g) => [g.id, g] as const))("%s", (_id, game) => {
  it(`plays ${SEEDS} matches CPU against CPU with legal moves to a winner or a draw (AC1.3)`, {
    timeout: 60_000,
  }, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { result, seats } = play(game, seed);
      expect(result, `seed ${seed} ends`).not.toBeNull();
      const placed = (result?.places ?? []).flat().sort();
      expect(placed).toEqual(Array.from({ length: seats }, (_, i) => i));
    }
  });

  it("gives the same match for the same seed (AC1.3)", () => {
    for (const seed of [3, 17, 101]) {
      const a = play(game, seed);
      const b = play(game, seed);
      expect(b.moves).toEqual(a.moves);
      expect(b.result).toEqual(a.result);
    }
  });

  it("chooses a move on hard within 100 ms (AC1.4)", () => {
    let slowest = 0;
    for (const seed of [5, 6, 7]) {
      let state = game.init(game.players.max, seed);
      for (let n = 0; n < 60 && !game.winner(state); n++) {
        const started = performance.now();
        const move = game.ai(state, state.turn, "hard");
        slowest = Math.max(slowest, performance.now() - started);
        state = game.apply(state, state.turn, move);
      }
    }
    expect(slowest).toBeLessThan(100);
  });

  it("refuses an illegal move with a one-line reason and keeps the state (AC1.5)", () => {
    const state = game.init(game.players.min, 9);
    const before = JSON.stringify(state);
    let reason = "";
    try {
      game.apply(state, state.turn, { t: "cheat" });
    } catch (error) {
      reason = (error as Error).message;
    }
    expect(reason).toMatch(/^[A-Z][^\n]+\.$/);
    const someMove = game.legalMoves(state, 0)[0] ?? {};
    expect(() => game.apply(state, (state.turn + 1) % 2, someMove)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("shows a seat only what it may see", () => {
    const state = game.init(game.players.max, 11);
    const views = Array.from({ length: game.players.max }, (_, seat) =>
      JSON.stringify(game.view(state, seat)),
    );
    if (game.hidden) expect(new Set(views).size).toBe(views.length);
    else expect(new Set(views).size).toBe(1);
    expect(JSON.stringify(game.view(state, 0))).not.toContain('"answer"');
  });

  it("shows no seat's hidden cards in the public view (AC6.2, AC9.1)", () => {
    const state = game.init(game.players.max, 11);
    const pub = game.view(state, null);
    if (game.hidden) expect(pub.hand).toEqual([]);
    else expect(pub).toEqual(game.view(state, 0));
  });

  it("fits an online room's state message: every view and the snapshot within 32 KB", () => {
    let largest = 0;
    for (let seed = 0; seed < 10; seed++) {
      const seats = game.players.max;
      let state = game.init(seats, seed);
      for (let n = 0; n < 2000 && !game.winner(state); n++) {
        const views = Array.from({ length: seats }, (_, s) => game.view(state, s));
        const size = JSON.stringify({
          views,
          public: game.view(state, null),
          snapshot: { state },
        }).length;
        largest = Math.max(largest, size);
        state = game.apply(state, state.turn, game.ai(state, state.turn, "easy"));
      }
    }
    expect(largest).toBeLessThan(32 * 1024);
  });
});

describe("the game list (AC1.1)", () => {
  const list = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")) as {
    id: string;
    name: string;
    type: string;
    players: [number, number];
    cpu: boolean;
    ages: string;
    teaching: boolean;
    version: number;
    kb: number;
    about: string;
    how: string[];
  }[];
  const folders = readdirSync(DIR).filter((f) => statSync(join(DIR, f)).isDirectory());

  it("lists the six games in order, one entry per folder", () => {
    expect(list.map((g) => g.name)).toEqual([
      "Crazy Eights",
      "Go Fish",
      "Memory",
      "Ludo",
      "Four in a Row",
      "Quiz Race",
    ]);
    expect(list.map((g) => g.id).sort()).toEqual(folders.sort());
  });

  it("matches each game's rules and has its type, players and ages", () => {
    for (const entry of list) {
      const rules = GAMES.find((g) => g.id === entry.id);
      expect(rules?.name).toBe(entry.name);
      expect(rules?.version).toBe(entry.version);
      expect(entry.players).toEqual([rules?.players.min, rules?.players.max]);
      expect(["cards", "board", "kids"]).toContain(entry.type);
      expect(entry.ages).toMatch(/^\d+\+$/);
      expect(entry.cpu).toBe(true);
      expect(entry.about.length).toBeGreaterThan(10);
    }
  });

  it("has a short how-to-play card for each game: 2 to 4 steps", () => {
    for (const entry of list) {
      expect(entry.how.length, entry.id).toBeGreaterThanOrEqual(2);
      expect(entry.how.length, entry.id).toBeLessThanOrEqual(4);
      for (const step of entry.how) expect(step.length, entry.id).toBeLessThanOrEqual(100);
    }
  });

  it("keeps each folder to rules.js and view.js, with its size in kb", () => {
    for (const entry of list) {
      const files = readdirSync(join(DIR, entry.id)).sort();
      expect(files).toEqual(["rules.js", "view.js"]);
      const bytes = files.reduce((n, f) => n + statSync(join(DIR, entry.id, f)).size, 0);
      expect(entry.kb, `${entry.id} kb`).toBe(Math.ceil(bytes / 1024));
    }
  });
});

describe("the import rule", () => {
  const read = (path: string): string[] =>
    readdirSync(path).flatMap((f) => {
      const p = join(path, f);
      return statSync(p).isDirectory() ? read(p) : [p];
    });

  it("lets rules.js import only rng, deck and board, and touch no page or network", () => {
    for (const file of read(DIR).filter((f) => f.endsWith("rules.js"))) {
      const text = readFileSync(file, "utf8");
      const imports = [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      const allowed = /^\.\.\/\.\.\/lib\/(rng|deck|board)\.js$/;
      for (const path of imports) expect(path, file).toMatch(allowed);
      expect(text, file).not.toMatch(/\b(document|window|fetch|localStorage|Math\.random|Date)\b/);
    }
  });

  it("lets only store.js touch localStorage", () => {
    const users = read("site")
      .filter((f) => f.endsWith(".js"))
      .filter((f) => readFileSync(f, "utf8").includes("localStorage"));
    expect(users).toEqual([join("site", "lib", "store.js")]);
  });
});
