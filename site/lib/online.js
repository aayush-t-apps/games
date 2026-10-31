// Online rooms (change 0002), loaded only for online play: start a room (members), join one by
// link or code (anyone), the lobby with the code, its QR code and the host's controls, the match
// through the room, and the online scores. The host device runs the engine on a local bus and
// sends each state to the room; every other device shows only the views the room sends it.
import { gameById, home, load, onLeave, players, setScreen, show, showHub, showMatch, shownGames, store } from "./app.js";
import { createEngine, PROTOCOL } from "./engine.js";
import { createLocal } from "./net/local.js";
import { createRoom, forgetTokens, keepToken, tokens } from "./net/room.js";
import { qrSvg } from "./qr.js";
import { announce, el, ordinal, sound } from "./ui.js";

const LEVELS = { easy: "Easy", normal: "Normal", hard: "Hard" };
const CPU_PAUSE = 600;
/** While "Reconnecting…": how often to check whether the room has ended. */
const ENDED_CHECK_MS = 30_000;
/** The room this device is in, if any. */
let s = null;

const linkOf = (code) => `${location.origin}/r/${code}`;
const spaced = (code) => code.split("").join(" ");
const nickOf = () => {
  const data = store.get();
  return data.player.named ? data.player.nick.slice(0, 16) : "";
};

function page(title, ...children) {
  setScreen("online");
  document.title = `${title}: Games`;
  show(el("h1", {}, title), ...children);
  document.querySelector("#main h1")?.focus();
}

function message(title, text, ...more) {
  page(title, el("p", { class: "loading" }, text), el("div", { class: "row" }, ...more, el("button", { type: "button", onclick: showHub }, "Back to games")));
}

/** A labelled field: the label above, the input full width (forms on a phone). */
const field = (label, input, hint) => el("div", { class: "field" }, el("label", { for: input.id }, label), input, hint ? el("p", { class: "hint-text" }, hint) : null);

const reload = (g) =>
  message(
    g?.name ?? "Games",
    "This room uses a newer version of the game. Reload to update, then join again.",
    el("button", { type: "button", class: "primary", onclick: () => location.reload() }, "Reload"),
  );

async function api(path, init) {
  const res = await fetch(path, { ...init, redirect: "manual", headers: { "content-type": "application/json" } });
  const body = res.type === "opaqueredirect" ? null : await res.json().catch(() => null);
  return { status: res.type === "opaqueredirect" ? 401 : res.status, body };
}

// ---------- Start a room (members, AC5.2) ----------

export function startRoom(g) {
  const min = Math.max(2, g.players[0]);
  const max = Math.min(8, g.players[1]);
  const cfg = { seats: min, cpu: 0, level: "normal" };
  const status = el("p", { role: "status", class: "warn" });
  const nick = el("input", { id: "room-nick", value: nickOf(), maxlength: "16", autocomplete: "nickname", required: true });
  const seatSelect = el(
    "select",
    {
      id: "room-seats",
      onchange: (e) => {
        cfg.seats = Number(e.target.value);
        drawCpu();
      },
    },
    Array.from({ length: max - min + 1 }, (_, i) => el("option", { value: min + i }, `${min + i} seats`)),
  );
  const cpuBox = el("div", {});
  function drawCpu() {
    cfg.cpu = Math.min(cfg.cpu, cfg.seats - 1);
    cpuBox.replaceChildren(
      field(
        "CPU seats",
        el(
          "select",
          {
            id: "room-cpu",
            onchange: (e) => {
              cfg.cpu = Number(e.target.value);
            },
          },
          Array.from({ length: cfg.seats }, (_, n) => el("option", { value: n, selected: n === cfg.cpu }, n === 0 ? "None: only people" : `${n} CPU`)),
        ),
        "A CPU seat plays by itself. You can change seats in the room too.",
      ),
    );
  }
  drawCpu();
  page(
    `Invite friends: ${g.name}`,
    el(
      "form",
      {
        class: "setup",
        onsubmit: async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const submit = form.querySelector("[type=submit]");
          // One tap, one room: the button waits for the answer.
          if (submit.disabled) return;
          submit.disabled = true;
          store.setNick(nick.value);
          status.textContent = "Starting the room…";
          const { status: code, body } = await api("/api/member/rooms", {
            method: "POST",
            body: JSON.stringify({ game: g.id, version: g.version, ...cfg }),
          }).catch(() => ({ status: 0, body: null }));
          submit.disabled = false;
          // The player went back meanwhile: the room isn't opened over another screen.
          if (!form.isConnected) return;
          if (code === 201) {
            keepToken(body.code, { ownerToken: body.ownerToken });
            history.pushState(null, "", `/r/${body.code}`);
            return openRoom(body.code, { nick: store.get().player.nick.slice(0, 16) || "Host" });
          }
          status.textContent =
            code === 401
              ? "Your sign-in ended. Sign in again, then try."
              : code === 0
                ? "Online play needs signal."
                : (body?.text ?? "Online play is busy, try later.");
        },
      },
      el("p", { class: "about" }, `Seats for ${players(g.players)}. Friends join with the room's link, code or QR code, with no sign-in.`),
      field("Your name", nick, "The others see it on your seat."),
      field("Seats", seatSelect),
      cpuBox,
      el(
        "fieldset",
        { class: "levels" },
        el("legend", {}, "CPU level"),
        Object.entries(LEVELS).map(([value, label]) =>
          el(
            "label",
            { class: "choice" },
            el("input", {
              type: "radio",
              name: "level",
              value,
              checked: value === "normal",
              onchange: () => {
                cfg.level = value;
              },
            }),
            label,
          ),
        ),
      ),
      el("div", { class: "row" }, el("button", { class: "primary big", type: "submit" }, "Start the room"), el("button", { type: "button", onclick: home }, "Back to games")),
      status,
    ),
  );
}

