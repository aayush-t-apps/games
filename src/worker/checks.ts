// Input checks for the API (change 0002): known games, seats, nicknames, body size, same origin,
// room codes. Plain functions, so the unit tests cover every branch.
import list from "../../site/games/index.json";

export type GameInfo = { id: string; version: number; players: [number, number] };
export const GAMES: GameInfo[] = list.map((g) => ({
  id: g.id,
  version: g.version,
  players: [g.players[0] ?? 1, g.players[1] ?? 1],
}));
export const gameById = (id: unknown) => GAMES.find((g) => g.id === id);

export const LEVELS = ["easy", "normal", "hard"] as const;
export type Level = (typeof LEVELS)[number];
/** A room has 2 to 8 seats, within the game's own range. */
export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const MAX_BODY = 2048;

/** 31 letters and digits with no look-alikes (no 0/O, 1/I/L). */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;

/** A new room code: 6 characters, each from ALPHABET with no bias. */
export function newCode(random: (n: number) => Uint8Array = randomBytes): string {
  let code = "";
  while (code.length < 6) {
    for (const b of random(12)) {
      // 248 = 31 × 8: a byte at or above it would favour the first letters.
      if (b < 248 && code.length < 6) code += ALPHABET[b % 31];
    }
  }
  return code;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** A random token for a seat or the owner (hex, 128 bits). */
export function newToken(): string {
  return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The SHA-256 of a token, as hex: rooms keep only this. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A nickname of 1 to 16 characters, with no control characters, or null. */
export function nick(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const chars = [...clean];
  return chars.length >= 1 && chars.length <= 16 ? clean : null;
}

export type RoomRequest = { game: string; seats: number; cpu: number; level: Level };

/** A request to start a room: `{game, version, seats, cpu, level}`, or the reason it's refused. */
export function roomRequest(body: unknown): RoomRequest | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const game = gameById(b.game);
  if (!game) return "Unknown game.";
  if (b.version !== game.version) return "This app is out of date. Reload to update.";
  const min = Math.max(MIN_SEATS, game.players[0]);
  const max = Math.min(MAX_SEATS, game.players[1]);
  const seats = b.seats;
  if (!Number.isInteger(seats) || (seats as number) < min || (seats as number) > max)
    return `Seats must be ${min === max ? min : `${min} to ${max}`}.`;
  const cpu = b.cpu ?? 0;
  if (!Number.isInteger(cpu) || (cpu as number) < 0 || (cpu as number) >= (seats as number))
    return "CPU seats must leave a seat for you.";
  const level = b.level ?? "normal";
  if (!LEVELS.includes(level as Level)) return "Unknown CPU level.";
  return { game: game.id, seats: seats as number, cpu: cpu as number, level: level as Level };
}

export type CatalogRow = { game: string; enabled: boolean; featured: boolean; sort: number };

/** The admin's catalogue: one row per known game, at most once each. */
export function catalogUpdate(body: unknown): CatalogRow[] | string {
  if (!Array.isArray(body)) return "Send a list of games.";
  const seen = new Set<string>();
  const rows: CatalogRow[] = [];
  for (const item of body as Record<string, unknown>[]) {
    const game = gameById(item?.game);
    if (!game || seen.has(game.id)) return "Each game once, from the game list.";
    if (typeof item.enabled !== "boolean" || typeof item.featured !== "boolean")
      return "On and featured are true or false.";
    if (!Number.isInteger(item.sort)) return "The order is a whole number.";
    seen.add(game.id);
    rows.push({
      game: game.id,
      enabled: item.enabled,
      featured: item.featured,
      sort: item.sort as number,
    });
  }
  return rows;
}

/** How far back Cloudflare keeps the Hub's history (point-in-time recovery). */
export const RESTORE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type RestoreRequest = { at: number } | { bookmark: string };

/**
 * A restore of the Hub (AC8.8): `{at}`, a time in ms within the last 30 days and not in the
 * future, or `{bookmark}`, the one an earlier restore gave to undo it; or the reason it's refused.
 */
export function restoreRequest(body: unknown, now: number): RestoreRequest | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.bookmark === "string")
    return /^[\w-]{1,256}$/.test(b.bookmark) ? { bookmark: b.bookmark } : "Unknown bookmark.";
  const at = b.at;
  if (!Number.isInteger(at)) return "Pick a date and time.";
  if ((at as number) > now) return "Pick a time in the past.";
  // A minute's margin, so a time picked on the page as "30 days ago" still works.
  if ((at as number) < now - RESTORE_DAYS * DAY + 60_000)
    return `Cloudflare keeps the last ${RESTORE_DAYS} days.`;
  return { at: at as number };
}

/** A write or a WebSocket must come from this app's own pages. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(req.url).origin;
}

/** The JSON body, at most MAX_BODY bytes; an Error when it's too big or not JSON. */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return new Error("too_big");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return new Error("too_big");
  try {
    return JSON.parse(text);
  } catch {
    return new Error("bad_json");
  }
}
