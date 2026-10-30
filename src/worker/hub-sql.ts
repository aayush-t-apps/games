// The Hub's tables and queries (changes 0002 and 0003), as plain functions over one `sql` call, so
// the unit tests run them on Node's SQLite. src/worker/objects/hub.ts gives them the Hub's SQLite.
// The Hub is called when a room starts or ends, a list loads or the admin acts: never per move.
import type { CatalogRow } from "./checks";
import type { MatchRecord } from "./room-logic";

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;
export type Sql = (query: string, ...bindings: SqlValue[]) => Row[];

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS catalog (game TEXT PRIMARY KEY, enabled INTEGER NOT NULL,
    featured INTEGER NOT NULL, sort INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, game TEXT NOT NULL,
    member TEXT NOT NULL, started INTEGER NOT NULL, expires INTEGER NOT NULL,
    players INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, game TEXT NOT NULL,
    at INTEGER NOT NULL, players TEXT NOT NULL, places TEXT NOT NULL, secs INTEGER NOT NULL,
    seats INTEGER NOT NULL, cpu INTEGER NOT NULL, winner TEXT)`,
  "CREATE INDEX IF NOT EXISTS matches_game_at ON matches (game, at)",
];

const DAY = 24 * 60 * 60 * 1000;
const num = (v: SqlValue | undefined) => Number(v ?? 0);

export function migrate(sql: Sql): void {
  for (const statement of SCHEMA) sql(statement);
  // 0.3.0 added rooms.players: a Hub made by 0.2.x gets the column once (0.2.x code ignores it).
  if (!sql("PRAGMA table_info(rooms)").some((c) => c.name === "players"))
    sql("ALTER TABLE rooms ADD COLUMN players INTEGER NOT NULL DEFAULT 0");
}

/** The admin's switches. A game in the code with no row here is on, not featured. */
export function catalog(sql: Sql): CatalogRow[] {
  return sql("SELECT game, enabled, featured, sort FROM catalog ORDER BY sort, game").map((r) => ({
    game: String(r.game),
    enabled: num(r.enabled) === 1,
    featured: num(r.featured) === 1,
    sort: num(r.sort),
  }));
}

export function setCatalog(sql: Sql, rows: CatalogRow[]): void {
  sql("DELETE FROM catalog");
  for (const r of rows)
    sql(
      "INSERT INTO catalog (game, enabled, featured, sort) VALUES (?, ?, ?, ?)",
      r.game,
      r.enabled ? 1 : 0,
      r.featured ? 1 : 0,
      r.sort,
    );
}

export const isOn = (sql: Sql, game: string) =>
  num(sql("SELECT enabled FROM catalog WHERE game = ?", game)[0]?.enabled ?? 1) === 1;

export type Allow = "ok" | "off" | "taken";

/** List a new room, if its game is on and its code isn't live. */
export function allowRoom(
  sql: Sql,
  r: { code: string; game: string; member: string; now: number; expires: number },
): Allow {
  if (!isOn(sql, r.game)) return "off";
  sql("DELETE FROM rooms WHERE expires <= ?", r.now);
  if (sql("SELECT 1 FROM rooms WHERE code = ?", r.code).length) return "taken";
  sql(
    "INSERT INTO rooms (code, game, member, started, expires) VALUES (?, ?, ?, ?, ?)",
    r.code,
    r.game,
    r.member,
    r.now,
    r.expires,
  );
  return "ok";
}

export function unlist(sql: Sql, code: string): void {
  sql("DELETE FROM rooms WHERE code = ?", code);
}

/** The people seated in a room: the Room says so only when it changes. */
export function seated(sql: Sql, code: string, players: number): void {
  sql("UPDATE rooms SET players = ? WHERE code = ?", players, code);
}

export type LiveRoom = {
  code: string;
  game: string;
  member: string;
  started: number;
  expires: number;
  players: number;
};

/** Live rooms, newest first; a row past its end is skipped, in case a room missed its unlist. */
export function liveRooms(sql: Sql, now: number): LiveRoom[] {
  return sql(
    `SELECT code, game, member, started, expires, players FROM rooms WHERE expires > ?
     ORDER BY started DESC`,
    now,
  ).map((r) => ({
    code: String(r.code),
    game: String(r.game),
    member: String(r.member),
    started: num(r.started),
    expires: num(r.expires),
    players: num(r.players),
  }));
}

export function record(sql: Sql, m: MatchRecord): void {
  sql(
    `INSERT INTO matches (game, at, players, places, secs, seats, cpu, winner)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    m.game,
    m.at,
    JSON.stringify(m.players),
    JSON.stringify(m.places),
    m.secs,
    m.seats,
    m.cpu,
    m.winner,
  );
}

