// App-owned: the Room and Hub objects (src/worker/objects/) through the whole Worker, as
// `wrangler dev` runs it, empty on each run. Access isn't set up here and the host is local, so
// the caller is the developer (member and admin), as on `make dev` (ADR 0001).
import { afterAll, describe, expect, it, vi } from "vitest";
import { PROTOCOL } from "../../src/worker/room-logic";
import { localWorker } from "./support/worker";

// workerd beside the other test files on a small machine: 5 s per test is too tight.
vi.setConfig({ testTimeout: 20_000 });
const worker = await localWorker();
afterAll(() => worker.dispose());

const origin = worker.url.origin;
type Msg = Record<string, unknown> & { t: string };

/** A device: a WebSocket to a room, with every message it got. */
async function device(code: string) {
  const url = `ws://${worker.url.host}/api/rooms/${code}/ws`;
  const ws = new WebSocket(url, { headers: { origin } } as unknown as string[]);
  const got: Msg[] = [];
  const waiting: { test: (m: Msg) => boolean; done: (m: Msg) => void }[] = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(String(e.data)) as Msg;
    got.push(msg);
    for (const w of [...waiting])
      if (w.test(msg)) {
        waiting.splice(waiting.indexOf(w), 1);
        w.done(msg);
      }
  });
  const closed = new Promise<CloseEvent>((done) => ws.addEventListener("close", done));
  await new Promise((done, fail) => {
    ws.addEventListener("open", done);
    ws.addEventListener("error", fail);
  });
  return {
    ws,
    got,
    closed,
    send: (msg: Record<string, unknown>) => ws.send(JSON.stringify({ v: PROTOCOL, ...msg })),
    /** The next message of type `t` (and matching `test`), or one already got since `from`. */
    next(t: string, test: (m: Msg) => boolean = () => true, from = 0): Promise<Msg> {
      const ok = (m: Msg) => m.t === t && test(m);
      const seen = got.slice(from).find(ok);
      if (seen) return Promise.resolve(seen);
      return new Promise((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`no ${t} message`)), 5000);
        waiting.push({
          test: ok,
          done: (m) => {
            clearTimeout(timer);
            done(m);
          },
        });
      });
    },
  };
}

/** Whether a WebSocket to the room opens from that origin. */
function opens(code: string, from: string): Promise<boolean> {
  const ws = new WebSocket(`ws://${worker.url.host}/api/rooms/${code}/ws`, {
    headers: { origin: from },
  } as unknown as string[]);
  ws.addEventListener("open", () =>
    ws.send(JSON.stringify({ v: PROTOCOL, t: "hello", table: true })),
  );
  return new Promise((done) => {
    // Close once the room answered, so neither side writes to a closed socket.
    ws.addEventListener("message", () => {
      ws.close();
      done(true);
    });
    ws.addEventListener("error", () => done(false));
  });
}

