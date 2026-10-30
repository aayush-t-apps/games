// The `local` transport: every seat is in this page (solo, pass-and-play). A message sent is given
// to every listener at once, in order. Online rooms (task #616) add net/room.js with this same
// interface: send(msg), onMessage(cb) and peers(). The engine and the games don't change.

/** @param {{name: string, kind: string}[]} seats */
export function createLocal(seats) {
  const listeners = new Set();
  return {
    kind: "local",
    send(msg) {
      for (const cb of [...listeners]) cb(msg);
    },
    /** Listen to every message; returns a function that stops listening. */
    onMessage(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    peers() {
      return seats.map((s, seat) => ({ seat, name: s.name, kind: s.kind }));
    },
  };
}
