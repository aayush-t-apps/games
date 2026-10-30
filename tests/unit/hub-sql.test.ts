// The Hub's queries (AC7.1, AC7.2, AC8.1–AC8.4) on Node's SQLite, the same SQL the Hub runs.
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import * as hub from "../../src/worker/hub-sql";
import type { MatchRecord } from "../../src/worker/room-logic";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 31, 15);
let sql: hub.Sql;

beforeEach(() => {
  const db = new DatabaseSync(":memory:");
  sql = (query, ...bindings) => db.prepare(query).all(...bindings) as hub.Row[];
  hub.migrate(sql);
  hub.migrate(sql);
});

const match = (o: Partial<MatchRecord> = {}): MatchRecord => ({
  game: "four-in-a-row",
  at: NOW,
  players: ["Ana", "Sam"],
  places: [[0], [1]],
  secs: 120,
  seats: 2,
  cpu: 0,
  winner: "Ana",
  ...o,
});

describe("the catalogue", () => {
  it("is empty at first (every game on), and takes the admin's switches whole", () => {
    expect(hub.catalog(sql)).toEqual([]);
    expect(hub.isOn(sql, "ludo")).toBe(true);
    hub.setCatalog(sql, [
      { game: "memory", enabled: false, featured: false, sort: 1 },
      { game: "ludo", enabled: true, featured: true, sort: 0 },
    ]);
    expect(hub.catalog(sql).map((r) => r.game)).toEqual(["ludo", "memory"]);
    expect(hub.isOn(sql, "memory")).toBe(false);
    hub.setCatalog(sql, []);
    expect(hub.isOn(sql, "memory")).toBe(true);
  });
});

describe("live rooms", () => {
  const room = {
    code: "AAAAAA",
    game: "ludo",
    member: "ana@example.com",
    now: NOW,
    expires: NOW + DAY,
  };

  it("lists a room once, refuses a game that's off and a live code", () => {
    expect(hub.allowRoom(sql, room)).toBe("ok");
    expect(hub.allowRoom(sql, room)).toBe("taken");
    hub.setCatalog(sql, [{ game: "memory", enabled: false, featured: false, sort: 0 }]);
    expect(hub.allowRoom(sql, { ...room, code: "BBBBBB", game: "memory" })).toBe("off");
    hub.seated(sql, "AAAAAA", 3);
    expect(hub.liveRooms(sql, NOW)).toEqual([
      {
        code: "AAAAAA",
        game: "ludo",
        member: "ana@example.com",
        started: NOW,
        expires: NOW + DAY,
        players: 3,
      },
    ]);
  });

  it("adds the players column to a Hub that 0.2.x made, once", () => {
    const db = new DatabaseSync(":memory:");
    const old: hub.Sql = (query, ...bindings) => db.prepare(query).all(...bindings) as hub.Row[];
    old(`CREATE TABLE rooms (code TEXT PRIMARY KEY, game TEXT NOT NULL, member TEXT NOT NULL,
      started INTEGER NOT NULL, expires INTEGER NOT NULL)`);
    old("INSERT INTO rooms VALUES ('AAAAAA', 'ludo', 'a@b.c', 1, ?)", NOW + DAY);
    hub.migrate(old);
    hub.migrate(old);
    expect(hub.liveRooms(old, NOW)[0]?.players).toBe(0);
  });

  it("skips and clears rooms past their end, and unlists", () => {
    hub.allowRoom(sql, room);
    expect(hub.liveRooms(sql, NOW + DAY)).toEqual([]);
    expect(hub.allowRoom(sql, { ...room, now: NOW + DAY })).toBe("ok");
    hub.unlist(sql, "AAAAAA");
    expect(hub.liveRooms(sql, NOW)).toEqual([]);
  });
});

describe("scores (AC7.2)", () => {
  it("rank human winners, and list the last 20 matches, newest first", () => {
    hub.record(sql, match());
    hub.record(sql, match({ at: NOW + 1, winner: "Sam", places: [[1], [0]] }));
    hub.record(sql, match({ at: NOW + 2 }));
    hub.record(sql, match({ at: NOW + 3, winner: null }));
    hub.record(sql, match({ game: "ludo", winner: "Lou" }));
    for (let i = 0; i < 20; i++) hub.record(sql, match({ at: NOW - DAY - i, winner: null }));
    const s = hub.scores(sql, "four-in-a-row");
    expect(s.top).toEqual([
      { nick: "Ana", wins: 2 },
      { nick: "Sam", wins: 1 },
    ]);
    expect(s.recent).toHaveLength(20);
    expect(s.recent[0]).toEqual({
      at: NOW + 3,
      players: ["Ana", "Sam"],
      places: [[0], [1]],
      secs: 120,
    });
  });
});

describe("the Overview (AC8.1)", () => {
  it("counts matches per game in 7 and 30 days, today, lengths, players and the last match", () => {
    hub.allowRoom(sql, {
      code: "AAAAAA",
      game: "ludo",
      member: "ana@example.com",
      now: NOW,
      expires: NOW + DAY,
    });
    hub.record(sql, match({ secs: 100 }));
    hub.record(sql, match({ at: NOW - 3 * DAY, secs: 200, seats: 3, cpu: 1 }));
    hub.record(sql, match({ at: NOW - 20 * DAY, secs: 300 }));
    hub.record(sql, match({ game: "memory", at: NOW - 90 * DAY }));
    const s = hub.stats(sql, NOW);
    expect(s.live).toHaveLength(1);
    expect(s.today).toBe(1);
    expect(s.games).toEqual([
      { game: "four-in-a-row", d7: 2, d30: 3, avgSecs: 200, avgSeats: 2.3, withCpu: 1, today: 1 },
    ]);
    expect(s.last).toEqual({ "four-in-a-row": NOW, memory: NOW - 90 * DAY });
  });
});

describe("the export (AC8.4)", () => {
  it("has the catalogue, live rooms and every match", () => {
    hub.setCatalog(sql, [{ game: "ludo", enabled: true, featured: true, sort: 0 }]);
    hub.record(sql, match());
    hub.record(sql, match({ winner: null }));
    const all = hub.exportAll(sql, NOW);
    expect(all.format).toBe("games-hub.v1");
    expect(all.at).toBe(new Date(NOW).toISOString());
    expect(all.catalog).toHaveLength(1);
    expect(all.matches.map((m) => [m.id, m.winner])).toEqual([
      [1, "Ana"],
      [2, null],
    ]);
  });
});
