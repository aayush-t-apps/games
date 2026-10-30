// The room's rules (change 0002: AC5.3, AC6.1, AC6.3, AC6.5, AC7.1): seats, owner controls, moves,
// the host, envelopes, rate and caps, and the match record.
import { describe, expect, it } from "vitest";
import {
  alarmAt,
  allow,
  CAPS,
  checkMove,
  EMPTY_MS,
  envelope,
  join,
  LIFETIME_MS,
  type Meta,
  matchRecord,
  newMeta,
  nextHost,
  ownerOp,
  publicRoom,
  type Snap,
  validPlaces,
} from "../../src/worker/room-logic";

const NOW = 1_800_000_000_000;
const room = (seats = 3, cpu = 0): Meta =>
  newMeta({
    code: "K7M2QX",
    game: "crazy-eights",
    version: 1,
    players: [2, 6],
    seats,
    cpu,
    level: "normal",
    member: "ana@example.com",
    owner: "owner-hash",
    now: NOW,
  });
const hello = (
  nick: string,
  more: Partial<{ seat: string; owner: string; table: boolean }> = {},
) => ({
  nick,
  seat: more.seat ?? null,
  owner: more.owner ?? null,
  table: more.table ?? false,
});
const all = (...seats: number[]) => new Set(seats);

describe("a new room", () => {
  it("has its seats, the last ones CPU, the owner's seat 0 as host, and its end in 6 hours", () => {
    const m = room(4, 2);
    expect(m.seats.map((s) => s.cpu)).toEqual([false, false, true, true]);
    expect(m.host).toBe(0);
    expect(m.expires).toBe(NOW + LIFETIME_MS);
  });

  it("shows no tokens and no member", () => {
    const m = room();
    (m.seats[1] as Meta["seats"][number]).token = "secret";
    const pub = publicRoom(m, all(1), 2);
    expect(JSON.stringify(pub)).not.toMatch(/secret|ana@/);
    expect(pub.seats[1]).toEqual({ nick: "", cpu: false, taken: true, online: true });
    expect(pub.spectators).toBe(2);
  });
});

describe("joining (AC6.1)", () => {
  it("gives the owner seat 0, then each guest the next free seat", () => {
    const m = room(3);
    expect(join(m, hello("Ana", { owner: "owner-hash" }), 0)).toMatchObject({
      ok: true,
      who: { seat: 0 },
      owner: true,
    });
    expect(join(m, hello("Sam"), 0)).toMatchObject({ ok: true, who: { seat: 1 }, newToken: true });
    (m.seats[1] as Meta["seats"][number]).token = "sam";
    expect(join(m, hello("Lou"), 0)).toMatchObject({ who: { seat: 2 } });
    expect(m.seats.map((s) => s.nick)).toEqual(["Ana", "Sam", "Lou"]);
  });

  it("gives a known token its seat back, even in a started or locked room", () => {
    const m = room(2);
    (m.seats[1] as Meta["seats"][number]).token = "sam";
    m.locked = true;
    m.started = NOW;
    expect(join(m, hello("Sam", { seat: "sam" }), 0)).toMatchObject({
      who: { seat: 1 },
      newToken: false,
    });
  });

  it("makes a table, a late device, or one in a locked or full room a spectator", () => {
    const m = room(2);
    expect(join(m, hello("TV", { table: true }), 0)).toMatchObject({
      who: { seat: null, table: true },
    });
    m.locked = true;
    expect(join(m, hello("Lou"), 0)).toMatchObject({ who: { seat: null } });
    m.locked = false;
    m.started = NOW;
    expect(join(m, hello("Lou"), 0)).toMatchObject({ who: { seat: null } });
    m.ended = true;
    expect(join(m, hello("Lou"), 0)).toMatchObject({ who: { seat: 1 } });
  });

  it("refuses a spectator over the cap", () => {
    const m = room(2);
    m.locked = true;
    expect(join(m, hello("Lou"), CAPS.spectators)).toEqual({
      ok: false,
      reason: "This room is full.",
    });
  });

  it("never gives a guest the owner's seat or a CPU seat", () => {
    const m = room(2, 1);
    expect(join(m, hello("Sam"), 0)).toMatchObject({ who: { seat: null } });
    expect(join(m, hello("Sam", { owner: "wrong" }), 0)).toMatchObject({ who: { seat: null } });
  });
});

