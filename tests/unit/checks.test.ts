// The API's input checks (change 0002): codes, nicknames, room requests, the catalogue, origins
// and body size.
import { describe, expect, it } from "vitest";
import {
  ALPHABET,
  CODE_RE,
  catalogUpdate,
  hashToken,
  MAX_BODY,
  newCode,
  newToken,
  nick,
  readJson,
  roomRequest,
  sameOrigin,
} from "../../src/worker/checks";

describe("room codes", () => {
  it("are 6 of 31 letters and digits with no look-alikes", () => {
    expect(ALPHABET).toHaveLength(31);
    expect(ALPHABET).not.toMatch(/[01IOL]/);
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(CODE_RE);
  });

  it("skip bytes that would favour the first letters", () => {
    const bytes = [new Uint8Array(12).fill(250), new Uint8Array(12).fill(31 + 2)];
    expect(newCode(() => bytes.shift() ?? new Uint8Array(12))).toBe("CCCCCC");
  });
});

describe("tokens", () => {
  it("are random hex, kept only as a SHA-256", async () => {
    const token = newToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(newToken()).not.toBe(token);
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("nicknames", () => {
  it("are 1 to 16 characters, trimmed, with no control characters", () => {
    expect(nick("  Ana ")).toBe("Ana");
    expect(nick("A\u0000na")).toBe("Ana");
    expect(nick("😀".repeat(16))).toBe("😀".repeat(16));
    expect(nick("x".repeat(17))).toBeNull();
    expect(nick("   ")).toBeNull();
    expect(nick(7)).toBeNull();
  });
});

describe("a room request", () => {
  const ok = { game: "crazy-eights", version: 1, seats: 4, cpu: 2, level: "hard" };
  it("is a known game at this version, seats in its range, CPU seats and a level", () => {
    expect(roomRequest(ok)).toEqual({ game: "crazy-eights", seats: 4, cpu: 2, level: "hard" });
    expect(roomRequest({ game: "four-in-a-row", version: 1, seats: 2 })).toEqual({
      game: "four-in-a-row",
      seats: 2,
      cpu: 0,
      level: "normal",
    });
  });

  it.each([
    [{ ...ok, game: "chess" }, "Unknown game."],
    [{ ...ok, version: 0 }, "This app is out of date. Reload to update."],
    [{ ...ok, seats: 7 }, "Seats must be 2 to 6."],
    [{ ...ok, seats: 1.5 }, "Seats must be 2 to 6."],
    [{ ...ok, game: "four-in-a-row", seats: 3 }, "Seats must be 2."],
    [{ ...ok, game: "memory", seats: 1 }, "Seats must be 2 to 4."],
    [{ ...ok, cpu: 4 }, "CPU seats must leave a seat for you."],
    [{ ...ok, cpu: -1 }, "CPU seats must leave a seat for you."],
    [{ ...ok, level: "best" }, "Unknown CPU level."],
    [null, "Unknown game."],
  ])("refuses %j", (body, reason) => {
    expect(roomRequest(body)).toBe(reason);
  });
});

describe("the admin's catalogue", () => {
  it("is each known game once, with on, featured and an order", () => {
    const rows = [
      { game: "ludo", enabled: true, featured: true, sort: 0 },
      { game: "memory", enabled: false, featured: false, sort: 1 },
    ];
    expect(catalogUpdate(rows)).toEqual(rows);
    expect(catalogUpdate({})).toBe("Send a list of games.");
    expect(catalogUpdate([rows[0], rows[0]])).toBe("Each game once, from the game list.");
    expect(catalogUpdate([{ ...rows[0], game: "chess" }])).toBe(
      "Each game once, from the game list.",
    );
    expect(catalogUpdate([{ ...rows[0], enabled: 1 }])).toBe("On and featured are true or false.");
    expect(catalogUpdate([{ ...rows[0], sort: "1" }])).toBe("The order is a whole number.");
  });
});

describe("requests", () => {
  it("are from this app only when Origin is this app's", () => {
    const url = "https://games.example/api/member/rooms";
    expect(sameOrigin(new Request(url, { headers: { origin: "https://games.example" } }))).toBe(
      true,
    );
    expect(sameOrigin(new Request(url, { headers: { origin: "https://evil.example" } }))).toBe(
      false,
    );
    expect(sameOrigin(new Request(url))).toBe(false);
  });

  it("have a JSON body of at most 2 KB", async () => {
    const post = (body: string, headers: Record<string, string> = {}) =>
      new Request("https://games.example/", { method: "POST", body, headers });
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(post("x".repeat(MAX_BODY + 1)))).toEqual(new Error("too_big"));
    expect(await readJson(post("{}", { "content-length": "99999" }))).toEqual(new Error("too_big"));
    expect(await readJson(post("{"))).toEqual(new Error("bad_json"));
  });
});
