// The room's rules (change 0002), as plain functions over its stored `meta`, so the unit tests
// cover them in Node. src/worker/objects/room.ts holds the sockets and storage, and calls these.
// The room relays: it checks only each message's envelope (type, size, sender, rate) and never
// reads a game's moves, views or snapshot. The host device's engine runs the rules.
import type { Level } from "./checks";

export const PROTOCOL = 1;
export const CAPS = {
  seats: 8,
  spectators: 8,
  /** Sockets at once, joined or not, so unjoined sockets can't fill a room either. */
  sockets: 24,
  /** Bytes per message; the host's `state` may be bigger. */
  message: 4 * 1024,
  state: 32 * 1024,
  /** Messages a second from one socket. */
  rate: 20,
} as const;
/** A room ends 6 hours after it starts, or 10 minutes after its last device leaves. */
export const LIFETIME_MS = 6 * 60 * 60 * 1000;
export const EMPTY_MS = 10 * 60 * 1000;
/** The owner role passes to the next player when the owner's device is away this long. */
export const OWNER_WAIT_MS = 2 * 60 * 1000;

export type Seat = { nick: string; cpu: boolean; token: string | null };
export type Meta = {
  code: string;
  game: string;
  version: number;
  min: number;
  max: number;
  level: Level;
  /** The member who started it (shown only to the admin). */
  member: string;
  /** The SHA-256 of the member's owner token, which keeps seat 0; "" once that device leaves. */
  owner: string;
  created: number;
  expires: number;
  /** Each seat keeps the hash of its device's token. Seat 0 is the member's. */
  seats: Seat[];
  /** The seat with the owner's controls: seat 0 at first; it passes on (AC5.5). */
  ownerSeat: number;
  /** When the owner's device went away while other players stayed; null while it's here. */
  ownerAway: number | null;
  /** The people seated, as the Hub last heard it (it's told only of a change). */
  reported: number;
  /** The seat whose device runs the rules. */
  host: number | null;
  locked: boolean;
  /** When the current match started; null in the lobby. */
  started: number | null;
  /** The current match ended (and was recorded, once). */
  ended: boolean;
  /** Matches started in this room. */
  match: number;
};
/** The last state the host sent: kept so a device that comes back, or a new host, goes on. */
export type Snap = {
  seq: number;
  turn: number;
  views: Record<string, unknown>;
  public: unknown;
  snapshot: unknown;
};
/** What a socket is, kept on the socket so it survives hibernation. */
export type Who = { seat: number | null; table: boolean };

export type NewRoom = {
  code: string;
  game: string;
  version: number;
  players: [number, number];
  seats: number;
  cpu: number;
  level: Level;
  member: string;
  owner: string;
  now: number;
};

export function newMeta(r: NewRoom): Meta {
  return {
    code: r.code,
    game: r.game,
    version: r.version,
    min: Math.max(2, r.players[0]),
    max: Math.min(CAPS.seats, r.players[1]),
    level: r.level,
    member: r.member,
    owner: r.owner,
    created: r.now,
    expires: r.now + LIFETIME_MS,
    seats: Array.from({ length: r.seats }, (_, i) => ({
      nick: "",
      cpu: i >= r.seats - r.cpu,
      token: null,
    })),
    host: 0,
    locked: false,
    started: null,
    ended: false,
    match: 0,
    ownerSeat: 0,
    ownerAway: null,
    reported: 0,
  };
}

/** A room stored by 0.2.x, with the fields added since (a deploy keeps live rooms). */
export function upgrade(m: Meta): Meta {
  m.ownerSeat ??= 0;
  m.ownerAway ??= null;
  m.reported ??= -1;
  return m;
}

const playing = (m: Meta) => m.started !== null && !m.ended;
/** A seat a person holds: by its token, or seat 0 kept for the member's owner token. */
const held = (m: Meta, i: number) =>
  m.seats[i]?.token != null || (i === 0 && m.owner !== "" && !m.seats[0]?.cpu);

/** The people seated (not CPUs), as the admin's Rooms tab shows them. */
export const people = (m: Meta) => m.seats.filter((s) => !s.cpu && s.token !== null).length;