// ---------- Join (anyone, AC6.1): the code goes in on the hub, or the link opens here ----------

/** Open a room's link: check it, load its game, ask for a nickname once, then connect. */
export async function openRoom(code, join) {
  if (s?.code === code) return;
  leave(true);
  page(`Room ${code}`, el("p", { class: "loading", role: "status" }, "Finding the room…"));
  // Back (or Back to games) while it loads: the room doesn't open over the hub.
  const here = () => location.pathname.replace(/\/$/, "").toUpperCase() === `/R/${code}`;
  const { status, body: info } = await api(`/api/rooms/${code}`).catch(() => ({ status: 0 }));
  if (!here()) return;
  if (status === 404) return message("This room has ended", "Ask for a new link, or start a room yourself.");
  if (status !== 200) return message(`Room ${code}`, "Online play needs signal. Connect, then try again.", el("button", { type: "button", class: "primary", onclick: () => openRoom(code) }, "Try again"));
  const g = gameById(info.game);
  if (!g || g.version !== info.version) return reload(g);
  page(`Room ${code}`, el("p", { class: "loading", role: "status" }, `Getting ${g.name}…`));
  let code_;
  try {
    code_ = await load(g.id);
  } catch {
    return message(g.name, `${g.name} needs signal once. Connect to the internet, then try again.`);
  }
  if (!here()) return;
  const mine = tokens(code);
  if (join || mine.seatToken || mine.ownerToken) return connect(code, g, code_, join ?? { nick: nickOf() || "Player" });
  askNick(code, g, code_, info);
}

function askNick(code, g, game, info, why = "") {
  const input = el("input", { id: "join-nick", value: nickOf(), maxlength: "16", autocomplete: "nickname", required: true });
  const free = info ? info.seats.filter((x) => !x.taken).length : null;
  const seatsText = free === null ? "" : free ? ` ${free} free ${free === 1 ? "seat" : "seats"}.` : " No free seat: you can watch.";
  const go = (table) => {
    const nick = input.value.trim();
    if (!table && !nick) return input.focus();
    if (nick) store.setNick(nick);
    connect(code, g, game, table ? { table: true, nick: nick || "Table" } : { nick });
  };
  page(
    `Join ${g.name}`,
    el("p", { class: "about" }, `Room ${spaced(code)}.${seatsText}`),
    el(
      "form",
      {
        class: "setup",
        onsubmit: (e) => {
          e.preventDefault();
          go(false);
        },
      },
      field("Your nickname (1 to 16 letters)", input, "The others see it on your seat."),
      el("p", { role: "status", class: "warn" }, why),
      el("div", { class: "row" }, el("button", { class: "primary big", type: "submit" }, "Join"), el("button", { type: "button", onclick: showHub }, "Back to games")),
    ),
    el(
      "aside",
      { class: "pane table-option", "aria-labelledby": "table-title" },
      el("h2", { id: "table-title" }, "A TV or a big screen?"),
      el("p", {}, "Join as Table: it shows the board to everyone, with no seat and no cards."),
      el("button", { type: "button", onclick: () => go(true) }, "Join as Table"),
    ),
  );
  input.focus();
}