describe("owner controls (AC5.3)", () => {
  const full = () => {
    const m = room(3);
    m.seats.forEach((s, i) => {
      s.token = `t${i}`;
      s.nick = `P${i}`;
    });
    return m;
  };

  it("starts only when every seat has a player or a CPU, and not twice", () => {
    const m = room(3);
    (m.seats[0] as Meta["seats"][number]).token = "t0";
    expect(ownerOp(m, { op: "start" }, NOW, all(0))).toEqual({
      ok: false,
      reason: "Seat 2 is empty: wait for a player, or make it a CPU.",
    });
    const f = full();
    expect(ownerOp(f, { op: "start" }, NOW, all(0, 1, 2))).toEqual({ ok: true, start: true });
    expect(f).toMatchObject({ started: NOW, ended: false, match: 1, host: 0 });
    expect(ownerOp(f, { op: "start" }, NOW, all(0))).toEqual({
      ok: false,
      reason: "A match is on.",
    });
    f.ended = true;
    expect(ownerOp(f, { op: "rematch" }, NOW + 1, all(0))).toMatchObject({ ok: true, start: true });
    expect(f.match).toBe(2);
  });

  it("starts on another device when the host's is away", () => {
    const m = full();
    m.host = 2;
    ownerOp(m, { op: "start" }, NOW, all(1));
    expect(m.host).toBe(1);
  });

  it("locks, unlocks and closes", () => {
    const m = room();
    expect(ownerOp(m, { op: "lock" }, NOW, all())).toEqual({ ok: true });
    expect(m.locked).toBe(true);
    ownerOp(m, { op: "unlock" }, NOW, all());
    expect(m.locked).toBe(false);
    expect(ownerOp(m, { op: "close" }, NOW, all())).toEqual({ ok: true, close: true });
  });

  it("kicks a player, never the owner or a CPU", () => {
    const m = full();
    expect(ownerOp(m, { op: "kick", seat: 2 }, NOW, all())).toEqual({ ok: true, kick: 2 });
    expect(m.seats[2]).toEqual({ nick: "", cpu: false, token: null });
    expect(ownerOp(m, { op: "kick", seat: 0 }, NOW, all())).toEqual({
      ok: false,
      reason: "No such seat.",
    });
    expect(ownerOp(m, { op: "kick", seat: 2 }, NOW, all())).toEqual({
      ok: false,
      reason: "Nobody sits there.",
    });
  });

  it("sets CPU seats and the number of seats between matches", () => {
    const m = room(3);
    expect(ownerOp(m, { op: "cpu", seat: 2, on: true }, NOW, all())).toEqual({ ok: true });
    expect(m.seats[2]?.cpu).toBe(true);
    (m.seats[1] as Meta["seats"][number]).token = "t1";
    expect(ownerOp(m, { op: "cpu", seat: 1, on: true }, NOW, all())).toEqual({
      ok: false,
      reason: "Someone sits there.",
    });
    expect(ownerOp(m, { op: "cpu", seat: 9, on: true }, NOW, all())).toEqual({
      ok: false,
      reason: "No such seat.",
    });
    expect(ownerOp(m, { op: "size", seats: 5 }, NOW, all())).toEqual({ ok: true });
    expect(m.seats.map((s) => s.cpu)).toEqual([false, false, true, true, true]);
    expect(ownerOp(m, { op: "size", seats: 2 }, NOW, all())).toEqual({ ok: true });
    expect(ownerOp(m, { op: "size", seats: 1 }, NOW, all())).toEqual({
      ok: false,
      reason: "Seats must be 2 to 6.",
    });
    expect(ownerOp(m, { op: "size", seats: 7 }, NOW, all())).toEqual({
      ok: false,
      reason: "Seats must be 2 to 6.",
    });
    const f = full();
    expect(ownerOp(f, { op: "size", seats: 2 }, NOW, all())).toEqual({
      ok: false,
      reason: "Kick the last player first.",
    });
    f.started = NOW;
    expect(ownerOp(f, { op: "cpu", seat: 1, on: true }, NOW, all())).toMatchObject({ ok: false });
    expect(ownerOp(f, { op: "size", seats: 4 }, NOW, all())).toMatchObject({ ok: false });
    expect(ownerOp(f, { op: "dance" }, NOW, all())).toEqual({
      ok: false,
      reason: "Unknown control.",
    });
  });
});

describe("the host (AC6.5)", () => {
  it("passes to the next online player after the one that left, never a CPU", () => {
    const m = room(4, 1);
    expect(nextHost(m, all(0, 2), 0)).toBe(2);
    expect(nextHost(m, all(0, 1), 1)).toBe(0);
    expect(nextHost(m, all(3), 0)).toBeNull();
    expect(nextHost(m, all(1), null)).toBe(1);
  });
});

