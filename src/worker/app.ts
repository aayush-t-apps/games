// App-owned: add this app's routes here. Platform behaviour (/health, logging, request ids,
// /.well-known/shipify.json, asset fallback) comes from src/shared/platform.ts.
// Games runs every game in the browser. The Worker serves only online play (change 0002) and the
// admin page's data (change 0003): rooms (one Room object per code) and the Hub (one object).
import type { Context, Next } from "hono";
import { createApp, type PlatformEnv, type PlatformVars } from "../shared/platform";
import { type AccessEnv, accessReady, type Caller, checkAccess, isAdmin, isLocal } from "./access";
import {
  CODE_RE,
  catalogUpdate,
  gameById,
  hashToken,
  newCode,
  newToken,
  readJson,
  roomRequest,
  sameOrigin,
} from "./checks";
import type { Hub, Room } from "./objects";
import { LIFETIME_MS, newMeta } from "./room-logic";

export interface Env extends PlatformEnv, AccessEnv {
  /** One Room per room code (src/worker/objects/room.ts). */
  ROOM: DurableObjectNamespace<Room>;
  /** The one Hub: catalogue, live rooms, matches (src/worker/objects/hub.ts). */
  HUB: DurableObjectNamespace<Hub>;
}

type C = Context<{ Bindings: Env; Variables: PlatformVars }>;

const hub = (env: Env) => env.HUB.getByName("hub");
const refuse = (
  c: C,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 426 | 503,
  error: string,
  text: string,
) => c.json({ error, text, requestId: c.get("requestId") }, status);

/** Who called each member or admin request, set by the gate below. */
const callers = new WeakMap<Request, Caller>();

/** The gate on /api/member/* and /api/admin/*: a valid Access token, the admin's email, and on a
 * write, this app's own origin (ADR 0001). */
function gate(admin: boolean) {
  return async (c: C, next: Next) => {
    const checked = await checkAccess(c.req.raw, c.env);
    if (!checked.ok)
      return checked.status === 503
        ? refuse(c, 503, "not_set_up", "Online play isn't set up yet.")
        : refuse(c, 401, "unauthorized", "Sign in to do that.");
    if (admin && !isAdmin(checked.caller, c.env))
      return refuse(c, 403, "forbidden", "This page is for the owner.");
    if (c.req.method !== "GET" && !sameOrigin(c.req.raw))
      return refuse(c, 403, "origin", "That request didn't come from this app.");
    callers.set(c.req.raw, checked.caller);
    await next();
  };
}

const caller = (c: C) => callers.get(c.req.raw) as Caller;

async function body(c: C): Promise<unknown | Response> {
  const parsed = await readJson(c.req.raw);
  if (parsed instanceof Error)
    return parsed.message === "too_big"
      ? refuse(c, 413, "too_big", "That request is too big.")
      : refuse(c, 400, "bad_json", "That request isn't JSON.");
  return parsed;
}

export const app = createApp<Env>((a) => {
  // ---------- Anyone ----------

  // The catalogue switches, cached 60 s at the edge: a change in /admin is live within a minute.
  a.get("/api/catalog", async (c) => {
    // Locally there's no edge: an admin change shows at once on `make dev`.
    const cache = typeof caches === "undefined" || isLocal(c.req.url) ? null : caches.default;
    const key = new Request(new URL("/api/catalog", c.req.url));
    const hit = await cache?.match(key);
    if (hit) return new Response(hit.body, hit);
    const res = Response.json(
      { games: await hub(c.env).catalog(), online: accessReady(c.req.raw, c.env) },
      { headers: { "cache-control": "public, max-age=60" } },
    );
    if (cache) c.executionCtx.waitUntil(cache.put(key, res.clone()));
    return res;
  });

  a.get("/api/scores", async (c) => {
    const game = gameById(c.req.query("game"));
    if (!game) return refuse(c, 400, "bad_request", "Unknown game.");
    return c.json(await hub(c.env).scores(game.id));
  });

  a.get("/api/rooms/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    const room = CODE_RE.test(code) ? await c.env.ROOM.getByName(code).info() : null;
    c.header("cache-control", "no-store");
    return room ? c.json(room) : refuse(c, 404, "ended", "This room has ended.");
  });

  a.get("/api/rooms/:code/ws", async (c) => {
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket")
      return refuse(c, 426, "websocket_only", "Connect with a WebSocket.");
    if (!sameOrigin(c.req.raw))
      return refuse(c, 403, "origin", "That request didn't come from this app.");
    const code = c.req.param("code").toUpperCase();
    if (!CODE_RE.test(code)) return refuse(c, 404, "ended", "This room has ended.");
    return c.env.ROOM.getByName(code).fetch(c.req.raw);
  });

  // ---------- Members ----------

  a.use("/api/member/*", gate(false));

  a.get("/api/member/me", (c) => {
    c.header("cache-control", "no-store");
    return c.json({ email: caller(c).email, admin: isAdmin(caller(c), c.env) });
  });

  a.post("/api/member/rooms", async (c) => {
    const b = await body(c);
    if (b instanceof Response) return b;
    const r = roomRequest(b);
    if (typeof r === "string") return refuse(c, 400, "bad_request", r);
    const game = gameById(r.game) as NonNullable<ReturnType<typeof gameById>>;
    const ownerToken = newToken();
    const owner = await hashToken(ownerToken);
    const member = caller(c).email;
    // Codes are rarely taken; three tries is plenty.
    for (let i = 0; i < 3; i++) {
      const code = newCode();
      const now = Date.now();
      const allowed = await hub(c.env).allowRoom({
        code,
        game: game.id,
        member,
        expires: now + LIFETIME_MS,
      });
      if (allowed === "off") return refuse(c, 409, "off", "This game is turned off.");
      if (allowed === "taken") continue;
      const meta = newMeta({
        ...r,
        code,
        version: game.version,
        players: game.players,
        member,
        owner,
        now,
      });
      await c.env.ROOM.getByName(code).init(meta);
      return c.json({ code, ownerToken }, 201);
    }
    return refuse(c, 503, "busy", "Online play is busy, try later.");
  });

  // ---------- The admin (change 0003) ----------

  a.use("/api/admin/*", gate(true));

  a.get("/api/admin/stats", async (c) => c.json(await hub(c.env).stats()));

  a.get("/api/admin/catalog", async (c) => c.json(await hub(c.env).catalog()));

  a.put("/api/admin/catalog", async (c) => {
    const b = await body(c);
    if (b instanceof Response) return b;
    const rows = catalogUpdate(b);
    if (typeof rows === "string") return refuse(c, 400, "bad_request", rows);
    await hub(c.env).setCatalog(rows);
    return c.json(rows);
  });

  a.get("/api/admin/rooms", async (c) => c.json(await hub(c.env).liveRooms()));

  a.delete("/api/admin/rooms/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!CODE_RE.test(code)) return refuse(c, 404, "ended", "This room has ended.");
    await c.env.ROOM.getByName(code).close();
    await hub(c.env).unlist(code);
    return c.json({ closed: code });
  });

  a.get("/api/admin/export", async (c) => {
    c.header("content-disposition", 'attachment; filename="games-hub.json"');
    return c.json(await hub(c.env).export());
  });
});