const post = (path: string, body: unknown, method = "POST") =>
  worker.fetch(path, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function newRoom(body: Record<string, unknown> = {}) {
  const res = await post("/api/member/rooms", {
    game: "four-in-a-row",
    version: 1,
    seats: 2,
    cpu: 0,
    level: "easy",
    ...body,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; ownerToken: string };
}

describe("rooms: start, join, play, score (AC5.2, AC6.1–AC6.5, AC7.1)", () => {
  it("runs a match from two devices and records it once in the Hub", async () => {
    const { code, ownerToken } = await newRoom();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    const info = (await (await worker.fetch(`/api/rooms/${code}`)).json()) as { seats: unknown[] };
    expect(info.seats).toHaveLength(2);

    const owner = await device(code);
    owner.send({ t: "hello", nick: "Ana", ownerToken });
    const welcome = await owner.next("welcome");
    expect(welcome).toMatchObject({ seat: 0, room: { host: 0 } });

    const guest = await device(code);
    guest.send({ t: "hello", nick: "Sam" });
    const joined = await guest.next("welcome");
    expect(joined).toMatchObject({ seat: 1, room: { host: 0 } });
    expect(joined.seatToken).toMatch(/^[0-9a-f]{32}$/);

    // Only the host controls the room.
    guest.send({ t: "control", op: "start" });
    expect(await guest.next("error")).toMatchObject({ code: "role" });

    owner.send({ t: "control", op: "start" });
    const start = await owner.next("start");
    expect(start.seats).toEqual([
      { name: "Ana", kind: "human", level: "easy" },
      { name: "Sam", kind: "human", level: "easy" },
    ]);

    // The host sends the state; the guest gets only its own view.
    owner.send({
      t: "state",
      seq: 0,
      turn: 0,
      views: { 0: { mine: 0 }, 1: { mine: 1 } },
      public: {},
      snapshot: { s: 0 },
    });
    expect(await guest.next("view")).toMatchObject({ data: { mine: 1 } });

    // Out of turn: the room refuses it, and the host never sees it (AC6.3).
    guest.send({ t: "move", seq: 0, move: { col: 3 } });
    expect(await guest.next("refused")).toMatchObject({ reason: "It's Ana's turn." });

    owner.send({
      t: "state",
      seq: 1,
      turn: 1,
      views: { 0: { mine: 0 }, 1: { mine: 1, n: 1 } },
      public: {},
      snapshot: { s: 1 },
    });
    await guest.next("view", (m) => (m.data as { n?: number }).n === 1);
    guest.send({ t: "move", seq: 0, move: { col: 3 } });
    expect(await guest.next("refused", (m) => m.reason !== "It's Ana's turn.")).toMatchObject({
      reason: "The board changed. Try again.",
    });
    guest.send({ t: "move", seq: 1, move: { col: 3 } });
    expect(await owner.next("move")).toMatchObject({ seat: 1, seq: 1, move: { col: 3 } });

    // The host's refusal reaches only that seat.
    owner.send({ t: "refused", seat: 1, reason: "That column is full." });
    expect(await guest.next("refused", (m) => m.reason === "That column is full.")).toBeTruthy();

    // A guest that drops gets its seat and its latest view back (AC6.4).
    const from = guest.got.length;
    guest.ws.close();
    await guest.closed;
    const back = await device(code);
    back.send({ t: "hello", nick: "Sam", seatToken: joined.seatToken });
    expect(await back.next("welcome")).toMatchObject({ seat: 1 });
    expect(await back.next("view")).toMatchObject({ data: { mine: 1, n: 1 } });
    expect(from).toBeGreaterThan(0);

    owner.send({ t: "end", places: [[1], [0]] });
    expect(await back.next("end")).toMatchObject({ places: [[1], [0]] });
    // A second end is ignored: the match is recorded once.
    owner.send({ t: "end", places: [[0], [1]] });

    const scores = (await (await worker.fetch("/api/scores?game=four-in-a-row")).json()) as {
      top: { nick: string; wins: number }[];
      recent: { players: string[] }[];
    };
    expect(scores.top).toEqual([{ nick: "Sam", wins: 1 }]);
    expect(scores.recent).toHaveLength(1);
    expect(scores.recent[0]?.players).toEqual(["Ana", "Sam"]);

    owner.ws.close();
    back.ws.close();
  });

  it("waits for the host when its device drops; Make me host goes on from the last snapshot (AC6.5)", async () => {
    const { code, ownerToken } = await newRoom();
    const owner = await device(code);
    owner.send({ t: "hello", nick: "Ana", ownerToken });
    await owner.next("welcome");
    const guest = await device(code);
    guest.send({ t: "hello", nick: "Sam" });
    await guest.next("welcome");
    owner.send({ t: "control", op: "start" });
    await owner.next("start");
    owner.send({
      t: "state",
      seq: 4,
      turn: 1,
      views: { 0: {}, 1: { mine: 1 } },
      public: {},
      snapshot: { at: 4 },
    });
    await guest.next("view");

    // The host's device drops: the role stays with it for now, and moves wait.
    owner.ws.close();
    await owner.closed;
    const away = await guest.next(
      "seats",
      (m) => (m.room as { hostAway: number | null }).hostAway !== null,
    );
    expect(away.room).toMatchObject({ host: 0 });
    guest.send({ t: "move", seq: 4, move: { col: 3 } });
    expect(await guest.next("refused")).toMatchObject({ reason: "Waiting for the host…" });

    // Make me host: the guest goes on from the same snapshot.
    guest.send({ t: "take-host" });
    expect(await guest.next("host")).toMatchObject({ snapshot: { at: 4 } });
    await guest.next("seats", (m) => (m.room as { host: number }).host === 1);

    // The member's device comes back to seat 0, as a player: it gets its view, not the rules.
    const again = await device(code);
    again.send({ t: "hello", nick: "Ana", ownerToken });
    expect(await again.next("welcome")).toMatchObject({ seat: 0, room: { host: 1 } });
    expect(await again.next("view")).toBeTruthy();
    again.send({ t: "take-host" });
    expect(await again.next("refused")).toMatchObject({ reason: "The host is here." });
    again.ws.close();
    guest.ws.close();
  });

  it("gives late devices a spectator place, and a table the public view (AC6.1, AC9.1)", async () => {
    const { code, ownerToken } = await newRoom();
    const owner = await device(code);
    owner.send({ t: "hello", nick: "Ana", ownerToken });
    await owner.next("welcome");
    owner.send({ t: "control", op: "lock" });
    await owner.next("seats", (m) => (m.room as { locked: boolean }).locked);
    const late = await device(code);
    late.send({ t: "hello", nick: "Lou" });
    expect(await late.next("welcome")).toMatchObject({ seat: null });
    owner.send({ t: "control", op: "unlock" });
    owner.send({ t: "control", op: "cpu", seat: 1, on: true });
    owner.send({ t: "control", op: "start" });
    await owner.next("start");
    const table = await device(code);
    table.send({ t: "hello", table: true });
    expect(await table.next("welcome")).toMatchObject({ seat: null });
    owner.send({
      t: "state",
      seq: 0,
      turn: 0,
      views: { 0: {} },
      public: { board: "all" },
      snapshot: {},
    });
    expect(await table.next("public")).toMatchObject({ data: { board: "all" } });
    owner.ws.close();
    late.ws.close();
    table.ws.close();
  });

  it("passes the host role on Leave at once, and opens the seat; the Hub counts the people (AC5.5, AC8.6)", async () => {
    const { code, ownerToken } = await newRoom({ game: "crazy-eights", seats: 3 });
    const owner = await device(code);
    owner.send({ t: "hello", nick: "Ana", ownerToken });
    await owner.next("welcome");
    const sam = await device(code);
    sam.send({ t: "hello", nick: "Sam" });
    await sam.next("welcome");
    const lou = await device(code);
    lou.send({ t: "hello", nick: "Lou" });
    await lou.next("welcome");
    type Live = { code: string; players: number }[];
    const live = async () =>
      ((await (await worker.fetch("/api/admin/rooms")).json()) as Live).find((r) => r.code === code)
        ?.players;
    expect(await live()).toBe(3);

    owner.send({ t: "leave" });
    await owner.closed;
    const seats = await sam.next("seats", (m) => (m.room as { host: number }).host === 1);
    expect((seats.room as { seats: { taken: boolean }[] }).seats[0]?.taken).toBe(false);
    expect(await sam.next("host")).toMatchObject({ snapshot: null });
    expect(await live()).toBe(2);
    // Sam is the host now: a control works for Sam, and is refused to Lou.
    sam.send({ t: "control", op: "lock" });
    await lou.next("seats", (m) => (m.room as { locked: boolean }).locked);
    lou.send({ t: "control", op: "unlock" });
    expect(await lou.next("error")).toMatchObject({ code: "role" });
    sam.ws.close();
  });

  it("refuses Make me host while the host is here; the room shows the wait once it drops (AC6.5)", async () => {
    const { code, ownerToken } = await newRoom();
    const owner = await device(code);
    owner.send({ t: "hello", nick: "Ana", ownerToken });
    await owner.next("welcome");
    const sam = await device(code);
    sam.send({ t: "hello", nick: "Sam" });
    await sam.next("welcome");
    sam.send({ t: "take-host" });
    expect(await sam.next("refused")).toMatchObject({ reason: "The host is here." });
    sam.send({ t: "take-owner" });
    expect(await sam.next("error")).toMatchObject({ code: "bad" });

    owner.ws.close();
    await owner.closed;
    const info = async () =>
      (await (await worker.fetch(`/api/rooms/${code}`)).json()) as {
        host: number;
        hostAway: number | null;
      };
    await expect.poll(async () => (await info()).hostAway).toBeGreaterThan(0);
    sam.send({ t: "take-host" });
    await sam.next("seats", (m) => (m.room as { host: number }).host === 1);
    expect(await info()).toMatchObject({ host: 1, hostAway: null });
    sam.ws.close();
  });

  it("refuses a socket that says nothing first, a bad nickname and an old protocol", async () => {
    const { code } = await newRoom();
    const a = await device(code);
    a.send({ t: "move", seq: 0 });
    expect(await a.next("error")).toMatchObject({ code: "hello" });
    const b = await device(code);
    b.send({ t: "hello", nick: "" });
    expect(await b.next("error")).toMatchObject({ code: "nick" });
    const c = await device(code);
    c.ws.send(JSON.stringify({ v: 0, t: "hello", nick: "Old" }));
    expect(await c.next("error")).toMatchObject({ code: "version" });
    b.ws.close();
  });

  it("refuses a WebSocket from another origin, and an unknown room (AC6.7)", async () => {
    const { code } = await newRoom();
    await expect(opens(code, "https://evil.test")).resolves.toBe(false);
    await expect(opens(code, origin)).resolves.toBe(true);
    await expect(opens("ABCDEF", origin)).resolves.toBe(false);
    expect((await worker.fetch("/api/rooms/ABCDEF")).status).toBe(404);
  });
});

describe("the admin (AC8.1–AC8.4)", () => {
  it("turns a game off: it leaves the catalogue and refuses new rooms", async () => {
    const off = [{ game: "memory", enabled: false, featured: false, sort: 0 }];
    expect((await post("/api/admin/catalog", off, "PUT")).status).toBe(200);
    const catalog = (await (await worker.fetch("/api/admin/catalog")).json()) as unknown[];
    expect(catalog).toEqual(off);
    const res = await post("/api/member/rooms", { game: "memory", version: 1, seats: 2, cpu: 0 });
    expect(res.status).toBe(409);
    expect((await post("/api/admin/catalog", [], "PUT")).status).toBe(200);
  });

  it("lists live rooms, closes one on every device, and exports the Hub", async () => {
    const { code, ownerToken } = await newRoom();
    const owner = await device(code);
    owner.send({ t: "hello", nick: "Ana", ownerToken });
    await owner.next("welcome");
    const rooms = (await (await worker.fetch("/api/admin/rooms")).json()) as { code: string }[];
    expect(rooms.map((r) => r.code)).toContain(code);
    const stats = (await (await worker.fetch("/api/admin/stats")).json()) as { live: unknown[] };
    expect(stats.live.length).toBeGreaterThan(0);

    expect(
      (await worker.fetch(`/api/admin/rooms/${code}`, { method: "DELETE", headers: { origin } }))
        .status,
    ).toBe(200);
    expect(await owner.next("closed")).toBeTruthy();
    expect((await worker.fetch(`/api/rooms/${code}`)).status).toBe(404);

    const backup = (await (await worker.fetch("/api/admin/export")).json()) as { format: string };
    expect(backup.format).toBe("games-hub.v1");
  });

  it("asks the Hub for a restore, and says so when the storage can't (AC8.8)", async () => {
    // Local workerd has no point-in-time recovery ("does not implement point-in-time recovery"):
    // here the call reaches the Hub and is refused, and the Hub goes on as it was. On Cloudflare
    // the same call restores; tests/unit/app.test.ts checks the route's answer and the restart.
    const featured = [{ game: "ludo", enabled: true, featured: true, sort: 0 }];
    expect((await post("/api/admin/catalog", featured, "PUT")).status).toBe(200);
    const res = await post("/api/admin/restore", { at: Date.now() - 60_000 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "no_restore" });
    expect(await (await worker.fetch("/api/admin/catalog")).json()).toEqual(featured);
    expect((await post("/api/admin/restore", { at: Date.now() + 60_000 })).status).toBe(400);
    expect((await post("/api/admin/catalog", [], "PUT")).status).toBe(200);
  });
});