/** The room as everyone may see it: no tokens, no member. */
export function publicRoom(m: Meta, online: Set<number>, spectators: number) {
  return {
    code: m.code,
    game: m.game,
    version: m.version,
    level: m.level,
    min: m.min,
    max: m.max,
    seats: m.seats.map((s, i) => ({
      nick: s.cpu ? `CPU ${i + 1}` : s.nick,
      cpu: s.cpu,
      taken: s.cpu || held(m, i),
      online: online.has(i),
    })),
    host: m.host,
    owner: m.ownerSeat,
    ownerAway: m.ownerAway,
    locked: m.locked,
    started: m.started !== null,
    playing: playing(m),
    ended: m.ended,
    match: m.match,
    spectators,
    expires: m.expires,
  };
}

export type Hello = { nick: string; seat: string | null; owner: string | null; table: boolean };
export type Joined =
  | { ok: true; who: Who; newToken: boolean; owner: boolean }
  | { ok: false; reason: string };

/**
 * Where a device that says hello goes. `hello.seat` and `hello.owner` are the hashes of the tokens
 * it sent. A known token gets its seat back; the member's owner token, seat 0; a table or a late,
 * locked or full room, a spectator place. `newToken` means the caller gives the seat a new token.
 * A player who sits while nobody holds the owner's seat gets the owner role.
 */
export function join(m: Meta, hello: Hello, spectators: number): Joined {
  const spectate = (): Joined =>
    spectators >= CAPS.spectators
      ? { ok: false, reason: "This room is full." }
      : { ok: true, who: { seat: null, table: hello.table }, newToken: false, owner: false };
  const sit = (seat: number, newToken: boolean): Joined => {
    if (seat !== m.ownerSeat && !held(m, m.ownerSeat)) m.ownerSeat = seat;
    if (seat === m.ownerSeat) m.ownerAway = null;
    return { ok: true, who: { seat, table: false }, newToken, owner: seat === m.ownerSeat };
  };
  if (hello.table) return spectate();
  if (hello.owner && m.owner && hello.owner === m.owner) {
    const first = m.seats[0] as Seat;
    first.nick = hello.nick;
    first.token = hello.owner;
    return sit(0, false);
  }
  const mine = hello.seat ? m.seats.findIndex((s) => s.token === hello.seat) : -1;
  if (mine >= 0) return sit(mine, false);
  if (m.locked || playing(m)) return spectate();
  const free = m.seats.findIndex((s, i) => !s.cpu && !held(m, i));
  if (free < 0) return spectate();
  (m.seats[free] as Seat).nick = hello.nick;
  return sit(free, true);
}

/** Open a seat. Seat 0 stops being kept for the member's owner token. */
function free(m: Meta, seat: number): void {
  const s = m.seats[seat] as Seat;
  s.token = null;
  s.nick = "";
  if (seat === 0) m.owner = "";
}

/**
 * A player taps Leave the room (AC5.5): the seat opens, and when it was the owner's, the role
 * passes to the next online player (it stays put when nobody else is here).
 */
export function leave(m: Meta, seat: number, online: Set<number>): void {
  free(m, seat);
  if (seat !== m.ownerSeat) return;
  const others = new Set([...online].filter((s) => s !== seat));
  m.ownerSeat = nextHost(m, others, seat) ?? seat;
  m.ownerAway = null;
}

/**
 * The owner's device dropped (a closed tab, a sleeping phone; not Leave). When another player is
 * still here, the wait starts: the role passes after OWNER_WAIT_MS unless the owner comes back.
 * Returns whether `m` changed.
 */
export function ownerDropped(m: Meta, online: Set<number>, now: number): boolean {
  if (online.has(m.ownerSeat) || m.ownerAway !== null) return false;
  if (nextHost(m, online, m.ownerSeat) === null) return false;
  m.ownerAway = now;
  return true;
}

/** At the room's alarm: the wait is over, so the next online player gets the owner role. */
export function ownerDue(m: Meta, online: Set<number>, now: number): boolean {
  if (m.ownerAway === null || now < m.ownerAway + OWNER_WAIT_MS) return false;
  m.ownerAway = null;
  if (!online.has(m.ownerSeat)) m.ownerSeat = nextHost(m, online, m.ownerSeat) ?? m.ownerSeat;
  return true;
}

