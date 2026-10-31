import { describe, expect, it, vi } from "vitest";
import { check, copy } from "../../site/lib/board.js";
import { CRASH, createEngine, IDLE_MS, PROTOCOL } from "../../site/lib/engine.js";
import { createLocal } from "../../site/lib/net/local.js";

type Move = { t: "add"; n: number };
type State = { total: number; turn: number; seats: number; rng: number; note?: string };

// A tiny game for the engine: seats take turns adding 1 or 2; whoever makes 5 wins.
const race = {
  id: "race",
  init: (seats: number, seed: number): State => ({ total: 0, turn: 0, seats, rng: seed }),
  view: (s: State) => ({ total: s.total }),
  legalMoves: (s: State, seat: number): Move[] =>
    seat !== s.turn
      ? []
      : [1, 2].filter((n) => s.total + n <= 5).map((n) => ({ t: "add" as const, n })),
  apply(s: State, seat: number, move: Move): State {
    check(race.legalMoves(s, seat), move, "Add 1 or 2, up to 5.");
    const next = copy(s);
    next.total += move.n;
    next.note = `@${seat} added ${move.n}`;
    if (next.total < 5) next.turn = (s.turn + 1) % s.seats;
    return next;
  },
  winner: (s: State) => (s.total === 5 ? { places: [[s.turn], [1 - s.turn]] } : null),
  ai: (s: State, _seat: number, level: string): Move => ({
    t: "add",
    n: level !== "easy" && s.total >= 3 ? 5 - s.total : 1,
  }),
};

type Msg = Record<string, unknown> & { t: string; seat?: number };

function setup(kinds: ("human" | "cpu")[], game: typeof race = race) {
  const seats = kinds.map((kind, i) => ({ name: `P${i}`, kind, level: "normal" }));
  const transport = createLocal(seats);
  const out: Msg[] = [];
  transport.onMessage((m: Msg) => {
    if (!["move", "undo", "hint"].includes(m.t)) out.push(m);
  });
  const timers: (() => void)[] = [];
  const engine = createEngine({
    game,
    seats,
    seed: 1,
    transport,
    schedule: (fn: () => void) => timers.push(fn),
    cancel: () => timers.splice(0),
  });
  const say = (m: Msg) => transport.send({ v: PROTOCOL, ...m });
  const views = (seat: number) => out.filter((m) => m.t === "view" && m.seat === seat);
  const lastOf = (t: string) => out.filter((m) => m.t === t).at(-1);
  const runCpu = () => {
    while (timers.length) timers.shift()?.();
  };
  return { engine, transport, out, say, views, lastOf, runCpu, timers };
}

