// The `room` transport (AC6.4): hello with this tab's tokens, reconnect with backoff, keep-alive
// pings, and stopping for good when the room ends or refuses the device. A fake WebSocket here;
// tests/unit/objects.test.ts and tests/e2e run the real one.
import { beforeEach, describe, expect, it } from "vitest";
import { PROTOCOL } from "../../site/lib/engine.js";
import {
  BACKOFF,
  createRoom,
  forgetTokens,
  keepToken,
  PING_MS,
  tokens,
} from "../../site/lib/net/room.js";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  get(msg: unknown) {
    this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
}

const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  } as unknown as Storage;
};

let timers: { fn: () => void; ms: number }[];
const opts = (storage = store()) => ({
  code: "K7M2QX",
  hello: { nick: "Sam" },
  url: "ws://test/api/rooms/K7M2QX/ws",
  WebSocket: FakeSocket as unknown as typeof WebSocket,
  storage,
  schedule: (fn: () => void, ms: number) => timers.push({ fn, ms }),
  cancel: (h: unknown) => {
    const i = typeof h === "number" ? h - 1 : -1;
    if (timers[i]) timers[i] = { fn: () => {}, ms: -1 };
  },
});
const last = () => FakeSocket.all.at(-1) as FakeSocket;
const run = (ms: number) => {
  const t = timers.find((x) => x.ms === ms);
  if (!t) throw new Error(`no timer of ${ms} ms`);
  timers.splice(timers.indexOf(t), 1);
  t.fn();
};

beforeEach(() => {
  FakeSocket.all = [];
  timers = [];
});

describe("the room transport", () => {
  it("says hello with this tab's tokens, and keeps the seat token it gets", () => {
    const storage = store();
    keepToken("K7M2QX", { ownerToken: "own" }, storage);
    const room = createRoom(opts(storage));
    const got: unknown[] = [];
    room.onMessage((m: unknown) => got.push(m));
    last().open();
    expect(JSON.parse(last().sent[0] as string)).toEqual({
      v: PROTOCOL,
      t: "hello",
      nick: "Sam",
      ownerToken: "own",
    });
    last().get({
      v: 1,
      t: "welcome",
      seat: 1,
      seatToken: "seat",
      room: { seats: [{ nick: "Ana", cpu: false, online: true }] },
    });
    expect(tokens("K7M2QX", storage)).toEqual({ ownerToken: "own", seatToken: "seat" });
    forgetTokens("K7M2QX", storage);
    expect(tokens("K7M2QX", storage)).toEqual({});
    expect(room.seat).toBe(1);
    expect(room.up).toBe(true);
    expect(room.peers()).toEqual([{ seat: 0, name: "Ana", kind: "human", online: true }]);
    expect(got.map((m) => (m as { t: string }).t)).toEqual(["link", "welcome"]);
    expect(room.send({ t: "move", seq: 0 })).toBe(true);
    expect(last().sent.at(-1)).toBe(`{"v":${PROTOCOL},"t":"move","seq":0}`);
  });

  it("reconnects after a drop, with backoff, and gives its seat token back (AC6.4)", () => {
    const room = createRoom(opts());
    const links: boolean[] = [];
    room.onMessage(
      (m: { t: string; up?: boolean }) => m.t === "link" && links.push(m.up as boolean),
    );
    last().open();
    last().get({ v: 1, t: "welcome", seat: 1, seatToken: "seat", room: null });
    last().close();
    expect(room.send({ t: "move" })).toBe(false);
    for (const ms of BACKOFF.slice(0, 3)) {
      run(ms);
      last().close();
    }
    run(BACKOFF[3] as number);
    last().close();
    run(15000);
    last().open();
    expect(JSON.parse(last().sent[0] as string)).toMatchObject({ seatToken: "seat" });
    last().get({ v: 1, t: "welcome", seat: 1, room: null });
    expect(links).toEqual([true, false, true]);
    // After a good connect the backoff starts again at 1 s.
    last().close();
    run(1000);
    expect(FakeSocket.all).toHaveLength(7);
  });

  it("pings every 30 s, and ignores pongs and broken messages", () => {
    const room = createRoom(opts());
    const got: unknown[] = [];
    room.onMessage((m: unknown) => got.push(m));
    last().open();
    run(PING_MS);
    expect(last().sent.at(-1)).toBe("ping");
    last().get("pong");
    last().get("{nope");
    expect(got).toEqual([]);
    last().readyState = 0;
    run(PING_MS);
    expect(last().sent.at(-1)).toBe("ping");
  });

  it("stops for good when the room closes, refuses the device, or the device leaves", () => {
    for (const msg of [
      { t: "closed" },
      { t: "error", code: "kicked" },
      { t: "error", code: "full" },
    ]) {
      createRoom(opts());
      last().open();
      last().get({ v: 1, ...msg });
      const count = FakeSocket.all.length;
      expect(timers.some((t) => BACKOFF.includes(t.ms))).toBe(false);
      expect(FakeSocket.all).toHaveLength(count);
      timers = [];
    }
    const room = createRoom(opts());
    last().open();
    room.close();
    expect(timers.filter((t) => BACKOFF.includes(t.ms))).toEqual([]);
  });

  it("connects at once when the device is back online", () => {
    const room = createRoom(opts());
    last().close();
    room.wake();
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    last().get({ v: 1, t: "welcome", seat: 0, room: null });
    room.wake();
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("keeps working when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(tokens("K7M2QX", blocked)).toEqual({});
    expect(() => keepToken("K7M2QX", { seatToken: "x" }, blocked)).not.toThrow();
    expect(() => forgetTokens("K7M2QX", blocked)).not.toThrow();
  });
});