/** Make me the owner (AC5.5): a player takes the role while the owner's device is away. */
export function takeOwner(m: Meta, seat: number | null, online: Set<number>): string | null {
  if (seat === null) return "Only a player can be the owner.";
  if (seat !== m.ownerSeat && online.has(m.ownerSeat)) return "The owner is here.";
  m.ownerSeat = seat;
  m.ownerAway = null;
  return null;
}

export type OwnerOp =
  | { op: "start" | "rematch" | "lock" | "unlock" | "close" }
  | { op: "kick"; seat: number }
  | { op: "cpu"; seat: number; on: boolean }
  | { op: "size"; seats: number };

/** What the room does after an owner's control. */
export type Done =
  | { ok: true; start?: boolean; kick?: number; close?: boolean }
  | { ok: false; reason: string };

const seatIndex = (m: Meta, seat: unknown) =>
  Number.isInteger(seat) && (seat as number) >= 0 && (seat as number) < m.seats.length;

/** Apply a room owner's control to `m` (AC5.3). Only the owner's socket may call it. */
export function ownerOp(
  m: Meta,
  msg: Record<string, unknown>,
  now: number,
  online: Set<number>,
): Done {
  switch (msg.op) {
    case "start":
    case "rematch": {
      if (playing(m)) return { ok: false, reason: "A match is on." };
      const empty = m.seats.findIndex((s, i) => !s.cpu && !held(m, i));
      if (empty >= 0)
        return {
          ok: false,
          reason: `Seat ${empty + 1} is empty: wait for a player, or make it a CPU.`,
        };
      m.started = now;
      m.ended = false;
      m.match += 1;
      if (m.host === null || !online.has(m.host))
        m.host = online.has(m.ownerSeat) ? m.ownerSeat : (nextHost(m, online, null) ?? m.ownerSeat);
      return { ok: true, start: true };
    }
    case "lock":
    case "unlock":
      m.locked = msg.op === "lock";
      return { ok: true };
    case "close":
      return { ok: true, close: true };
    case "kick": {
      if (!seatIndex(m, msg.seat)) return { ok: false, reason: "No such seat." };
      const i = msg.seat as number;
      if (i === m.ownerSeat) return { ok: false, reason: "That's your seat." };
      if (m.seats[i]?.cpu || !held(m, i)) return { ok: false, reason: "Nobody sits there." };
      free(m, i);
      return { ok: true, kick: i };
    }
    case "cpu": {
      if (playing(m)) return { ok: false, reason: "Change seats between matches." };
      if (!seatIndex(m, msg.seat)) return { ok: false, reason: "No such seat." };
      const i = msg.seat as number;
      if (i === m.ownerSeat) return { ok: false, reason: "That's your seat." };
      if (held(m, i)) return { ok: false, reason: "Someone sits there." };
      (m.seats[i] as Seat).cpu = msg.on === true;
      return { ok: true };
    }
    case "size": {
      if (playing(m)) return { ok: false, reason: "Change seats between matches." };
      const n = msg.seats;
      if (!Number.isInteger(n) || (n as number) < m.min || (n as number) > m.max)
        return { ok: false, reason: `Seats must be ${m.min} to ${m.max}.` };
      while (m.seats.length < (n as number)) m.seats.push({ nick: "", cpu: true, token: null });
      while (m.seats.length > (n as number)) {
        if (held(m, m.seats.length - 1))
          return { ok: false, reason: "Kick the last player first." };
        m.seats.pop();
      }
      return { ok: true };
    }
    default:
      return { ok: false, reason: "Unknown control." };
  }
}

/** The next seat, after `from`, whose device is online, to run the rules; null if none. */
export function nextHost(m: Meta, online: Set<number>, from: number | null): number | null {
  const n = m.seats.length;
  const start = from ?? -1;
  for (let k = 1; k <= n; k++) {
    const seat = (((start + k) % n) + n) % n;
    if (online.has(seat) && !m.seats[seat]?.cpu) return seat;
  }
  return null;
}

