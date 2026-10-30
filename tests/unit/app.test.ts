// App-owned: tests for this app's own routes (src/worker/app.ts), in Node, with stand-ins for the
// Room and Hub objects (tests/unit/objects.test.ts runs the real ones). The gate (ADR 0001,
// AC5.4, AC8.5) is checked here on a public host, where Access must be set up.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeys, TOKEN_HEADER } from "../../src/worker/access";
import { app, type Env } from "../../src/worker/app";

type Call = [string, ...unknown[]];
let calls: Call[];
let allow: string;
let restoreFails: boolean;

/** A stand-in object: each call is noted; an answer that's a function runs (it may throw). */
const stub = (name: string, answers: Record<string, unknown> = {}) =>
  new Proxy(
    {},
    {
      get:
        (_, method: string) =>
        (...args: unknown[]) => {
          calls.push([`${name}.${method}`, ...args]);
          const answer = answers[method];
          if (typeof answer === "function") return Promise.resolve().then(answer as () => unknown);
          return Promise.resolve(method in answers ? answer : null);
        },
    },
  );

const env = (more: Partial<Env> = {}): Env =>
  ({
    APP_ID: "games",
    APP_ENV: "test",
    GIT_SHA: "abc1234",
    ROOM: {
      getByName: (code: string) =>
        stub(`room:${code}`, { info: code === "K7M2QX" ? { code } : null }),
    },
    HUB: {
      getByName: () =>
        stub("hub", {
          allowRoom: allow,
          catalog: [],
          scores: { top: [] },
          stats: { live: [] },
          liveRooms: [],
          export: { format: "games-hub.v1" },
          restore: () => {
            if (restoreFails) throw new Error("bad bookmark");
            return { undo: "before" };
          },
          // As ctx.abort() does: the restart's own call fails.
          restart: () => {
            throw new Error("restore");
          },
        }),
    },
    ...more,
  }) as unknown as Env;

const LOCAL = "http://localhost";
const PUBLIC = "https://games.example";

beforeEach(() => {
  calls = [];
  allow = "ok";
  restoreFails = false;
  resetKeys();
});

describe("public routes", () => {
  it("answers /health", async () => {
    expect((await app.request("/health", {}, env())).status).toBe(200);
  });

  it("gives the catalogue and whether online play is set up", async () => {
    const local = await app.request(`${LOCAL}/api/catalog`, {}, env());
    expect(await local.json()).toEqual({ games: [], online: true });
    expect(local.headers.get("cache-control")).toBe("public, max-age=60");
    const off = await app.request(`${PUBLIC}/api/catalog`, {}, env());
    expect(await off.json()).toEqual({ games: [], online: false });
  });

  it("gives a known game's scores", async () => {
    expect((await app.request("/api/scores?game=ludo", {}, env())).status).toBe(200);
    expect((await app.request("/api/scores?game=chess", {}, env())).status).toBe(400);
  });

  it("shows a live room, and says an unknown or ended one has ended (AC6.7)", async () => {
    expect(await (await app.request("/api/rooms/k7m2qx", {}, env())).json()).toEqual({
      code: "K7M2QX",
    });
    const gone = await app.request("/api/rooms/ABCDEF", {}, env());
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ text: "This room has ended." });
    expect((await app.request("/api/rooms/nope!", {}, env())).status).toBe(404);
  });

  it("passes a WebSocket from this app to its room, and nothing else", async () => {
    const ws = (code: string, headers: Record<string, string>) =>
      app.request(`${PUBLIC}/api/rooms/${code}/ws`, { headers }, env());
    expect((await ws("K7M2QX", { origin: PUBLIC })).status).toBe(426);
    expect(
      (await ws("K7M2QX", { upgrade: "websocket", origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await ws("K7M2QX", { upgrade: "websocket" })).status).toBe(403);
    expect((await ws("0OIL11", { upgrade: "websocket", origin: PUBLIC })).status).toBe(404);
    await ws("K7M2QX", { upgrade: "websocket", origin: PUBLIC });
    expect(calls.map((c) => c[0])).toEqual(["room:K7M2QX.fetch"]);
  });

  it("keeps a JSON 404 for unknown API paths", async () => {
    expect((await app.request("/api/info", {}, env())).status).toBe(404);
  });
});

