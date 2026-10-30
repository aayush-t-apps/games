// The `room` transport (change 0002): a WebSocket to the room's Room object, with the interface of
// `local` (send(msg), onMessage(cb), peers()). It says hello on each connect, reconnects by itself
// after a drop or a deploy (1, 2, 4, 8, then every 15 s), and keeps this tab's seat and owner
// tokens in sessionStorage. It also tells its listeners {t: "link", up} when the link goes up or
// down. Keep-alive pings get "pong" from Cloudflare without waking the room.

export const BACKOFF = [1000, 2000, 4000, 8000, 15000];
export const PING_MS = 30_000;
/** Errors after which reconnecting can't help: the device must do something else. */
const FINAL = new Set(["kicked", "replaced", "full", "version", "nick"]);

const key = (code) => `games.room.${code}`;

/** This tab's tokens for a room: {seatToken?, ownerToken?}. */
export function tokens(code, storage = globalThis.sessionStorage) {
  try {
    return JSON.parse(storage?.getItem(key(code)) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** Keep a token for a room in this tab (the owner's, after starting the room). */
export function keepToken(code, more, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(key(code), JSON.stringify({ ...tokens(code, storage), ...more }));
  } catch {
    // Storage blocked: the seat lasts only as long as this connection.
  }
}

/** Forget this tab's tokens for a room, after Leave the room: its seat is someone else's now. */
export function forgetTokens(code, storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(key(code));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/**
 * @param {object} o
 * @param {string} o.code the room code
 * @param {{nick?: string, table?: boolean}} o.hello what the device says when it joins
 * @param {string} [o.url] the WebSocket URL; by default this page's host
 * @param {typeof WebSocket} [o.WebSocket]
 * @param {Storage} [o.storage]
 * @param {(fn: () => void, ms: number) => unknown} [o.schedule]
 * @param {(handle: unknown) => void} [o.cancel]
 */
export function createRoom({
  code,
  hello,
  url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/rooms/${code}/ws`,
  WebSocket: Socket = globalThis.WebSocket,
  storage = globalThis.sessionStorage,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
}) {
  const listeners = new Set();
  let ws = null;
  let tries = 0;
  let stopped = false;
  let retry = null;
  let ping = null;
  let room = null;
  let seat;
  let up = false;

  const emit = (msg) => {
    for (const cb of [...listeners]) cb(msg);
  };
  const link = (now) => {
    if (up === now) return;
    up = now;
    emit({ v: 1, t: "link", up });
  };

  function keepAlive() {
    ping = schedule(() => {
      if (ws?.readyState === 1) ws.send("ping");
      keepAlive();
    }, PING_MS);
  }

  function connect() {
    retry = null;
    const socket = new Socket(url);
    ws = socket;
    socket.onopen = () => {
      tries = 0;
      const saved = tokens(code, storage);
      socket.send(JSON.stringify({ v: 1, t: "hello", ...hello, seatToken: saved.seatToken, ownerToken: saved.ownerToken }));
      keepAlive();
    };
    socket.onmessage = (event) => {
      if (event.data === "pong") return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "welcome") {
        seat = msg.seat;
        room = msg.room;
        if (msg.seatToken) keepToken(code, { seatToken: msg.seatToken }, storage);
        link(true);
      } else if (msg.t === "seats") room = msg.room;
      else if (msg.t === "closed" || (msg.t === "error" && FINAL.has(msg.code))) {
        stopped = true;
        socket.close();
      }
      emit(msg);
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      if (ping !== null) cancel(ping);
      ping = null;
      link(false);
      if (stopped) return;
      retry = schedule(connect, BACKOFF[Math.min(tries, BACKOFF.length - 1)]);
      tries += 1;
    };
  }

  connect();

  return {
    kind: "room",
    code,
    /** Send a message to the room; false when the link is down (it says so to the player). */
    send(msg) {
      if (ws?.readyState !== 1) return false;
      ws.send(JSON.stringify({ v: 1, ...msg }));
      return true;
    },
    onMessage(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    peers() {
      return (room?.seats ?? []).map((s, i) => ({ seat: i, name: s.nick, kind: s.cpu ? "cpu" : "human", online: s.online }));
    },
    /** Leave the room for good on this device. */
    close() {
      stopped = true;
      if (retry !== null) cancel(retry);
      if (ping !== null) cancel(ping);
      ws?.close();
    },
    /** Connect again now, after the device came back online. */
    wake() {
      if (stopped || up || retry === null) return;
      cancel(retry);
      connect();
    },
    get seat() {
      return seat;
    },
    get room() {
      return room;
    },
    get up() {
      return up;
    },
  };
}