/** Why a move from `seat` is refused before it reaches the host (AC6.3), or null to pass it on. */
export function checkMove(
  m: Meta,
  snap: Snap | null,
  seat: number | null,
  seq: unknown,
): string | null {
  if (seat === null) return "Spectators can't move.";
  if (!playing(m) || !snap) return "The match hasn't started.";
  if (seq !== snap.seq) return "The board changed. Try again.";
  if (seat !== snap.turn) {
    const who = m.seats[snap.turn];
    return `It's ${who?.cpu ? `CPU ${snap.turn + 1}` : who?.nick || `seat ${snap.turn + 1}`}'s turn.`;
  }
  return null;
}

/** The types each sender may send. */
const FROM_ANY = new Set(["hello", "move", "take-host", "take-owner", "leave", "owner"]);
const FROM_HOST = new Set(["state", "refused", "end", "crash"]);

export type Envelope =
  | { ok: true; msg: Record<string, unknown> }
  | { ok: false; code: string; text: string };

/** Parse and check a message's envelope: size, JSON, protocol and type. Never reads its data. */
export function envelope(raw: string | ArrayBuffer, isHost: boolean): Envelope {
  if (typeof raw !== "string") return { ok: false, code: "bad", text: "Send text messages." };
  const size = new TextEncoder().encode(raw).length;
  if (size > CAPS.state) return { ok: false, code: "big", text: "That message is too big." };
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { ok: false, code: "bad", text: "That message isn't JSON." };
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg))
    return { ok: false, code: "bad", text: "That message isn't an object." };
  if (msg.v !== PROTOCOL)
    return { ok: false, code: "version", text: "This app is out of date. Reload to update." };
  const t = msg.t as string;
  if (!FROM_ANY.has(t) && !(isHost && FROM_HOST.has(t)))
    return { ok: false, code: "bad", text: "That message isn't allowed." };
  if (size > CAPS.message && t !== "state")
    return { ok: false, code: "big", text: "That message is too big." };
  return { ok: true, msg };
}

/** A per-socket rate limit: a fixed one-second window. Returns false when over. */
export function allow(window: { at: number; count: number }, now: number): boolean {
  if (now - window.at >= 1000) {
    window.at = now;
    window.count = 0;
  }
  window.count += 1;
  return window.count <= CAPS.rate;
}

export type MatchRecord = {
  game: string;
  at: number;
  players: string[];
  places: number[][];
  secs: number;
  seats: number;
  cpu: number;
  /** The sole human winner's nickname, for the top players; null for a CPU win or a tie. */
  winner: string | null;
};

/** The places the host sent, if they're a fair list of seat groups for this room. */
export function validPlaces(m: Meta, places: unknown): number[][] | null {
  if (!Array.isArray(places) || !places.length) return null;
  const seen = new Set<number>();
  for (const group of places) {
    if (!Array.isArray(group) || !group.length) return null;
    for (const seat of group) {
      if (!Number.isInteger(seat) || seat < 0 || seat >= m.seats.length || seen.has(seat))
        return null;
      seen.add(seat);
    }
  }
  return seen.size === m.seats.length ? (places as number[][]) : null;
}

/** The match, as the Hub records it once when it ends (AC7.1). */
export function matchRecord(m: Meta, places: number[][], now: number): MatchRecord {
  const players = m.seats.map((s, i) => (s.cpu ? `CPU ${i + 1}` : s.nick));
  const first = places[0] ?? [];
  const solo = first.length === 1 ? m.seats[first[0] as number] : undefined;
  return {
    game: m.game,
    at: now,
    players,
    places,
    secs: Math.max(0, Math.round((now - (m.started ?? now)) / 1000)),
    seats: m.seats.length,
    cpu: m.seats.filter((s) => s.cpu).length,
    winner: solo && !solo.cpu ? solo.nick : null,
  };
}

/**
 * When the room's one alarm should ring: its end, 10 minutes after it empties, or sooner when the
 * owner's wait is over.
 */
export function alarmAt(m: Meta, sockets: number, now: number): number {
  const end = sockets > 0 ? m.expires : Math.min(m.expires, now + EMPTY_MS);
  return m.ownerAway === null ? end : Math.min(end, m.ownerAway + OWNER_WAIT_MS);
}
