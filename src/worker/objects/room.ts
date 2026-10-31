// A room (change 0002): one object per room code, `ROOM.getByName(code)`. It relays messages
// between the devices and the host device, keeps the seats (`meta`) and the host's last state
// (`snap`, one write per move), and sleeps between messages (hibernating WebSockets). Its rules
// are in ../room-logic.ts; it never reads a game's moves, views or snapshot.
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../app";
import { hashToken, newToken, nick } from "../checks";
import {
  alarmAt,
  allow,
  CAPS,
  checkMove,
  control,
  envelope,
  hostDropped,
  hostDue,
  join,
  leave,
  type Meta,
  matchRecord,
  PROTOCOL,
  people,
  publicRoom,
  type Snap,
  takeHost,
  upgrade,
  validPlaces,
  type Who,
} from "../room-logic";

type Out = Record<string, unknown>;

export class Room extends DurableObject<Env> {
  /** Loaded once per wake-up; the storage is the truth. */
  private meta: Meta | null | undefined;
  private snapshot: Snap | null | undefined;
  private readonly windows = new Map<WebSocket, { at: number; count: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------- Called by the Worker ----------

  async init(meta: Meta): Promise<void> {
    await this.save(meta);
    await this.ctx.storage.setAlarm(alarmAt(meta, 0, Date.now()));
  }

  async info() {
    const m = await this.load();
    return m ? publicRoom(m, this.online(), this.spectators()) : null;
  }

  async close(): Promise<void> {
    if (await this.load()) await this.end("The room was closed.");
  }

  async fetch(req: Request): Promise<Response> {
    const m = await this.load();
    if (!m) return Response.json({ error: "ended" }, { status: 404 });
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return Response.json({ error: "websocket_only" }, { status: 426 });
    if (this.ctx.getWebSockets().length >= CAPS.sockets)
      return Response.json({ error: "full" }, { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(null);
    await this.ctx.storage.setAlarm(m.expires);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- Sockets ----------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const m = await this.load();
    if (!m) return ws.close(1000, "ended");
    const window = this.windows.get(ws) ?? { at: 0, count: 0 };
    this.windows.set(ws, window);
    if (!allow(window, Date.now())) return this.refuse(ws, "rate", "Too many messages.", true);
    const who = ws.deserializeAttachment() as Who | null;
    const isHost = who !== null && who.seat !== null && who.seat === m.host;
    const e = envelope(raw, isHost);
    if (!e.ok) return this.refuse(ws, e.code, e.text, e.code !== "bad");
    const msg = e.msg;
    if (!who) {
      if (msg.t !== "hello") return this.refuse(ws, "hello", "Say hello first.", true);
      return this.hello(ws, m, msg);
    }
    switch (msg.t) {
      case "move":
        return this.move(ws, m, who, msg);
      case "take-host":
        return this.takeHost(ws, m, who);
      case "leave":
        return this.leave(ws, m, who);
      case "control":
        return this.control(ws, m, who, msg);
      case "state":
        return this.state(ws, m, msg);
      case "refused":
        for (const s of this.seatSockets(msg.seat))
          this.send(s, { t: "refused", reason: String(msg.reason ?? "").slice(0, 200) });
        return;
      case "end":
        return this.ended(m, msg);
      case "crash":
        if (m.started === null || m.ended) return;
        m.ended = true;
        await this.save(m);
        return this.broadcast({ t: "crash", reason: "Something went wrong. Start again?" });
      default:
        return this.refuse(ws, "bad", "You have joined already.");
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.left(ws);
    try {
      // Answer the close, so the device's socket closes at once. (A device's close often has no
      // code, 1005, which can't be sent back.)
      ws.close(1000, "bye");
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  async alarm(): Promise<void> {
    const m = await this.load();
    if (!m) return;
    const now = Date.now();
    const sockets = this.ctx.getWebSockets().length;
    if (now >= m.expires || sockets === 0) return this.end("This room has ended.");
    if (hostDue(m, this.online(), now)) {
      await this.save(m);
      await this.handHost(m);
      this.seats(m);
    }
    await this.ctx.storage.setAlarm(alarmAt(m, sockets, now));
  }

  // ---------- Messages ----------

  private async hello(ws: WebSocket, m: Meta, msg: Out): Promise<void> {
    const table = msg.table === true;
    const name = nick(msg.nick) ?? (table ? "Table" : null);
    if (!name) return this.refuse(ws, "nick", "Pick a nickname of 1 to 16 characters.");
    // Every await before join(), so that two devices joining at once can't get one seat.
    const seatHash = typeof msg.seatToken === "string" ? await hashToken(msg.seatToken) : null;
    const ownerHash = typeof msg.ownerToken === "string" ? await hashToken(msg.ownerToken) : null;
    const token = newToken();
    const tokenHash = await hashToken(token);
    const joined = join(
      m,
      { nick: name, seat: seatHash, owner: ownerHash, table },
      this.spectators(),
    );
    if (!joined.ok) return this.refuse(ws, "full", joined.reason, true);
    const { seat } = joined.who;
    if (joined.newToken && seat !== null)
      (m.seats[seat] as Meta["seats"][number]).token = tokenHash;
    for (const other of this.seatSockets(seat))
      if (other !== ws)
        this.refuse(other, "replaced", "This seat opened on another tab or device.", true);
    ws.serializeAttachment(joined.who);
    const online = this.online();
    // A player is back while the host's device is away (everyone had gone): the wait starts.
    if (hostDropped(m, online, Date.now()))
      await this.ctx.storage.setAlarm(alarmAt(m, this.ctx.getWebSockets().length, Date.now()));
    await this.save(m);
    await this.report(m);
    this.send(ws, {
      t: "welcome",
      seat,
      seatToken: joined.newToken ? token : undefined,
      room: publicRoom(m, online, this.spectators()),
    });
    this.seats(m);
    if (m.started === null || m.ended) return;
    if (seat !== null && seat === m.host) return this.handHost(m);
    const snap = await this.snap();
    if (snap && seat !== null) this.send(ws, { t: "view", data: snap.views[seat] ?? null });
    else if (snap) this.send(ws, { t: "public", data: snap.public });
  }

  private async move(ws: WebSocket, m: Meta, who: Who, msg: Out): Promise<void> {
    const why = checkMove(m, await this.snap(), who.seat, msg.seq);
    if (why) return this.send(ws, { t: "refused", reason: why });
    const host = this.seatSockets(m.host)[0];
    if (!host) return this.send(ws, { t: "refused", reason: "Waiting for the host…" });
    this.send(host, { t: "move", seat: who.seat, seq: msg.seq, move: msg.move });
  }

  /** Make me host (AC6.5): only while the host's device is away. */
  private async takeHost(ws: WebSocket, m: Meta, who: Who): Promise<void> {
    if (m.host === who.seat) return;
    const why = takeHost(m, who.seat, this.online());
    if (why) return this.send(ws, { t: "refused", reason: why });
    await this.save(m);
    await this.ctx.storage.setAlarm(alarmAt(m, this.ctx.getWebSockets().length, Date.now()));
    await this.handHost(m);
    this.seats(m);
  }

  private async control(ws: WebSocket, m: Meta, who: Who, msg: Out): Promise<void> {
    if (who.seat !== m.host) return this.refuse(ws, "role", "Only the host can do that.");
    const done = control(m, msg, Date.now());
    if (!done.ok) return this.send(ws, { t: "refused", reason: done.reason });
    if (done.close) return this.end("The host closed the room.");
    if (done.kick !== undefined)
      for (const s of this.seatSockets(done.kick))
        this.refuse(s, "kicked", "The host took your seat.", true);
    if (done.start) {
      this.snapshot = null;
      await this.ctx.storage.delete("snap");
    }
    await this.save(m);
    if (done.kick !== undefined) await this.report(m);
    if (done.start) await this.handHost(m);
    this.seats(m);
  }

  /** Leave the room (AC5.5): the seat opens, the host role passes on, and the socket closes. */
  private async leave(ws: WebSocket, m: Meta, who: Who): Promise<void> {
    if (who.seat !== null) {
      const host = m.host;
      leave(m, who.seat, this.online(ws));
      await this.save(m);
      await this.report(m);
      if (m.host !== host) await this.handHost(m, ws);
    }
    await this.left(ws);
    // A watcher now, so the close that follows changes nothing more.
    ws.serializeAttachment({ seat: null, table: false });
    try {
      ws.close(1000, "left");
    } catch {
      // Already closed.
    }
  }

  private async state(ws: WebSocket, m: Meta, msg: Out): Promise<void> {
    if (m.started === null || m.ended) return;
    const { seq, turn, views } = msg;
    if (!Number.isInteger(seq) || !Number.isInteger(turn) || !views || typeof views !== "object")
      return this.refuse(ws, "bad", "A state needs seq, turn and views.");
    const snap: Snap = {
      seq: seq as number,
      turn: turn as number,
      views: views as Record<string, unknown>,
      public: msg.public ?? null,
      snapshot: msg.snapshot ?? null,
    };
    this.snapshot = snap;
    await this.ctx.storage.put("snap", snap);
    for (const s of this.ctx.getWebSockets()) {
      if (s === ws) continue;
      const w = s.deserializeAttachment() as Who | null;
      if (!w) continue;
      if (w.seat === null) this.send(s, { t: "public", data: snap.public });
      else this.send(s, { t: "view", data: snap.views[w.seat] ?? null });
    }
  }

  private async ended(m: Meta, msg: Out): Promise<void> {
    const places = validPlaces(m, msg.places);
    if (!places || m.started === null || m.ended) return;
    m.ended = true;
    await this.save(m);
    try {
      await this.env.HUB.getByName("hub").record(matchRecord(m, places, Date.now()));
    } catch (error) {
      console.error("room: the hub didn't record the match", String(error));
    }
    this.broadcast({ t: "end", places });
    this.seats(m);
  }

  private async left(ws: WebSocket): Promise<void> {
    this.windows.delete(ws);
    const m = await this.load();
    if (!m) return;
    const who = ws.deserializeAttachment() as Who | null;
    const online = this.online(ws);
    const now = Date.now();
    const sockets = this.ctx.getWebSockets().filter((s) => s !== ws).length;
    // The host's device dropped: the game waits, and the role passes on at the alarm unless it
    // comes back (AC6.5). Nobody left: no wait, the room just ends 10 minutes later.
    const waits = who?.seat === m.host && hostDropped(m, online, now);
    if (sockets === 0 && m.hostAway !== null) m.hostAway = null;
    if (waits || sockets === 0) {
      await this.save(m);
      await this.ctx.storage.setAlarm(alarmAt(m, sockets, now));
    }
    this.seats(m, ws);
  }

  /** Tell the Hub how many people sit here, only when it changed (the admin's Rooms tab). */
  private async report(m: Meta): Promise<void> {
    const n = people(m);
    if (n === m.reported) return;
    m.reported = n;
    await this.save(m);
    await this.env.HUB.getByName("hub")
      .seated(m.code, n)
      .catch(() => {});
  }

  // ---------- Helpers ----------

  /** Tell the host device what to run: a new match, or the last snapshot to go on from. */
  private async handHost(m: Meta, except?: WebSocket): Promise<void> {
    const host = this.seatSockets(m.host).find((s) => s !== except);
    if (!host) return;
    const snap = m.started !== null && !m.ended ? await this.snap() : null;
    if (m.started !== null && !m.ended && !snap) {
      this.send(host, {
        t: "start",
        match: m.match,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        seats: m.seats.map((s, i) => ({
          name: s.cpu ? `CPU ${i + 1}` : s.nick,
          kind: s.cpu ? "cpu" : "human",
          level: m.level,
        })),
      });
    } else this.send(host, { t: "host", match: m.match, snapshot: snap?.snapshot ?? null });
  }

  private async end(reason: string): Promise<void> {
    const m = await this.load();
    for (const s of this.ctx.getWebSockets()) {
      this.send(s, { t: "closed", reason });
      try {
        s.close(1000, "closed");
      } catch {
        // Already closed.
      }
    }
    // The Hub also skips a room past its end, so a failed unlist does no harm.
    if (m)
      await this.env.HUB.getByName("hub")
        .unlist(m.code)
        .catch(() => {});
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.meta = null;
    this.snapshot = null;
  }

  private seats(m: Meta, except?: WebSocket): void {
    const room = publicRoom(m, this.online(except), this.spectators(except));
    for (const s of this.ctx.getWebSockets())
      if (s !== except && s.deserializeAttachment()) this.send(s, { t: "seats", room });
  }

  private broadcast(msg: Out): void {
    for (const s of this.ctx.getWebSockets()) if (s.deserializeAttachment()) this.send(s, msg);
  }

  private seatSockets(seat: unknown): WebSocket[] {
    if (!Number.isInteger(seat)) return [];
    return this.ctx
      .getWebSockets()
      .filter((s) => (s.deserializeAttachment() as Who | null)?.seat === seat);
  }

  private online(except?: WebSocket): Set<number> {
    const seats = new Set<number>();
    for (const s of this.ctx.getWebSockets()) {
      const w = s.deserializeAttachment() as Who | null;
      if (s !== except && w && w.seat !== null) seats.add(w.seat);
    }
    return seats;
  }

  private spectators(except?: WebSocket): number {
    return this.ctx
      .getWebSockets()
      .filter((s) => s !== except && (s.deserializeAttachment() as Who | null)?.seat === null)
      .length;
  }

  private send(ws: WebSocket, msg: Out): void {
    try {
      ws.send(JSON.stringify({ v: PROTOCOL, ...msg }));
    } catch {
      // The socket is closing; it reconnects by itself.
    }
  }

  private refuse(ws: WebSocket, code: string, text: string, close = false): void {
    this.send(ws, { t: "error", code, text });
    if (close) {
      try {
        // 4000: closed by the room on purpose; the reason is the error's code.
        ws.close(4000, code);
      } catch {
        // Already closed.
      }
    }
  }

  private async load(): Promise<Meta | null> {
    if (this.meta === undefined) {
      const m = await this.ctx.storage.get<Meta>("meta");
      this.meta = m ? upgrade(m) : null;
    }
    return this.meta;
  }

  private async save(m: Meta): Promise<void> {
    this.meta = m;
    await this.ctx.storage.put("meta", m);
  }

  private async snap(): Promise<Snap | null> {
    if (this.snapshot === undefined)
      this.snapshot = (await this.ctx.storage.get<Snap>("snap")) ?? null;
    return this.snapshot;
  }
}