export type Played = { at: number; players: string[]; places: number[][]; secs: number };

const played = (r: Row): Played => ({
  at: num(r.at),
  players: JSON.parse(String(r.players)) as string[],
  places: JSON.parse(String(r.places)) as number[][],
  secs: num(r.secs),
});

/** A game's scoreboard (AC7.2): the top 10 players by wins, and the last 20 matches. */
export function scores(sql: Sql, game: string) {
  const top = sql(
    `SELECT winner AS nick, COUNT(*) AS wins FROM matches
     WHERE game = ? AND winner IS NOT NULL GROUP BY winner ORDER BY wins DESC, nick LIMIT 10`,
    game,
  ).map((r) => ({ nick: String(r.nick), wins: num(r.wins) }));
  const recent = sql(
    "SELECT at, players, places, secs FROM matches WHERE game = ? ORDER BY at DESC, id DESC LIMIT 20",
    game,
  ).map(played);
  return { game, top, recent };
}

/** Everything the admin's Overview shows (AC8.1), in one response: two queries over `matches`
 * (no stats table), the live rooms and the switches. */
export function stats(sql: Sql, now: number) {
  const today = now - (now % DAY);
  const games = sql(
    `SELECT game,
       SUM(at > ?) AS d7, COUNT(*) AS d30,
       ROUND(AVG(secs)) AS avgSecs, ROUND(AVG(seats), 1) AS avgSeats,
       SUM(cpu > 0) AS withCpu, SUM(at >= ?) AS today
     FROM matches WHERE at > ? GROUP BY game`,
    now - 7 * DAY,
    today,
    now - 30 * DAY,
  ).map((r) => ({
    game: String(r.game),
    d7: num(r.d7),
    d30: num(r.d30),
    avgSecs: num(r.avgSecs),
    avgSeats: num(r.avgSeats),
    withCpu: num(r.withCpu),
    today: num(r.today),
  }));
  const last = Object.fromEntries(
    sql("SELECT game, MAX(at) AS last FROM matches GROUP BY game").map((r) => [
      String(r.game),
      num(r.last),
    ]),
  );
  return {
    now,
    live: liveRooms(sql, now),
    today: games.reduce((n, g) => n + g.today, 0),
    /** Per game, matches in the last 30 days. */
    games,
    /** Per game, when it was last played online, at any time. */
    last,
    /** The switches, so the Overview shows which games are on. */
    catalog: catalog(sql),
  };
}

/** All Hub data, as one JSON object (AC8.4). */
export function exportAll(sql: Sql, now: number) {
  return {
    format: "games-hub.v1",
    at: new Date(now).toISOString(),
    catalog: catalog(sql),
    rooms: liveRooms(sql, now),
    matches: sql(
      "SELECT id, game, at, players, places, secs, seats, cpu, winner FROM matches ORDER BY id",
    ).map((r) => ({
      id: num(r.id),
      game: String(r.game),
      ...played(r),
      seats: num(r.seats),
      cpu: num(r.cpu),
      winner: r.winner === null ? null : String(r.winner),
    })),
  };
}