// ---------- The room ----------

function connect(code, g, game, hello) {
  leave(true);
  const room = createRoom({ code, hello });
  s = {
    code,
    g,
    rules: game.rules,
    view: game.view,
    room,
    table: hello.table === true,
    me: undefined,
    hosting: false,
    info: null,
    screen: "connecting",
    shownMatch: 0,
    push: null,
    engine: null,
    engineMatch: 0,
    status: el("p", { role: "status", class: "room-status" }),
  };
  const mine = s;
  onLeave(() => leave(true));
  room.onMessage((msg) => {
    if (s === mine) onRoom(msg);
  });
  window.addEventListener("online", wake);
  page(`Room ${code}`, el("p", { class: "loading", role: "status" }, "Joining…"));
}

const wake = () => s?.room.wake();

/**
 * Still reconnecting: has the room ended meanwhile (its link then never comes back)? One small
 * call now and then while the link is down, never while it is up (AC6.7).
 */
async function stillOpen(mine) {
  if (s !== mine) return;
  const { status } = await api(`/api/rooms/${mine.code}`).catch(() => ({ status: 0 }));
  if (s !== mine) return;
  if (status === 404) return gone("This room has ended", "Ask for a new link, or start a room yourself.");
  mine.check = setTimeout(() => stillOpen(mine), ENDED_CHECK_MS);
}

/** Close this device's link to its room; its seat waits for it. `quiet`: the hub opens anyway. */
function leave(quiet = false) {
  if (!s) return;
  clearTimeout(s.check);
  s.engine?.stop();
  s.room.close();
  window.removeEventListener("online", wake);
  s = null;
  if (!quiet) showHub();
}

/** Leave the room for good (AC5.5): the seat opens, and the host role passes on. */
function leaveRoom() {
  if (!s) return;
  const handsOver = s.hosting && s.info?.seats.some((x, i) => i !== s.me && x.online && !x.cpu);
  const ask =
    s.me === null || s.me === undefined
      ? "Stop watching this room?"
      : handsOver
        ? "Leave this room? Your seat opens, and the next player becomes the host."
        : "Leave this room? Your seat opens for someone else.";
  if (!window.confirm(ask)) return;
  // Offline, the room can't open the seat: keep it, and say so, rather than strand it.
  if (!s.room.send({ t: "leave" })) return say("Reconnecting… try again in a moment.");
  forgetTokens(s.code);
  leave();
}

/** Whether this device's seat is the host's: it runs the rules and has the controls. */
const hosts = (room, me) => me !== null && me !== undefined && room?.host === me;

function onRoom(msg) {
  switch (msg.t) {
    case "link":
      s.status.textContent = msg.up ? "" : "Reconnecting…";
      clearTimeout(s.check);
      if (!msg.up) s.check = setTimeout(() => stillOpen(s), ENDED_CHECK_MS);
      drawBar();
      return;
    case "welcome":
      s.me = msg.seat;
      s.info = msg.room;
      s.hosting = hosts(s.info, s.me);
      if (!s.info.playing) lobby();
      else if (s.screen !== "match") page(`${s.g.name} room`, el("p", { class: "loading", role: "status" }, "The match is on. Getting the table…"));
      return;
    case "seats":
      s.info = msg.room;
      s.hosting = hosts(s.info, s.me);
      if (s.engine && !s.hosting) stopEngine();
      s.engine?.setAway(away());
      if (s.screen === "lobby" || (!s.info.playing && s.screen === "connecting")) lobby();
      drawBar();
      return;
    case "start":
      return hostStart(msg);
    case "host":
      return hostResume(msg);
    case "move":
      s.bus?.send({ v: PROTOCOL, t: "move", seat: msg.seat, seq: msg.seq, move: msg.move });
      return;
    case "view":
    case "public":
      if (msg.data) feed(msg.data);
      return;
    case "refused":
      if (s.screen === "match") feed({ t: "refused", seat: s.me, reason: msg.reason });
      else say(msg.reason);
      return;
    case "end":
      feed({ t: "end", places: msg.places });
      s.screen = "result";
      return;
    case "crash":
      feed({ t: "crash", reason: msg.reason });
      s.screen = "result";
      return;
    case "closed":
      return gone("This room has ended", msg.reason || "The room was closed.");
    case "error":
      return error(msg);
  }
}

