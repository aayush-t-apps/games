// The room's rules (change 0002: AC5.3, AC6.1, AC6.3, AC6.5, AC7.1): seats, the host's controls,
// moves, the host role, envelopes, rate and caps, and the match record.
import { describe, expect, it } from "vitest";
import {
  alarmAt,
  allow,
  CAPS,
  checkMove,
  control,
  EMPTY_MS,
  envelope,
  HOST_WAIT_MS,
  hostDropped,
  hostDue,
  join,
  LIFETIME_MS,
  leave,
  type Meta,
  matchRecord,
  newMeta,
  nextHost,
  PROTOCOL,
  people,
  publicRoom,
  type Snap,
  takeHost,
  upgrade,
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
  it("has its seats, the last ones CPU, the member's seat 0 as host, and its end in 6 hours", () => {
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
  it("gives the member seat 0, then each guest the next free seat", () => {
    const m = room(3);
    expect(join(m, hello("Ana", { owner: "owner-hash" }), 0)).toMatchObject({
      ok: true,
      who: { seat: 0 },
    });
    expect(m.host).toBe(0);
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

  it("never gives a guest the member's seat or a CPU seat", () => {
    const m = room(2, 1);
    expect(join(m, hello("Sam"), 0)).toMatchObject({ who: { seat: null } });
    expect(join(m, hello("Sam", { owner: "wrong" }), 0)).toMatchObject({ who: { seat: null } });
  });
});

describe("the host's controls (AC5.3)", () => {
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
    expect(control(m, { op: "start" }, NOW)).toEqual({
      ok: false,
      reason: "Seat 2 is empty: wait for a player, or make it a CPU.",
    });
    const f = full();
    expect(control(f, { op: "start" }, NOW)).toEqual({ ok: true, start: true });
    expect(f).toMatchObject({ started: NOW, ended: false, match: 1, host: 0 });
    expect(control(f, { op: "start" }, NOW)).toEqual({
      ok: false,
      reason: "A match is on.",
    });
    f.ended = true;
    expect(control(f, { op: "rematch" }, NOW + 1)).toMatchObject({ ok: true, start: true });
    expect(f.match).toBe(2);
  });

  it("locks, unlocks and closes", () => {
    const m = room();
    expect(control(m, { op: "lock" }, NOW)).toEqual({ ok: true });
    expect(m.locked).toBe(true);
    control(m, { op: "unlock" }, NOW);
    expect(m.locked).toBe(false);
    expect(control(m, { op: "close" }, NOW)).toEqual({ ok: true, close: true });
  });

  it("kicks a player, never the host or a CPU", () => {
    const m = full();
    expect(control(m, { op: "kick", seat: 2 }, NOW)).toEqual({ ok: true, kick: 2 });
    expect(m.seats[2]).toEqual({ nick: "", cpu: false, token: null });
    expect(control(m, { op: "kick", seat: 0 }, NOW)).toEqual({
      ok: false,
      reason: "That's your seat.",
    });
    expect(control(m, { op: "kick", seat: 2 }, NOW)).toEqual({
      ok: false,
      reason: "Nobody sits there.",
    });
    expect(control(m, { op: "kick", seat: 3 }, NOW)).toEqual({
      ok: false,
      reason: "No such seat.",
    });
  });

  it("lets a new host kick the member's seat, which then stops being kept", () => {
    const m = full();
    m.host = 1;
    expect(control(m, { op: "kick", seat: 0 }, NOW)).toEqual({ ok: true, kick: 0 });
    expect(m.owner).toBe("");
    expect(control(m, { op: "cpu", seat: 1, on: true }, NOW)).toEqual({
      ok: false,
      reason: "That's your seat.",
    });
    expect(control(m, { op: "cpu", seat: 0, on: true }, NOW)).toEqual({ ok: true });
  });

  it("sets CPU seats and the number of seats between matches", () => {
    const m = room(3);
    expect(control(m, { op: "cpu", seat: 2, on: true }, NOW)).toEqual({ ok: true });
    expect(m.seats[2]?.cpu).toBe(true);
    (m.seats[1] as Meta["seats"][number]).token = "t1";
    expect(control(m, { op: "cpu", seat: 1, on: true }, NOW)).toEqual({
      ok: false,
      reason: "Someone sits there.",
    });
    expect(control(m, { op: "cpu", seat: 9, on: true }, NOW)).toEqual({
      ok: false,
      reason: "No such seat.",
    });
    expect(control(m, { op: "size", seats: 5 }, NOW)).toEqual({ ok: true });
    expect(m.seats.map((s) => s.cpu)).toEqual([false, false, true, true, true]);
    expect(control(m, { op: "size", seats: 2 }, NOW)).toEqual({ ok: true });
    expect(control(m, { op: "size", seats: 1 }, NOW)).toEqual({
      ok: false,
      reason: "Seats must be 2 to 6.",
    });
    expect(control(m, { op: "size", seats: 7 }, NOW)).toEqual({
      ok: false,
      reason: "Seats must be 2 to 6.",
    });
    const f = full();
    expect(control(f, { op: "size", seats: 2 }, NOW)).toEqual({
      ok: false,
      reason: "Kick the last player first.",
    });
    f.started = NOW;
    expect(control(f, { op: "cpu", seat: 1, on: true }, NOW)).toMatchObject({ ok: false });
    expect(control(f, { op: "size", seats: 4 }, NOW)).toMatchObject({ ok: false });
    expect(control(f, { op: "dance" }, NOW)).toEqual({
      ok: false,
      reason: "Unknown control.",
    });
  });
});

describe("the host role passes on (AC5.5, AC6.5)", () => {
  const seated = (seats = 3) => {
    const m = room(seats);
    join(m, hello("Ana", { owner: "owner-hash" }), 0);
    for (let i = 1; i < seats; i++) {
      const s = m.seats[i] as Meta["seats"][number];
      s.token = `t${i}`;
      s.nick = `P${i}`;
    }
    return m;
  };

  it("starts with the member's seat 0, kept for its token, and shows who the host is", () => {
    const m = room(2);
    expect(m).toMatchObject({ host: 0, hostAway: null, reported: 0 });
    // Seat 0 is kept before the member's device says hello.
    expect(publicRoom(m, all(), 0).seats[0]?.taken).toBe(true);
    expect(join(m, hello("Sam"), 0)).toMatchObject({ who: { seat: 1 } });
    expect(publicRoom(m, all(), 0)).toMatchObject({ host: 0, hostAway: null });
  });

  it("passes at once to the next online player when the host taps Leave, and opens the seat", () => {
    const m = seated();
    leave(m, 0, all(0, 2));
    expect(m.host).toBe(2);
    expect(m.owner).toBe("");
    expect(m.seats[0]).toEqual({ nick: "", cpu: false, token: null });
    // Seat 0 is a free seat now; the member's token no longer gets it, nor the role.
    expect(join(m, hello("Ana", { owner: "owner-hash" }), 0)).toMatchObject({
      who: { seat: 0 },
      newToken: true,
    });
    expect(m.host).toBe(2);
  });

  it("keeps the role when a player who isn't the host leaves, or nobody else is here", () => {
    const m = seated();
    leave(m, 1, all(0, 1));
    expect(m.host).toBe(0);
    leave(m, 0, all(0));
    expect(m.host).toBe(0);
    // The next one to sit while nobody holds the host's seat becomes the host.
    expect(join(m, hello("Lou"), 0)).toMatchObject({ who: { seat: 0 } });
    expect(m.host).toBe(0);
  });

  it("makes the first player to sit the host when the host's seat is open", () => {
    const m = seated(2);
    leave(m, 0, all(0));
    // Seat 1 comes back first: the host's seat is open, so the role is theirs.
    expect(join(m, hello("P1", { seat: "t1" }), 0)).toMatchObject({ who: { seat: 1 } });
    expect(m.host).toBe(1);
  });

  it("waits 30 seconds after the host's device drops, then passes it on", () => {
    expect(HOST_WAIT_MS).toBe(30_000);
    const m = seated();
    expect(hostDropped(m, all(0, 1), NOW)).toBe(false);
    expect(hostDropped(m, all(), NOW)).toBe(false);
    expect(hostDropped(m, all(2), NOW)).toBe(true);
    expect(hostDropped(m, all(1, 2), NOW + 5)).toBe(false);
    expect(m.hostAway).toBe(NOW);
    expect(alarmAt(m, 2, NOW)).toBe(NOW + HOST_WAIT_MS);
    expect(hostDue(m, all(1, 2), NOW + HOST_WAIT_MS - 1)).toBe(false);
    expect(hostDue(m, all(1, 2), NOW + HOST_WAIT_MS)).toBe(true);
    expect(m).toMatchObject({ host: 1, hostAway: null });
    expect(alarmAt(m, 2, NOW)).toBe(m.expires);
  });

  it("stops the wait when the host's device comes back", () => {
    const m = seated();
    hostDropped(m, all(1), NOW);
    expect(join(m, hello("Ana", { owner: "owner-hash" }), 0)).toMatchObject({ who: { seat: 0 } });
    expect(m.hostAway).toBeNull();
    hostDropped(m, all(1), NOW);
    expect(hostDue(m, all(0, 1), NOW + HOST_WAIT_MS)).toBe(true);
    expect(m).toMatchObject({ host: 0, hostAway: null });
  });

  it("lets a player take the role only while the host is away", () => {
    const m = seated();
    expect(takeHost(m, 1, all(0, 1))).toBe("The host is here.");
    expect(takeHost(m, null, all(1))).toBe("Only a player can be the host.");
    hostDropped(m, all(1), NOW);
    expect(takeHost(m, 1, all(1))).toBeNull();
    expect(m).toMatchObject({ host: 1, hostAway: null });
    // The member comes back to seat 0, as a player.
    expect(join(m, hello("Ana", { owner: "owner-hash" }), 0)).toMatchObject({ who: { seat: 0 } });
    expect(m.host).toBe(1);
  });

  it("counts the people seated, and keeps the host of a room an older release stored", () => {
    const m = seated();
    expect(people(m)).toBe(3);
    const { hostAway: _, reported: __, ...rest } = room(2);
    const old = { ...rest, host: 1, ownerSeat: 0, ownerAway: NOW };
    const now = upgrade(old);
    expect(now).toMatchObject({ host: 1, hostAway: null, reported: -1 });
    expect(now).not.toHaveProperty("ownerSeat");
    expect(now).not.toHaveProperty("ownerAway");
    expect(upgrade({ ...rest, host: null, ownerSeat: 2 }).host).toBe(2);
    expect(upgrade({ ...rest, host: null }).host).toBe(0);
  });
});

describe("the next host", () => {
  it("is the next online player after the one that left, never a CPU", () => {
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
    const v = PROTOCOL;
    expect(envelope(msg({ v, t: "move", seq: 1 }), false)).toMatchObject({ ok: true });
    expect(envelope(msg({ v, t: "control", op: "start" }), false)).toMatchObject({ ok: true });
    expect(envelope(msg({ v, t: "state", views: "x".repeat(CAPS.message) }), true)).toMatchObject({
      ok: true,
    });
  });

  const v = PROTOCOL;
  it.each([
    [new ArrayBuffer(2), false, "bad"],
    ["{", false, "bad"],
    ["[1]", false, "bad"],
    ["null", false, "bad"],
    // A tab open on the release before the one Host role (0.5.0) is asked to reload.
    [msg({ v: 1, t: "hello" }), false, "version"],
    [msg({ v, t: "state" }), false, "bad"],
    [msg({ v, t: "nope" }), true, "bad"],
    [msg({ v, t: "take-owner" }), false, "bad"],
    [msg({ v, t: "move", pad: "x".repeat(CAPS.message) }), false, "big"],
    [msg({ v, t: "state", pad: "x".repeat(CAPS.state) }), true, "big"],
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

  it("names a seat whose player left mid-match by the seat, never as a blank winner", () => {
    const m = room(2);
    m.seats[0] = { nick: "Ana", cpu: false, token: "a" };
    m.seats[1] = { nick: "", cpu: false, token: null };
    const record = matchRecord(m, [[1], [0]], NOW);
    expect(record.players).toEqual(["Ana", "Seat 2"]);
    expect(record.winner).toBeNull();
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