describe("engine", () => {
  it("sends each seat its view, with legal moves only for the seat to move", () => {
    const { engine, views } = setup(["human", "human"]);
    engine.start();
    expect(views(0).at(-1)).toMatchObject({ v: PROTOCOL, seq: 0, turn: 0, view: { total: 0 } });
    expect(views(0).at(-1)?.legal).toHaveLength(2);
    expect(views(1).at(-1)?.legal).toEqual([]);
  });

  it("starts a puzzle with its pick: a difficulty or a topic (change 0006)", () => {
    const init = vi.fn(race.init);
    const transport = createLocal([{ name: "P0", kind: "human" }]);
    createEngine({
      game: { ...race, init },
      seats: [{ name: "P0", kind: "human" }],
      seed: 7,
      pick: "expert",
      transport,
    });
    expect(init).toHaveBeenCalledWith(1, 7, "expert");
  });

  it("refuses an illegal move with a reason and keeps the state (AC1.5)", () => {
    const { engine, say, lastOf } = setup(["human", "human"]);
    engine.start();
    say({ t: "move", seat: 0, seq: 0, move: { t: "add", n: 3 } });
    expect(lastOf("refused")).toMatchObject({ seat: 0, reason: "Add 1 or 2, up to 5." });
    say({ t: "move", seat: 1, seq: 0, move: { t: "add", n: 1 } });
    expect(lastOf("refused")).toMatchObject({ seat: 1, reason: "It's P0's turn." });
    say({ t: "move", seat: 0, seq: 9, move: { t: "add", n: 1 } });
    expect(lastOf("refused")).toMatchObject({ reason: "The board changed. Try again." });
    expect(engine.state.total).toBe(0);
    expect(engine.seq).toBe(0);
  });

  it("refuses a move for a CPU seat or after the end", () => {
    const { engine, say, lastOf, runCpu } = setup(["human", "cpu"]);
    engine.start();
    say({ t: "move", seat: 1, seq: 0, move: { t: "add", n: 1 } });
    expect(lastOf("refused")).toMatchObject({ reason: "That seat isn't yours." });
    for (let i = 0; i < 5 && !lastOf("end"); i++) {
      say({ t: "move", seat: 0, seq: engine.seq, move: { t: "add", n: 1 } });
      runCpu();
    }
    expect(lastOf("end")).toBeTruthy();
    say({ t: "move", seat: 0, seq: engine.seq, move: { t: "add", n: 1 } });
    expect(lastOf("refused")).toMatchObject({ reason: "The match is over." });
  });

  it("plays CPU seats after the pause and ends with places", () => {
    const { engine, lastOf, runCpu, timers } = setup(["cpu", "cpu"]);
    engine.start();
    expect(timers.length).toBe(1);
    runCpu();
    expect(lastOf("end")).toMatchObject({ places: [[1], [0]] });
    expect(lastOf("view")).toMatchObject({ note: "@1 added 2", places: [[1], [0]] });
  });

  it("takes back the human's last move, with the CPU's after it (AC4.1)", () => {
    const { engine, say, runCpu, lastOf } = setup(["human", "cpu"]);
    engine.start();
    expect(engine.canUndo()).toBe(false);
    say({ t: "undo", seat: 0 });
    expect(lastOf("refused")).toMatchObject({ reason: "There's no move to take back." });
    say({ t: "move", seat: 0, seq: 0, move: { t: "add", n: 1 } });
    runCpu();
    expect(engine.state.total).toBe(2);
    expect(engine.canUndo()).toBe(true);
    const seq = engine.seq;
    say({ t: "undo", seat: 0 });
    expect(engine.state).toMatchObject({ total: 0, turn: 0 });
    expect(engine.seq).toBe(seq + 1);
    expect(engine.canUndo()).toBe(false);
  });

  it("gives a hint: the CPU's best move for that seat (AC4.1)", () => {
    const { engine, say, lastOf } = setup(["human", "human"]);
    engine.start();
    say({ t: "move", seat: 0, seq: 0, move: { t: "add", n: 2 } });
    say({ t: "move", seat: 1, seq: 1, move: { t: "add", n: 1 } });
    say({ t: "hint", seat: 0 });
    expect(lastOf("hinted")).toMatchObject({ seat: 0, move: { t: "add", n: 2 } });
    say({ t: "hint", seat: 1 });
    expect(lastOf("refused")).toMatchObject({ reason: "It isn't your turn." });
  });

  it("stops the match when the rules fail, and stops listening when stopped", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...race, ai: () => ({ t: "add", n: 9 }) as Move };
    const { engine, lastOf, runCpu, say, out } = setup(["cpu", "human"], broken);
    engine.start();
    runCpu();
    expect(lastOf("crash")).toMatchObject({ reason: CRASH });
    const count = out.length;
    say({ t: "move", seat: 1, seq: 0, move: { t: "add", n: 1 } });
    expect(out.length).toBe(count);
    engine.stop();
    err.mockRestore();
  });

  it("stops when a seat to move has no legal move", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const stuck = { ...race, legalMoves: () => [] };
    const { engine, lastOf } = setup(["human", "human"], stuck);
    engine.start();
    expect(lastOf("crash")).toBeTruthy();
    err.mockRestore();
  });

  it("lists its peers through the local transport, and ignores unknown messages", () => {
    const { transport, say, engine, out } = setup(["human", "cpu"]);
    expect(transport.kind).toBe("local");
    expect(transport.peers()).toEqual([
      { seat: 0, name: "P0", kind: "human" },
      { seat: 1, name: "P1", kind: "cpu" },
    ]);
    engine.start();
    const count = out.length;
    say({ t: "chat" });
    expect(out.length).toBe(count + 1);
    engine.stop();
  });

  it("sends the public view after the seats' views each round (AC6.2, AC9.1)", () => {
    const { engine, out, say } = setup(["human", "human"]);
    engine.start();
    say({ t: "move", seat: 0, seq: 0, move: { t: "add", n: 2 } });
    const types = out.map((m) => m.t);
    expect(types).toEqual(["view", "view", "public", "view", "view", "public"]);
    expect(out.at(-1)).toMatchObject({
      seq: 1,
      turn: 1,
      view: { total: 2 },
      legal: [],
      note: "@0 added 2",
    });
  });

  it("goes on from a snapshot on another device, at the same seq (AC6.5)", () => {
    const a = setup(["human", "human"]);
    a.engine.start();
    a.say({ t: "move", seat: 0, seq: 0, move: { t: "add", n: 2 } });
    const snap = JSON.parse(JSON.stringify(a.engine.snapshot()));
    expect(snap).toMatchObject({ seq: 1, state: { total: 2 }, last: { seat: 0 }, places: null });
    const seats = [0, 1].map((i) => ({ name: `P${i}`, kind: "human" as const }));
    const transport = createLocal(seats);
    const out: Msg[] = [];
    transport.onMessage((m: Msg) => out.push(m));
    const b = createEngine({ game: race, seats, seed: 99, transport, from: snap });
    b.start();
    expect(out.find((m) => m.t === "view" && m.seat === 1)).toMatchObject({
      seq: 1,
      view: { total: 2 },
    });
    transport.send({ v: 1, t: "move", seat: 1, seq: 1, move: { t: "add", n: 1 } });
    expect(b.state.total).toBe(3);
    const count = out.length;
    b.resend();
    expect(out.length).toBe(count + 3);
    expect(b.seq).toBe(2);
  });

  it("lets the CPU play for a seat away 60 s on its turn, until it's back (AC6.6)", () => {
    const seats = [0, 1].map((i) => ({ name: `P${i}`, kind: "human" as const, level: "easy" }));
    const transport = createLocal(seats);
    const timers: { fn: () => void; ms: number }[] = [];
    const engine = createEngine({
      game: race,
      seats,
      seed: 1,
      transport,
      delay: 5,
      schedule: (fn: () => void, ms: number) => timers.push({ fn, ms }),
      cancel: () => timers.splice(0),
    });
    const move = (seat: number) =>
      transport.send({ v: 1, t: "move", seat, seq: engine.seq, move: { t: "add", n: 1 } });
    engine.start();
    engine.setAway([1]);
    expect(timers).toEqual([]);
    move(0);
    expect(timers.map((t) => t.ms)).toEqual([IDLE_MS]);
    timers.shift()?.fn();
    expect(engine.state).toMatchObject({ total: 2, turn: 0 });
    move(0);
    // Still away: the CPU plays for it after its usual pause.
    expect(timers.map((t) => t.ms)).toEqual([5]);
    engine.setAway([]);
    expect(timers).toEqual([]);
    // Away on its own turn: the grace starts at once; a move from it means it's back.
    engine.setAway([1]);
    expect(timers.map((t) => t.ms)).toEqual([IDLE_MS]);
    move(1);
    expect(engine.state).toMatchObject({ total: 4, turn: 0 });
    expect(timers).toEqual([]);
    engine.stop();
  });

  it("uses timers by default", () => {
    vi.useFakeTimers();
    const seats = [
      { name: "A", kind: "cpu" as const, level: "easy" },
      { name: "B", kind: "cpu" as const },
    ];
    const transport = createLocal(seats);
    const engine = createEngine({ game: race, seats, seed: 1, transport, delay: 10 });
    engine.start();
    vi.advanceTimersByTime(1000);
    expect(engine.state.total).toBe(5);
    engine.stop();
    vi.useRealTimers();
  });
});