describe("moves (AC6.3)", () => {
  const snap: Snap = { seq: 3, turn: 1, views: {}, public: null, snapshot: null };
  it("pass only from the seat whose turn it is, at the current seq, in a match", () => {
    const m = room(2);
    (m.seats[0] as Meta["seats"][number]).nick = "Ana";
    expect(checkMove(m, snap, 1, 3)).toBe("The match hasn't started.");
    m.started = NOW;
    expect(checkMove(m, null, 1, 3)).toBe("The match hasn't started.");
    expect(checkMove(m, snap, 1, 3)).toBeNull();
    expect(checkMove(m, snap, 1, 2)).toBe("The board changed. Try again.");
    expect(checkMove(m, { ...snap, turn: 0 }, 1, 3)).toBe("It's Ana's turn.");
    expect(checkMove(m, snap, null, 3)).toBe("Spectators can't move.");
    const cpu = room(2, 1);
    cpu.started = NOW;
    expect(checkMove(cpu, snap, 0, 3)).toBe("It's CPU 2's turn.");
    (cpu.seats[0] as Meta["seats"][number]).nick = "";
    expect(checkMove(cpu, { ...snap, turn: 0 }, 1, 3)).toBe("It's seat 1's turn.");
  });
});

describe("envelopes", () => {
  const msg = (o: unknown) => JSON.stringify(o);
  it("pass a known type for the sender, of the protocol, within the size", () => {
    expect(envelope(msg({ v: 1, t: "move", seq: 1 }), false)).toMatchObject({ ok: true });
    expect(
      envelope(msg({ v: 1, t: "state", views: "x".repeat(CAPS.message) }), true),
    ).toMatchObject({ ok: true });
  });

  it.each([
    [new ArrayBuffer(2), false, "bad"],
    ["{", false, "bad"],
    ["[1]", false, "bad"],
    ["null", false, "bad"],
    [msg({ v: 2, t: "hello" }), false, "version"],
    [msg({ v: 1, t: "state" }), false, "bad"],
    [msg({ v: 1, t: "nope" }), true, "bad"],
    [msg({ v: 1, t: "move", pad: "x".repeat(CAPS.message) }), false, "big"],
    [msg({ v: 1, t: "state", pad: "x".repeat(CAPS.state) }), true, "big"],
  ])("refuse %#", (raw, isHost, code) => {
    expect(envelope(raw as string, isHost as boolean)).toMatchObject({ ok: false, code });
  });
});

describe("the rate", () => {
  it("allows 20 messages a second per socket", () => {
    const w = { at: 0, count: 0 };
    for (let i = 0; i < CAPS.rate; i++) expect(allow(w, 5000)).toBe(true);
    expect(allow(w, 5999)).toBe(false);
    expect(allow(w, 6000)).toBe(true);
  });
});

describe("the match record (AC7.1)", () => {
  it("has the players, places, length, seats and CPU seats, and a sole human winner", () => {
    const m = room(3, 1);
    m.seats[0] = { nick: "Ana", cpu: false, token: "a" };
    m.seats[1] = { nick: "Sam", cpu: false, token: "s" };
    m.started = NOW;
    expect(matchRecord(m, [[1], [0, 2]], NOW + 90_400)).toEqual({
      game: "crazy-eights",
      at: NOW + 90_400,
      players: ["Ana", "Sam", "CPU 3"],
      places: [[1], [0, 2]],
      secs: 90,
      seats: 3,
      cpu: 1,
      winner: "Sam",
    });
    expect(matchRecord(m, [[2], [0, 1]], NOW).winner).toBeNull();
    expect(matchRecord(m, [[0, 1, 2]], NOW).winner).toBeNull();
  });

  it("takes only places that list every seat once", () => {
    const m = room(3);
    expect(validPlaces(m, [[0], [1, 2]])).toEqual([[0], [1, 2]]);
    for (const bad of [
      null,
      [],
      [[0], [1]],
      [[0], [0, 1, 2]],
      [[0], [], [1, 2]],
      [[0], [1, 3]],
      [0, 1, 2],
      [[0.5]],
    ])
      expect(validPlaces(m, bad)).toBeNull();
  });
});

describe("the alarm", () => {
  it("rings at the room's end, or 10 minutes after it empties", () => {
    const m = room();
    expect(alarmAt(m, 2, NOW)).toBe(m.expires);
    expect(alarmAt(m, 0, NOW)).toBe(NOW + EMPTY_MS);
    expect(alarmAt(m, 0, m.expires - 1000)).toBe(m.expires);
  });
});