function error(msg) {
  const text = msg.text ?? "Something went wrong.";
  if (msg.code === "version") return gone(s.g.name, text, true);
  if (msg.code === "nick") {
    const { code, g, rules, view, info } = s;
    leave(true);
    return askNick(code, g, { rules, view }, info, text);
  }
  if (["kicked", "replaced", "full"].includes(msg.code)) return gone(`Room ${s.code}`, text);
  say(text);
}

function gone(title, text, reloadButton = false) {
  const g = s?.g;
  leave(true);
  if (reloadButton) return reload(g);
  message(title, text);
}

function say(text) {
  if (s) s.status.textContent = text;
  announce(text);
}

const away = () => (s.info?.seats ?? []).flatMap((x, i) => (!x.cpu && !x.online ? [i] : []));
const seatName = (x, i) => (x.cpu ? `CPU ${i + 1}` : x.nick || `Seat ${i + 1}`);

// ---------- The lobby (AC5.2, AC5.3) ----------

function lobby() {
  // A seat update redraws the lobby: keep the keyboard focus where it was (not on the heading).
  const again = s.screen === "lobby";
  const before = document.activeElement;
  const label = before?.closest?.("#main button") ? before.textContent : null;
  s.screen = "lobby";
  const { code, info, g } = s;
  const hosting = s.hosting;
  const op = (msg) => s.room.send({ t: "control", ...msg });
  const share = async () => {
    const url = linkOf(code);
    if (navigator.share) {
      await navigator.share({ title: `${g.name} room`, text: `Join my ${g.name} room: code ${code}`, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    say("Link copied.");
  };
  const seats = info.seats.map((x, i) => {
    const tags = [i === info.host ? "host" : null, i === s.me ? "you" : null].filter(Boolean);
    const state = x.cpu ? "cpu" : x.taken ? (x.online ? "here" : "away") : "free";
    const controls = [];
    if (hosting && i !== s.me && !info.playing) {
      if (!x.taken || x.cpu)
        controls.push(el("button", { type: "button", onclick: () => op({ op: "cpu", seat: i, on: !x.cpu }) }, x.cpu ? "Make it a seat" : "Make it a CPU"));
      if (x.taken && !x.cpu) controls.push(el("button", { type: "button", class: "danger", onclick: () => op({ op: "kick", seat: i }) }, `Kick ${x.nick}`));
    }
    return el(
      "li",
      { class: `seat-row ${state}` },
      el(
        "span",
        { class: "who" },
        el("strong", {}, x.taken || x.cpu ? seatName(x, i) : `Seat ${i + 1}`),
        tags.map((t) => el("span", { class: `tag ${t}` }, t)),
      ),
      el("span", { class: "state" }, { cpu: "CPU", here: "Joined", away: "Away", free: "Waiting for a player" }[state]),
      controls.length ? el("span", { class: "row seat-tools" }, controls) : null,
    );
  });
  const hostName = hostSeatName();
  // The host's device is away: the role passes after a short wait, or to whoever taps (AC6.5).
  const notice = hostAway()
    ? el(
        "div",
        { class: "notice", role: "status" },
        el("p", {}, `Waiting for the host… If ${hostName} isn't back soon, the next player becomes the host.`),
        s.me !== null ? takeHostButton() : null,
      )
    : null;
  const invite = el(
    "section",
    { class: "pane invite", "aria-labelledby": "invite-title" },
    el("h2", { id: "invite-title" }, "Invite"),
    el("p", { class: "room-code", "aria-label": `Room code ${spaced(code)}` }, code),
    el("div", { class: "qr", html: qrSvg(linkOf(code), `QR code for the link to room ${spaced(code)}`) }),
    el("p", { class: "room-link" }, linkOf(code)),
    el("div", { class: "row" }, el("button", { type: "button", onclick: share }, navigator.share ? "Share" : "Copy link")),
    el("p", { class: "hint-text" }, `Friends scan the code, open the link, or type the code on ${location.host}.`),
  );
  const filled = info.seats.filter((x) => x.taken || x.cpu).length;
  // Someone sat down: a short chime, as at a real table.
  if (again && filled > (s.filled ?? filled)) sound("home");
  s.filled = filled;
  const seatsPane = el(
    "section",
    { class: "pane", "aria-labelledby": "seats-title" },
    el("h2", { id: "seats-title" }, `Seats: ${filled} of ${info.seats.length}`, info.locked ? el("span", { class: "tag locked" }, "locked") : null),
    el("ul", { class: "seats" }, seats),
    info.spectators ? el("p", { class: "hint-text" }, `${info.spectators} watching.`) : null,
    hosting
      ? el(
          "div",
          { class: "row" },
          info.seats.length < info.max ? el("button", { type: "button", onclick: () => op({ op: "size", seats: info.seats.length + 1 }) }, "Add a seat") : null,
          info.seats.length > info.min ? el("button", { type: "button", onclick: () => op({ op: "size", seats: info.seats.length - 1 }) }, "Remove a seat") : null,
          el("button", { type: "button", onclick: () => op({ op: info.locked ? "unlock" : "lock" }) }, info.locked ? "Unlock the room" : "Lock the room"),
        )
      : null,
  );
  const next = hosting
    ? el(
        "div",
        { class: "row lobby-actions" },
        el("button", { type: "button", class: "primary big", onclick: () => op({ op: "start" }) }, info.match ? "Rematch" : "Start"),
        el("button", { type: "button", class: "danger", onclick: () => window.confirm("Close this room for everyone?") && op({ op: "close" }) }, "Close the room"),
      )
    : el(
        "p",
        { class: "waiting" },
        s.me === null
          ? s.table
            ? "This screen is the table: it shows the board when the match starts."
            : "You're watching: the seats are taken or the room is locked."
          : `Waiting for ${hostName} to start.`,
      );
  page(
    `${g.name} room`,
    notice,
    el("div", { class: "lobby" }, hosting ? [invite, seatsPane] : [seatsPane, invite]),
    next,
    s.status,
    el("div", { class: "row" }, el("button", { type: "button", onclick: leaveRoom }, "Leave the room")),
  );
  if (!again) return;
  const same = label && [...document.querySelectorAll("#main button")].find((b) => b.textContent === label);
  if (same) same.focus();
  else if (before?.isConnected && before !== document.body) before.focus();
}

// ---------- The match ----------

/** The host's name, as the lobby and the bar say it. */
function hostSeatName() {
  const host = s.info?.seats[s.info.host];
  return host?.taken ? seatName(host, s.info.host) : "the host";
}

/** The host's device is away (not this one): the game waits for it (AC6.5). */
function hostAway() {
  const host = s.info?.seats[s.info.host];
  return !s.hosting && !!host?.taken && !host.cpu && !host.online;
}

const takeHostButton = () => el("button", { type: "button", onclick: () => s.room.send({ t: "take-host" }) }, "Make me host");

/** The bar over the table: the room, the host, Make me host while the host is away (AC6.5). */
function drawBar() {
  if (!s?.bar) return;
  const waiting = hostAway();
  const player = s.me !== null && s.me !== undefined;
  // replaceChildren() writes null as the text "null": only real nodes go in.
  s.bar.replaceChildren(
    ...[
      el("span", {}, `Room ${s.code}. Host: ${hostSeatName()}.${waiting ? " Waiting for the host…" : ""}`),
      waiting && player ? takeHostButton() : null,
      s.status,
    ].filter(Boolean),
  );
}

/** Show the match screen (once per match) and give it an engine message. */
function feed(msg) {
  // The host knows the match from its engine; the room tells everyone else before the views.
  const matchNo = s.bus ? s.engineMatch : (s.info?.match ?? 0);
  if (s.screen !== "match" || s.shownMatch !== matchNo) {
    if (msg.t === "end" || msg.t === "crash" || msg.t === "refused") return;
    s.screen = "match";
    s.shownMatch = matchNo;
    s.bar = el("div", { class: "room-bar" });
    s.push = showMatch({
      g: s.g,
      rules: s.rules,
      view: s.view,
      seats: s.info.seats.map((x, i) => ({ name: seatName(x, i), kind: x.cpu ? "cpu" : "human" })),
      me: s.me,
      send: sendMove,
      online: { bar: s.bar, table: s.table, leave: leaveRoom, actions },
    });
    drawBar();
  }
  s.push(msg);
}

/** A move from this device's screen: to its own engine when it hosts, else to the room. */
function sendMove(msg) {
  if (msg.t !== "move") return;
  if (s.bus) s.bus.send(msg);
  else if (!s.room.send({ t: "move", seq: msg.seq, move: msg.move })) say("Reconnecting… try again in a moment.");
}

/** The result screen's buttons (AC7.1): Rematch for the host, Scores, back to the room, Leave. */
function actions() {
  return [
    // Where the room's answers show (a refused Rematch, "Reconnecting…").
    s?.status ?? null,
    s?.hosting ? el("button", { type: "button", class: "primary big", onclick: () => s.room.send({ t: "control", op: "rematch" }) }, "Rematch") : el("p", { class: "hint-text" }, "The host can start a rematch."),
    el("button", { type: "button", onclick: () => showScores(s.g.id, true) }, "Scores"),
    el("button", { type: "button", onclick: () => lobby() }, "Back to the room"),
    el("button", { type: "button", onclick: leaveRoom }, "Leave the room"),
  ];
}

// ---------- The host (AC6.2, AC6.5, AC6.6) ----------

function stopEngine() {
  s.engine?.stop();
  s.engine = null;
  s.bus = null;
}

function runEngine(seats, match, opts) {
  stopEngine();
  const bus = createLocal(seats);
  let views = {};
  const engine = createEngine({ game: s.rules, seats, transport: bus, delay: CPU_PAUSE, ...opts });
  bus.onMessage((m) => {
    if (m.t === "view") {
      views[m.seat] = m;
      if (m.seat === s.me) feed(m);
    } else if (m.t === "public") {
      s.room.send({ t: "state", seq: m.seq, turn: m.turn, views, public: m, snapshot: engine.snapshot() });
      views = {};
    } else if (m.t === "refused") {
      if (m.seat === s.me) feed(m);
      else s.room.send({ t: "refused", seat: m.seat, reason: m.reason });
    } else if (m.t === "end") s.room.send({ t: "end", places: m.places });
    else if (m.t === "crash") s.room.send({ t: "crash" });
  });
  s.engine = engine;
  s.bus = bus;
  s.engineMatch = match;
  engine.setAway(away());
  engine.start();
}

function hostStart(msg) {
  runEngine(msg.seats, msg.match, { seed: msg.seed });
}

function hostResume(msg) {
  if (s.engine && s.engineMatch === msg.match) return s.engine.resend();
  if (!msg.snapshot) return;
  const seats = s.info.seats.map((x, i) => ({ name: seatName(x, i), kind: x.cpu ? "cpu" : "human", level: s.info.level }));
  runEngine(seats, msg.match, { seed: 0, from: msg.snapshot });
}

// ---------- Scores (AC7.2) ----------

export async function showScores(id, fromRoom = false) {
  const list = games();
  const g = gameById(id) ?? list[0];
  const box = el("div", { role: "status", class: "scores" }, el("p", { class: "loading" }, "Getting the scores…"));
  const back = fromRoom && s ? el("button", { type: "button", onclick: () => lobby() }, "Back to the room") : null;
  page(
    "Online scores",
    el(
      "div",
      { class: "setup" },
      field(
        "Game",
        el(
          "select",
          { id: "scores-game", onchange: (e) => showScores(e.target.value, fromRoom) },
          list.map((x) => el("option", { value: x.id, selected: x.id === g.id }, x.name)),
        ),
      ),
    ),
    box,
    el("div", { class: "row" }, back, el("button", { type: "button", onclick: showHub }, "Back to games")),
  );
  const { status, body } = await api(`/api/scores?game=${g.id}`).catch(() => ({ status: 0 }));
  if (status !== 200) {
    box.replaceChildren(el("p", {}, "Online scores need signal."));
    return;
  }
  const when = (at) => new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const placesText = (m) => {
    let rank = 1;
    return m.places
      .map((group) => {
        const text = `${group.length > 1 ? "=" : ""}${ordinal(rank)} ${group.map((i) => m.players[i]).join(", ")}`;
        rank += group.length;
        return text;
      })
      .join("; ");
  };
  box.classList.add("score-panes");
  box.replaceChildren(
    el(
      "section",
      { class: "pane", "aria-labelledby": "top-title" },
      el("h2", { id: "top-title" }, `Top players: ${g.name}`),
      body.top.length
        ? el(
            "table",
            {},
            el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Player"), el("th", { scope: "col" }, "Wins"))),
            el("tbody", {}, body.top.map((r) => el("tr", {}, el("th", { scope: "row" }, r.nick), el("td", {}, r.wins)))),
          )
        : el("p", { class: "hint-text" }, "No online wins yet. Play a match with friends: the winner shows here."),
    ),
    el(
      "section",
      { class: "pane", "aria-labelledby": "last-title" },
      el("h2", { id: "last-title" }, "Last matches"),
      body.recent.length
        ? el("ul", { class: "recent" }, body.recent.map((m) => el("li", {}, `${when(m.at)}: ${placesText(m)}`)))
        : el("p", { class: "hint-text" }, "No online matches yet."),
    ),
  );
}

/** The games that can be played online (2 players or more). */
const games = () => shownGames().filter((g) => g.players[1] >= 2);