describe("the gate (ADR 0001)", () => {
  const team = { ACCESS_TEAM: "games.cloudflareaccess.com", ACCESS_AUD: "aud" };

  it("is closed (503) on a public host until Access is set up", async () => {
    const res = await app.request(`${PUBLIC}/api/member/me`, {}, env());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "not_set_up" });
    expect((await app.request(`${PUBLIC}/api/admin/stats`, {}, env())).status).toBe(503);
  });

  it("refuses a member or admin call with no or a bad token, and changes nothing (AC5.4)", async () => {
    for (const path of ["/api/member/me", "/api/admin/stats"]) {
      expect((await app.request(`${PUBLIC}${path}`, {}, env(team))).status).toBe(401);
      const bad = { [TOKEN_HEADER]: "a.b.c" };
      expect((await app.request(`${PUBLIC}${path}`, { headers: bad }, env(team))).status).toBe(401);
    }
    const post = await app.request(
      `${PUBLIC}/api/member/rooms`,
      { method: "POST", headers: { origin: PUBLIC }, body: "{}" },
      env(team),
    );
    expect(post.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("lets a member in, and refuses a member who isn't ADMIN_EMAIL on /api/admin/* (AC8.5)", async () => {
    const key = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const jwk = { ...(await crypto.subtle.exportKey("jwk", key.publicKey)), kid: "k" };
    vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
    const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64url");
    const token = async (email: string) => {
      const head = b64(JSON.stringify({ alg: "RS256", kid: "k" }));
      const exp = Math.floor(Date.now() / 1000) + 60;
      const body = b64(
        JSON.stringify({ aud: ["aud"], iss: `https://${team.ACCESS_TEAM}`, exp, email }),
      );
      const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return { [TOKEN_HEADER]: `${head}.${body}.${b64(new Uint8Array(sig))}` };
    };
    const admin = env({ ...team, ADMIN_EMAIL: "ana@example.com" });
    try {
      const sam = await token("sam@example.com");
      expect(
        await (await app.request(`${PUBLIC}/api/member/me`, { headers: sam }, admin)).json(),
      ).toEqual({
        email: "sam@example.com",
        admin: false,
      });
      expect((await app.request(`${PUBLIC}/api/admin/stats`, { headers: sam }, admin)).status).toBe(
        403,
      );
      const ana = await token("ana@example.com");
      expect((await app.request(`${PUBLIC}/api/admin/stats`, { headers: ana }, admin)).status).toBe(
        200,
      );
      expect(
        (await app.request(`${PUBLIC}/api/admin/stats`, { headers: ana }, env(team))).status,
      ).toBe(403);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a write from another origin", async () => {
    const res = await app.request(
      `${LOCAL}/api/member/rooms`,
      { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" },
      env(),
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe("members (local developer)", () => {
  const post = (path: string, body: string, method = "POST") =>
    app.request(`${LOCAL}${path}`, { method, headers: { origin: LOCAL }, body }, env());
  const room = JSON.stringify({
    game: "four-in-a-row",
    version: 1,
    seats: 2,
    cpu: 1,
    level: "easy",
  });

  it("says who is signed in", async () => {
    const res = await app.request(`${LOCAL}/api/member/me`, {}, env());
    expect(await res.json()).toEqual({ email: "dev@localhost", admin: true });
  });

  it("starts a room: lists it in the Hub, then sets it up, and gives the code and owner token", async () => {
    const res = await post("/api/member/rooms", room);
    expect(res.status).toBe(201);
    const { code, ownerToken } = (await res.json()) as { code: string; ownerToken: string };
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(ownerToken).toMatch(/^[0-9a-f]{32}$/);
    expect(calls.map((c) => c[0])).toEqual(["hub.allowRoom", `room:${code}.init`]);
    const meta = calls[1]?.[1] as { member: string; owner: string; seats: unknown[] };
    expect(meta.member).toBe("dev@localhost");
    expect(meta.owner).not.toBe(ownerToken);
    expect(meta.seats).toHaveLength(2);
  });

  it("refuses a bad request, a big one, a game that's off, and gives up on taken codes", async () => {
    expect((await post("/api/member/rooms", "{")).status).toBe(400);
    expect((await post("/api/member/rooms", JSON.stringify({ game: "chess" }))).status).toBe(400);
    expect((await post("/api/member/rooms", "x".repeat(3000))).status).toBe(413);
    allow = "off";
    expect((await post("/api/member/rooms", room)).status).toBe(409);
    allow = "taken";
    expect((await post("/api/member/rooms", room)).status).toBe(503);
    expect(calls.filter((c) => c[0] === "hub.allowRoom")).toHaveLength(4);
  });

  it("lets the admin read and change the catalogue, close a room and export", async () => {
    const get = async (path: string) => (await app.request(`${LOCAL}${path}`, {}, env())).status;
    expect(await get("/api/admin/stats")).toBe(200);
    expect(await get("/api/admin/catalog")).toBe(200);
    expect(await get("/api/admin/rooms")).toBe(200);
    const exported = await app.request(`${LOCAL}/api/admin/export`, {}, env());
    expect(exported.headers.get("content-disposition")).toContain("games-hub.json");
    const rows = JSON.stringify([{ game: "ludo", enabled: false, featured: false, sort: 0 }]);
    expect((await post("/api/admin/catalog", rows, "PUT")).status).toBe(200);
    expect((await post("/api/admin/catalog", "[1]", "PUT")).status).toBe(400);
    expect((await post("/api/admin/catalog", "{", "PUT")).status).toBe(400);
    expect((await post("/api/admin/rooms/K7M2QX", "", "DELETE")).status).toBe(200);
    expect((await post("/api/admin/rooms/nope", "", "DELETE")).status).toBe(404);
    expect(calls.map((c) => c[0])).toContain("room:K7M2QX.close");
  });

  it("restores the Hub to a time, then starts it again, and gives the bookmark to undo (AC8.8)", async () => {
    const at = Date.now() - 60 * 60 * 1000;
    const res = await post("/api/admin/restore", JSON.stringify({ at }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ undo: "before" });
    expect(calls).toEqual([["hub.restore", { at }], ["hub.restart"]]);
    calls = [];
    expect((await post("/api/admin/restore", JSON.stringify({ bookmark: "b-1" }))).status).toBe(
      200,
    );
    expect(calls[0]).toEqual(["hub.restore", { bookmark: "b-1" }]);
  });

  it("refuses a restore out of range, and one Cloudflare can't do", async () => {
    const res = await post("/api/admin/restore", JSON.stringify({ at: Date.now() + 60_000 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ text: "Pick a time in the past." });
    expect(calls).toEqual([]);
    restoreFails = true;
    const bad = await post("/api/admin/restore", JSON.stringify({ bookmark: "nope" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "no_restore" });
    expect(calls.map((c) => c[0])).toEqual(["hub.restore"]);
  });
});
