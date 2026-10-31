// The app: the hub, Setup, Match, Result and Settings screens. A match runs the rules in the engine
// over the local transport; this page is every seat's screen. Online play (change 0002) is in
// online.js, loaded only when needed: it shows its matches with showMatch() below.
import { emblem } from "./cards.js";
import { createEngine, PROTOCOL } from "./engine.js";
import { bindBoard, refresh } from "./input.js";
import { cacheFiles, iosCardWanted, isCached, setupInstall } from "./install.js";
import { watchLayout } from "./layout.js";
import { createLocal } from "./net/local.js";
import { createStore, persist } from "./store.js";
import { announce, el, fillNames, ordinal, passScreen, setSound, sound } from "./ui.js";

const TYPES = { cards: "Cards", board: "Board game", kids: "Kids", puzzles: "Puzzle" };
const LEVEL_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" };
const CPU_PAUSE = 600;
const CONFETTI = ["red", "blue", "yellow", "green"];
const LEAVE = "Leave this match? It won't be kept.";

const main = document.getElementById("main");
export const store = createStore();
/** Every game in this release (index.json), and those the hub shows (the catalogue's order). */
let allGames = [];
let games = [];
let match = null;
let install = null;
let layout = () => "compact";
let screen = "boot";
/** Online play: set up here (Access, or the local developer), and this device's member. */
const net = { ready: false, member: false, admin: false, email: "" };
/** What online.js does when the player leaves its screens for the hub. */
let onlineExit = null;
/** Each game's last Setup on this page, so Back to Setup shows it as it was. */
const setups = {};

export const filesOf = (id) => [`/games/${id}/rules.js`, `/games/${id}/view.js`];
export const players = ([min, max]) =>
  min === max ? `${min} ${min === 1 ? "player" : "players"}` : `${min}–${max} players`;
export const gameById = (id) => allGames.find((g) => g.id === id);
/** The games the hub shows now (on, in the catalogue's order). */
export const shownGames = () => games;
const online = () => import("./online.js");
const ROOM_PATH = /^\/r\/([A-Za-z2-9]{6})\/?$/;

/** online.js: what to do when the player goes back to the hub (close the room's link). */
export function onLeave(fn) {
  onlineExit = fn;
}

export function setScreen(name) {
  screen = name;
}

// ---------- Back ----------
// Each screen over the hub is a history entry (`d`: its depth: Setup 1, a match 2), so the
// browser's or the phone's Back goes one screen back and leaves the app only from the hub.

/** The history entry for a screen: a new one, or this one again (Play again keeps it). */
function mark(s, game) {
  const state = { s, game, d: s === "setup" ? 1 : 2 };
  const now = history.state;
  if (now?.s === s && now?.game === game) return;
  if (now?.s === "match" && s === "match") history.replaceState(state, "", "/");
  else history.pushState(state, "", "/");
}

/** Back to the hub: through history when the screens above it are entries, so Back stays right. */
export function home() {
  const d = history.state?.d ?? 0;
  if (d > 0 && !ROOM_PATH.test(location.pathname)) history.go(-d);
  else showHub();
}

function supported() {
  return (
    typeof CSS !== "undefined" &&
    CSS.supports("container-type: inline-size") &&
    "PointerEvent" in window &&
    typeof Array.prototype.at === "function"
  );
}

function applySettings() {
  const { theme, sound: on } = store.get().settings;
  document.documentElement.dataset.theme = theme;
  setSound(on);
}

export function show(...children) {
  main.replaceChildren(...children.filter(Boolean));
  main.querySelector("h1")?.setAttribute("tabindex", "-1");
}

// ---------- Hub ----------

export function showHub() {
  stopMatch();
  const exit = onlineExit;
  onlineExit = null;
  exit?.();
  if (ROOM_PATH.test(location.pathname)) history.replaceState(null, "", "/");
  screen = "hub";
  document.title = "Games";
  drawMe();
  // No questions first: pick a game and play. A name is asked only where others see it.
  show(
    el("h1", { class: "hub-title" }, "Pick a game"),
    el("div", { id: "online-slot" }, onlineSection()),
    el("ul", { class: "shelf" }, games.map(gameBox)),
    el("div", { class: "extras" }, scoresSection(), installSection()),
  );
  markCached();
}

function gameBox(g) {
  return el(
    "li",
    { class: `box type-${g.type}`, dataset: { game: g.id } },
    el("div", { class: "lid", html: emblem(g.id) }),
    el(
      "div",
      { class: "box-text" },
      el("h2", {}, g.name, g.featured ? el("span", { class: "badge" }, "Featured") : null),
      el("p", { class: "about" }, g.about),
      el("p", { class: "meta" }, `${TYPES[g.type]}. ${players(g.players)}. Ages ${g.ages}.`),
      el("p", { class: "needs", hidden: true }, "Needs signal once"),
    ),
    el(
      "div",
      { class: "box-actions" },
      el(
        "button",
        {
          class: "primary",
          type: "button",
          "aria-label": `Play ${g.name}`,
          onclick: () => {
            sound("card");
            showSetup(g);
          },
        },
        "Play",
      ),
    ),
  );
}

export const CODE = /^[A-HJKMNP-Z2-9]{6}$/;

/**
 * Join a friend's room (AC5.1): their code goes straight in here. A member invites from a game's
 * Setup; sign-in is in Settings. Hidden until online play is set up, and offline.
 */
function onlineSection() {
  if (!net.ready || !navigator.onLine) return null;
  const input = el("input", {
    id: "join-code",
    class: "code-input",
    autocomplete: "off",
    autocapitalize: "characters",
    maxlength: "6",
    spellcheck: "false",
    placeholder: "K7M2QX",
    "aria-describedby": "join-status",
  });
  const status = el("p", { id: "join-status", class: "hint-text", role: "status" });
  const join = (event) => {
    event.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!CODE.test(code)) {
      status.textContent = "A room code is 6 letters and digits, like K7M2QX.";
      return input.focus();
    }
    history.pushState(null, "", `/r/${code}`);
    online().then((o) => o.openRoom(code));
  };
  return el(
    "section",
    { class: "online-row", "aria-labelledby": "online-title" },
    el(
      "div",
      { class: "online-text" },
      el("h2", { id: "online-title" }, "Join friends"),
      el("p", {}, "Got a room code? Type it here. No sign-in needed."),
    ),
    el(
      "form",
      { class: "join-form", onsubmit: join },
      el("label", { for: "join-code", class: "sr-only" }, "Room code"),
      input,
      el("button", { type: "submit", class: "primary" }, "Join"),
      status,
    ),
  );
}

/** Who plays on this device, on the top bar's Settings button: the name, and Member or Guest. */
function drawMe() {
  const button = document.getElementById("open-settings");
  if (!button) return;
  const nick = store.get().player.nick;
  const role = net.ready ? (net.member ? "Member" : "Guest") : null;
  button.setAttribute("aria-label", `Settings: ${nick}${role ? `, ${role.toLowerCase()}` : ""}`);
  button.replaceChildren(
    el("span", { class: "me-name" }, nick),
    role ? el("span", { class: `me-tag${net.member ? " member" : ""}` }, role) : null,
    el("span", { class: "me-gear", "aria-hidden": "true" }, "⚙"),
  );
}

/** Settings' first part: who you are, and Sign in or Sign out (AC5.1). */
function accountSection() {
  if (!net.ready) return null;
  return el(
    "div",
    { class: "account" },
    net.member
      ? el("p", {}, "Signed in", net.email ? ` as ${net.email}` : "", ". You can start rooms from a game's Setup.")
      : el("p", {}, "Playing as a guest: every game, and rooms by code. Members also start rooms."),
    el(
      "p",
      { class: "online-links" },
      net.member ? null : el("a", { href: "/member" }, "Sign in to invite friends"),
      net.admin ? el("a", { href: "/admin" }, "Admin") : null,
      // Access's own sign-out (the service worker leaves /cdn-cgi/ to Cloudflare).
      net.member ? el("a", { href: "/cdn-cgi/access/logout" }, "Sign out") : null,
    ),
  );
}

async function markCached() {
  if (navigator.onLine) return;
  for (const g of games) {
    const ready = await isCached(filesOf(g.id));
    const box = main.querySelector(`[data-game="${g.id}"]`);
    if (!box || ready) continue;
    box.querySelector(".needs").hidden = false;
    box.querySelector("button").disabled = true;
  }
}

async function downloadAll() {
  const button = document.getElementById("download-all");
  const status = document.getElementById("download-status");
  button.disabled = true;
  status.textContent = "Saving the games on this device…";
  const ok = await cacheFiles(games.flatMap((g) => filesOf(g.id)));
  status.textContent = ok
    ? "All games ready offline"
    : "Not every game could be saved. Connect to the internet and try again.";
  button.disabled = false;
}

function scoresSection() {
  const data = store.get();
  const played = games.filter((g) => store.totals(g.id).played > 0);
  const name = (id) => games.find((g) => g.id === id)?.name ?? id;
  return el(
    "section",
    { class: "scores", "aria-labelledby": "scores-title" },
    el("h2", { id: "scores-title" }, "Your scores on this device"),
    played.length
      ? el(
          "table",
          {},
          el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Game"), el("th", { scope: "col" }, "Played"), el("th", { scope: "col" }, "Won"))),
          el(
            "tbody",
            {},
            played.map((g) => {
              const t = store.totals(g.id);
              return el("tr", {}, el("th", { scope: "row" }, g.name), el("td", {}, t.played), el("td", {}, t.won));
            }),
          ),
        )
      : el("p", {}, "No matches yet. Your wins show up here."),
    data.recent.length
      ? el(
          "div",
          {},
          el("h3", {}, "Last results"),
          el(
            "ul",
            { class: "recent" },
            data.recent
              .slice(0, 5)
              .map((r) =>
                el(
                  "li",
                  {},
                  `${name(r.game)}: ${r.won ? "won" : `${ordinal(r.place)} place`}${r.level === "friends" ? ", with friends" : `, ${r.level}`}`,
                ),
              ),
          ),
        )
      : null,
  );
}

function installSection() {
  if (install) {
    return el(
      "section",
      { class: "install", "aria-labelledby": "install-title" },
      el("h2", { id: "install-title" }, "Install Games"),
      el("p", {}, "It gets its own icon and window, and plays offline."),
      el("button", { type: "button", class: "primary", onclick: () => install?.() }, "Install"),
    );
  }
  if (iosCardWanted()) {
    return el(
      "section",
      { class: "install", "aria-labelledby": "install-title" },
      el("h2", { id: "install-title" }, "Add Games to your Home Screen"),
      el("p", {}, "Tap Share, then Add to Home Screen. It opens like an app, and Safari keeps your scores safe from its 7-day clean-up."),
    );
  }
  return null;
}

// ---------- Setup ----------

/**
 * Setup: who plays and how. Each seat but yours is a CPU or a person here (pass-and-play on this
 * device); friends on other devices play through a room (Play with friends). A puzzle has its pick
 * instead (a difficulty, a topic), and no seats.
 */
function showSetup(g, previous, fromHistory = false) {
  stopMatch();
  screen = "setup";
  if (!fromHistory) mark("setup", g.id);
  document.title = `${g.name}: Games`;
  const data = store.get();
  const [min, max] = g.players;
  const cfg = previous ??
    setups[g.id] ?? {
      seats: [{ kind: "human", name: data.player.nick }, ...(max > 1 ? [{ kind: "cpu", name: "" }] : [])],
      level: "normal",
      pick: g.pick?.options[0][0],
      kid: g.pick ? false : data.settings.kid,
    };
  setups[g.id] = cfg;
  const draw = () => {
    let cpu = 0;
    const rows = cfg.seats.map((seat, i) => {
      const label = seat.kind === "cpu" ? `CPU ${++cpu}` : null;
      const kind = (to, text) =>
        el(
          "button",
          {
            type: "button",
            "aria-pressed": String(seat.kind === to),
            onclick: () => {
              if (seat.kind === to) return;
              seat.kind = to;
              seat.name = to === "human" ? `Player ${i + 1}` : "";
              draw();
            },
          },
          text,
        );
      return el(
        "li",
        { class: "seat" },
        seat.kind === "human"
          ? el(
              "span",
              { class: "seat-name" },
              el("label", { for: `seat-${i}` }, i === 0 ? "You" : `Player ${i + 1}`),
              el("input", {
                id: `seat-${i}`,
                value: seat.name,
                maxlength: "24",
                autocomplete: "off",
                oninput: (e) => {
                  seat.name = e.target.value;
                },
              }),
            )
          : el("span", { class: "seat-name cpu" }, label),
        i === 0
          ? null
          : el("span", { class: "kind", role: "group", "aria-label": `Seat ${i + 1}` }, kind("cpu", "CPU"), kind("human", "Person here")),
        i > 0 && cfg.seats.length > min
          ? el(
              "button",
              {
                type: "button",
                "aria-label": `Remove ${label ?? seat.name}`,
                onclick: () => {
                  cfg.seats.splice(i, 1);
                  draw();
                },
              },
              "Remove",
            )
          : null,
      );
    });
    const levels = cfg.kid ? ["easy"] : ["easy", "normal", "hard"];
    const radios = (name, list, now, set) =>
      list.map(([value, text]) =>
        el(
          "label",
          { class: "choice" },
          el("input", { type: "radio", name, value, checked: now === value, onchange: () => set(value) }),
          text,
        ),
      );
    show(
      el(
        "form",
        {
          class: "setup",
          onsubmit: (event) => {
            event.preventDefault();
            startMatch(g, cfg);
          },
        },
        el("h1", {}, g.name),
        el("p", { class: "about" }, g.about),
        // How to play: open until this device has finished a match of this game.
        g.how
          ? el(
              "details",
              { class: "how", open: store.totals(g.id).played === 0 },
              el("summary", {}, "How to play"),
              el("ol", {}, g.how.map((line) => el("li", {}, line))),
            )
          : null,
        // A puzzle's pick: its difficulty or its topic (index.json `pick`).
        g.pick
          ? el(
              "fieldset",
              { class: "levels pick" },
              el("legend", {}, g.pick.label),
              radios("pick", g.pick.options, cfg.pick, (value) => {
                cfg.pick = value;
              }),
            )
          : null,
        max > 1
          ? el(
              "fieldset",
              {},
              el("legend", {}, "Players"),
              el("ul", { class: "seats" }, rows),
              el("p", { class: "hint-text" }, "Person here: you pass this device on each turn."),
              cfg.seats.length < max
                ? el(
                    "button",
                    {
                      type: "button",
                      onclick: () => {
                        cfg.seats.push({ kind: "cpu", name: "" });
                        draw();
                      },
                    },
                    "Add a player",
                  )
                : null,
            )
          : null,
        cfg.seats.some((s) => s.kind === "cpu")
          ? el(
              "fieldset",
              { class: "levels" },
              el("legend", {}, "CPU level"),
              radios(
                "level",
                levels.map((lv) => [lv, LEVEL_NAMES[lv]]),
                cfg.kid ? "easy" : cfg.level,
                (value) => {
                  cfg.level = value;
                },
              ),
              cfg.kid ? el("p", { class: "hint-text" }, "Kid mode plays on easy.") : null,
            )
          : null,
        g.pick
          ? null
          : el(
              "label",
              { class: "choice kid" },
              el("input", {
                type: "checkbox",
                checked: cfg.kid,
                onchange: (e) => {
                  cfg.kid = e.target.checked;
                  draw();
                },
              }),
              "Kid mode: shows the moves you can make, with Hint and Undo",
            ),
        el(
          "div",
          { class: "row" },
          el("button", { class: "primary big", type: "submit" }, "Start"),
          el("button", { type: "button", onclick: home }, "Back to games"),
        ),
        max > 1 ? friendsSection(g) : null,
      ),
    );
  };
  draw();
  main.querySelector("h1")?.focus();
}

/**
 * Setup's Play with friends: friends on their own devices play through a room. A member starts
 * one here; a guest joins one by its code on the hub. Offline, it says play stays on this device.
 */
function friendsSection(g) {
  const pane = (...children) =>
    el("section", { class: "friends", "aria-labelledby": "friends-title" }, el("h2", { id: "friends-title" }, "Play with friends"), ...children);
  if (!navigator.onLine)
    return pane(el("p", {}, "Offline: play against the CPU, or pass this device. Friends on their own phones need signal."));
  if (!net.ready) return el("section", { class: "friends", hidden: true });
  if (net.member)
    return pane(
      el("p", {}, "Friends on their own phones join with a link or a code. No sign-in for them."),
      el(
        "button",
        { type: "button", class: "online-play", onclick: () => online().then((o) => o.startRoom(g)) },
        "Invite friends",
      ),
    );
  return pane(
    el("p", {}, "Got a code from a friend? Type it on the games list. To start a room yourself, sign in."),
    el("p", { class: "online-links" }, el("a", { href: "/member" }, "Sign in to invite friends")),
  );
}

// ---------- Match ----------

export function stopMatch() {
  match?.engine?.stop();
  match?.off();
  match = null;
  document.querySelector(".pass")?.remove();
}

export async function load(id) {
  const [rules, view] = await Promise.all(filesOf(id).map((f) => import(f)));
  return { rules: rules.default, view: view.default };
}

/** A seed from today's date on this device (20261031): the same daily puzzle for everyone. */
const today = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

async function startMatch(g, cfg) {
  stopMatch();
  screen = "match";
  mark("match", g.id);
  show(el("p", { class: "loading", role: "status" }, `Getting ${g.name}…`));
  let code;
  try {
    code = await load(g.id);
  } catch (error) {
    console.warn("games: can't load", g.id, error);
    show(
      el("h1", {}, g.name),
      el("p", { class: "loading" }, `${g.name} needs signal once. Connect to the internet, then try again.`),
      el("button", { type: "button", onclick: home }, "Back to games"),
    );
    return;
  }
  // Back (or another screen) while the game loaded: the match doesn't open over it.
  if (screen !== "match") return;
  // The name typed for "You" is this device's name from now on (no separate question for it).
  const mine = (cfg.seats[0].name || "").trim();
  if (mine && mine !== store.get().player.nick) store.setNick(mine);
  let cpu = 0;
  const level = cfg.kid ? "easy" : cfg.level;
  const seats = cfg.seats.map((s, i) => ({
    kind: s.kind,
    level,
    name:
      s.kind === "cpu"
        ? `CPU ${++cpu}`
        : (s.name || "").trim().slice(0, 24) || (i === 0 ? store.get().player.nick : `Player ${i + 1}`),
  }));
  const humans = seats.flatMap((s, i) => (s.kind === "human" ? [i] : []));
  const transport = createLocal(seats);
  const pick = g.pick ? cfg.pick : undefined;
  const seed = g.pick?.daily === pick && pick ? today() : crypto.getRandomValues(new Uint32Array(1))[0];
  const engine = createEngine({ game: code.rules, seats, seed, pick, transport, delay: CPU_PAUSE });
  const m = {
    g,
    cfg,
    ...code,
    seats,
    humans,
    names: seats.map((s) => s.name),
    level: pick ?? (seats.some((s) => s.kind === "cpu") ? level : "friends"),
    engine,
    transport,
    views: [],
    shown: humans[0],
    passed: null,
    hint: null,
    log: [],
    seq: -1,
    off: () => {},
  };
  match = m;
  drawMatchFrame(m);
  m.off = transport.onMessage((msg) => onEngine(m, msg));
  engine.start();
}

/**
 * The match screen for a match this page doesn't run alone (online: the host's engine, through the
 * room). `me` is this device's seat, or null to watch (a spectator, or a table: AC9.1). Returns
 * the function that takes the engine's messages for this device.
 * @param {{g: object, rules: object, view: object, seats: {name: string, kind: string}[],
 *   me: number | null, send: (msg: object) => void, online: object}} o
 */
export function showMatch(o) {
  stopMatch();
  screen = "match";
  const m = {
    g: o.g,
    cfg: { kid: false },
    rules: o.rules,
    view: o.view,
    seats: o.seats,
    humans: o.me === null ? [] : [o.me],
    names: o.seats.map((s) => s.name),
    level: "online",
    engine: null,
    transport: { send: o.send },
    views: {},
    shown: o.me,
    passed: null,
    hint: null,
    log: [],
    seq: -1,
    off: () => {},
    online: o.online,
  };
  match = m;
  drawMatchFrame(m);
  return (msg) => onEngine(m, msg);
}

const send = (m, msg) => m.transport.send({ v: PROTOCOL, ...msg });

function drawMatchFrame(m) {
  document.title = `${m.g.name}: Games`;
  const board = el("div", { class: `board game-${m.g.id}`, id: "board" });
  // A spectator or a table only watches.
  if (m.online && m.shown === null) board.inert = true;
  bindBoard(board);
  const kid = m.cfg.kid;
  show(
    el(
      "section",
      {
        class: `match${kid ? " kid" : ""}${m.online?.table ? " big-table" : ""}`,
        "aria-labelledby": "match-title",
      },
      el(
        "div",
        { class: "match-bar" },
        el("button", { type: "button", class: "ghost", onclick: () => quit(m) }, "Quit"),
        el("h1", { id: "match-title" }, m.g.name),
        el("p", { class: "turn", id: "turn" }),
        // Kid mode and every puzzle (a hint is one right step; Undo takes back a move).
        kid || m.rules.puzzle
          ? el(
              "div",
              { class: "kid-tools" },
              el("button", { type: "button", id: "hint", onclick: () => askHint(m) }, "Hint"),
              el("button", { type: "button", id: "undo", onclick: () => undo(m) }, "Undo"),
            )
          : null,
        m.online?.bar ?? null,
      ),
      el("ul", { class: "chips", id: "chips", "aria-label": "Players" }),
      board,
      el("p", { class: "msg", id: "msg", role: "status" }),
      el(
        "aside",
        { class: "side", "aria-labelledby": "log-title" },
        el("h2", { id: "log-title" }, "Moves"),
        el("ol", { class: "log", id: "log" }),
      ),
    ),
  );
}

function quit(m) {
  if (m.online) m.online.leave();
  else if (m.ended || window.confirm(LEAVE)) {
    stopMatch();
    home();
  }
}

function askHint(m) {
  send(m, { t: "hint", seat: m.shown });
}

function undo(m) {
  m.hint = null;
  send(m, { t: "undo", seat: m.shown });
}

function say(text) {
  const msg = document.getElementById("msg");
  if (msg) msg.textContent = text;
}

function onEngine(m, msg) {
  if (match !== m) return;
  if (m.online) {
    // Online, this device gets only its own seat's view, or the public one when it watches.
    if ((msg.t === "view" && msg.seat === m.shown) || (msg.t === "public" && m.shown === null)) {
      m.views[m.shown] = msg;
      update(m);
      return;
    }
  }
  if (msg.t === "view") {
    m.views[msg.seat] = msg;
    if (msg.seat === m.seats.length - 1) update(m);
  } else if (msg.t === "refused" && msg.seat === m.shown) {
    say(msg.reason);
    announce(msg.reason);
    sound("bad");
  } else if (msg.t === "hinted" && msg.seat === m.shown) {
    m.hint = msg.move;
    draw(m);
    say(m.view.hintText?.(msg.move, m.views[m.shown].view, m.names) ?? "Try the move that glows.");
  } else if (msg.t === "end" && !m.ended) {
    m.ended = true;
    finish(m, msg.places);
  } else if (msg.t === "crash") {
    m.ended = true;
    show(
      el("h1", {}, m.g.name),
      el("p", { class: "loading" }, msg.reason),
      el(
        "div",
        { class: "row" },
        m.online
          ? m.online.actions()
          : el("button", { type: "button", class: "primary", onclick: () => startMatch(m.g, m.cfg) }, "Start again"),
        el("button", { type: "button", onclick: home }, "Back to games"),
      ),
    );
  }
}

async function update(m) {
  const v = m.online ? m.views[m.shown] : m.views[0];
  const turn = v.turn;
  const fresh = v.seq !== m.seq;
  m.seq = v.seq;
  if (fresh) {
    m.hint = null;
    say("");
    if (v.last && v.note) {
      const text = fillNames(v.note, m.names);
      m.log.unshift(text);
      say(`${text}.`);
      announce(text);
      const own = m.view.sound?.(v.last.move, v.note);
      sound(own ?? (m.seats[v.last.seat].kind === "human" ? "mine" : "move"));
    }
  }
  // The turn banner, when the turn passes to a person (the pass screen says it on its own).
  let flag = !v.places && turn !== m.turnSeen && m.seats[turn].kind === "human";
  m.turnSeen = turn;
  if (!m.online && !v.places && m.seats[turn].kind === "human") {
    if (m.rules.hidden && m.humans.length > 1 && m.passed !== turn) {
      m.passed = turn;
      flag = false;
      draw(m, true);
      await passScreen(m.names[turn]);
      if (match !== m) return;
    }
    m.shown = turn;
  }
  draw(m);
  if (flag) banner(turnText(m, v));
}

/**
 * A short banner over the board: whose turn it is, or (`end`) how the match ended, with a burst of
 * confetti for a win. Screen readers get the same words from the turn line and the live region.
 */
function banner(text, end = false, win = false) {
  document.querySelector(".banner")?.remove();
  const node = el("p", { class: `banner${end ? " end" : ""}`, "aria-hidden": "true" }, text);
  if (win)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const far = i % 2 ? 6 : 9;
      const x = (Math.cos(angle) * far).toFixed(1);
      const y = (Math.sin(angle) * far * 0.6).toFixed(1);
      node.append(el("i", { class: "bit", style: `--x:${x}rem;--y:${y}rem;--c:var(--${CONFETTI[i % 4]})` }));
    }
  document.querySelector(".match")?.append(node);
  if (!end) setTimeout(() => node.remove(), 1400);
}

function turnText(m, v) {
  if (v.places) return "Match over";
  const who = m.seats[v.turn];
  if (who.kind === "cpu") return `${who.name} is playing…`;
  if (m.online) return v.turn === m.shown ? "Your turn" : `${who.name}'s turn`;
  return m.humans.length > 1 ? `${who.name}'s turn` : "Your turn";
}

function draw(m, covered = false) {
  const board = document.getElementById("board");
  if (!board || match !== m) return;
  const v = m.views[m.shown];
  const turnLine = document.getElementById("turn");
  turnLine.textContent = covered ? "" : turnText(m, v);
  const chips = document.getElementById("chips");
  chips.replaceChildren(
    ...m.seats.map((s, i) => {
      const status = m.view.status(v.view, i);
      // A CPU on its turn shows three dots while it thinks.
      const thinking = i === v.turn && s.kind === "cpu" && !v.places;
      return el(
        "li",
        {
          class: `chip${i === v.turn ? " active" : ""}${thinking ? " thinking" : ""}`,
          "aria-current": i === v.turn ? "true" : null,
        },
        status.color ? el("span", { class: "dot", style: `background:${status.color}` }) : null,
        el("strong", {}, s.name),
        el("span", {}, status.text),
        thinking ? el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")) : null,
      );
    }),
  );
  document.getElementById("log").replaceChildren(...m.log.slice(0, 30).map((t) => el("li", {}, t)));
  const hint = document.getElementById("hint");
  const undoButton = document.getElementById("undo");
  const mine = !covered && v.legal.length > 0;
  if (hint) hint.disabled = !mine;
  if (undoButton) undoButton.disabled = !m.engine.canUndo();
  const had = board.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  if (covered) {
    board.replaceChildren();
    return;
  }
  const first = !m.dealt;
  m.dealt = true;
  m.view.render(board, {
    view: v.view,
    legal: v.legal,
    me: m.shown,
    turn: v.turn,
    names: m.names,
    kid: m.cfg.kid,
    hint: m.hint,
    layout: layout(),
    first,
    play: (move) => send(m, { t: "move", seat: m.shown, seq: v.seq, move }),
    say,
  });
  // The deal: on a match's first look, the cards, tiles or answers come in one after another.
  if (first)
    board.querySelectorAll(".hand > *, .memory > *, .answers > *").forEach((n, i) => {
      n.classList.add("dealt");
      n.style.setProperty("--i", String(i));
    });
  refresh(board, m.hint ? board.querySelector(".hint")?.dataset.key : had, Boolean(had) || Boolean(m.hint));
}

function finish(m, places) {
  // Online, the Hub keeps the score (AC7.1); this device's own scores are for its own matches.
  const me = m.online ? m.shown : 0;
  const place = 1 + places.findIndex((group) => group.includes(me));
  const solo = m.seats.length === 1;
  const won = solo || (places[0].includes(me) && places[0].length === 1);
  if (!m.online)
    store.record({ game: m.g.id, level: m.level, won, place: places.slice(0, place - 1).flat().length + 1, at: new Date().toISOString() });
  const firsts = places[0].map((i) => m.names[i]);
  const headline = m.rules.puzzle
    ? "Solved!"
    : places.length === 1 && !solo
      ? "It's a draw"
      : m.humans.length === 1
        ? won
          ? "You won!"
          : `${firsts.join(" and ")} won`
        : `${firsts.join(" and ")} won!`;
  if (won || m.humans.length > 1) sound("win");
  // Confetti for a win on this device, or any winner among friends; none for a draw.
  const cheer = (won || m.humans.length > 1) && (solo || places.length > 1);
  announce(headline);
  banner(headline, true, cheer);
  setTimeout(() => {
    if (match !== m) return;
    let rank = 1;
    show(
      el(
        "section",
        { class: `result${cheer ? " won" : ""}`, "aria-labelledby": "result-title" },
        el("h1", { id: "result-title" }, headline),
        el(
          "ol",
          { class: "places" },
          places.map((group) => {
            const item = el("li", {}, el("strong", {}, `${group.length > 1 ? "=" : ""}${ordinal(rank)}`), ` ${group.map((i) => m.names[i]).join(", ")}`);
            rank += group.length;
            return item;
          }),
        ),
        el(
          "div",
          { class: "row" },
          m.online
            ? m.online.actions()
            : [
                el("button", { type: "button", class: "primary big", onclick: () => startMatch(m.g, m.cfg) }, "Play again"),
                el("button", { type: "button", onclick: home }, "Choose another game"),
              ],
        ),
      ),
    );
    main.querySelector("h1")?.focus();
  }, 1500);
}

// ---------- Settings ----------

function openSettings() {
  const data = store.get();
  const dialog = el(
    "dialog",
    { class: "sheet", "aria-labelledby": "settings-title" },
    el(
      "form",
      { method: "dialog" },
      el("h2", { id: "settings-title" }, "Settings"),
      accountSection(),
      el("label", { for: "nick" }, "Your name"),
      el("input", {
        id: "nick",
        value: data.player.nick,
        maxlength: "24",
        autocomplete: "nickname",
        onchange: (e) => store.setNick(e.target.value),
      }),
      el(
        "label",
        { class: "choice" },
        el("input", { type: "checkbox", id: "kid", checked: data.settings.kid, onchange: (e) => store.setSettings({ kid: e.target.checked }) }),
        "Kid mode for new matches",
      ),
      el("label", { for: "theme" }, "Theme"),
      el(
        "select",
        {
          id: "theme",
          onchange: (e) => {
            store.setSettings({ theme: e.target.value });
            applySettings();
          },
        },
        [
          ["auto", "Same as this device"],
          ["light", "Light"],
          ["dark", "Dark"],
          ["contrast", "High contrast"],
        ].map(([value, label]) => el("option", { value, selected: data.settings.theme === value }, label)),
      ),
      el(
        "label",
        { class: "choice" },
        el("input", {
          type: "checkbox",
          id: "sound",
          checked: data.settings.sound,
          onchange: (e) => {
            store.setSettings({ sound: e.target.checked });
            applySettings();
          },
        }),
        "Sounds",
      ),
      el("h3", {}, "Play with no signal"),
      el("p", { class: "hint-text" }, "Each game is saved here the first time you open it, or save them all now."),
      el("button", { type: "button", id: "download-all", onclick: downloadAll }, "Download all for offline"),
      el("p", { id: "download-status", role: "status" }),
      store.kept ? null : el("p", { class: "warn" }, "This browser isn't keeping data (private mode?), so your scores won't be kept."),
      install ? el("button", { type: "button", onclick: () => install?.() }, "Install Games") : null,
      el("div", { class: "row" }, el("button", { class: "primary", value: "done" }, "Done")),
    ),
  );
  dialog.addEventListener("close", () => {
    dialog.remove();
    drawMe();
    if (screen === "hub") showHub();
  });
  document.body.append(dialog);
  dialog.showModal();
}

// ---------- Start ----------

async function startApp() {
  if (!supported()) {
    document.getElementById("boot").hidden = true;
    document.getElementById("old").hidden = false;
    return;
  }
  applySettings();
  persist();
  layout = watchLayout(() => match?.views[match.shown] && draw(match));
  const offline = document.getElementById("offline");
  const signal = () => {
    offline.hidden = navigator.onLine;
    // The friends parts hide offline (Setup says play stays on this device) and come back online.
    redrawOnline();
  };
  window.addEventListener("online", () => {
    signal();
    // Opened offline, the member check failed: try again now.
    checkOnline();
  });
  window.addEventListener("offline", signal);
  signal();
  document.getElementById("open-settings").addEventListener("click", openSettings);
  document.getElementById("home").addEventListener("click", (event) => {
    event.preventDefault();
    if (match && !match.ended) quit(match);
    else home();
  });
  document.addEventListener("keydown", (event) => {
    if (!match?.cfg.kid || event.target.closest?.("input, select, textarea")) return;
    if (event.key === "h") askHint(match);
    if (event.key === "u") undo(match);
  });
  setupInstall({
    onInstallable: (prompt) => {
      install = prompt;
      if (screen === "hub") showHub();
    },
    onUpdate: (apply) => {
      const bar = document.getElementById("update");
      bar.hidden = false;
      document.getElementById("apply-update").onclick = apply;
    },
  });
  try {
    allGames = await (await fetch("/games/index.json")).json();
    games = allGames;
  } catch {
    show(el("p", { class: "loading" }, "Games needs signal the first time. Connect, then reload."));
    return;
  }
  window.addEventListener("popstate", route);
  route();
  checkOnline();
}

/** The page for this address and history entry: a room's link (/r/<code>), a Setup, or the hub. */
function route() {
  const room = location.pathname.match(ROOM_PATH);
  if (room) return online().then((o) => o.openRoom(room[1].toUpperCase()));
  const at = history.state;
  // Back from a match in play asks first; No keeps the match, and its entry comes back.
  if (match && !match.ended && !match.online && at?.s !== "match") {
    if (!window.confirm(LEAVE)) return history.pushState({ s: "match", game: match.g.id, d: 2 }, "", "/");
    stopMatch();
  }
  const g = at?.game ? gameById(at.game) : null;
  if (g && at.s === "match") history.replaceState({ s: "setup", game: g.id, d: 1 }, "", "/");
  if (g) showSetup(g, undefined, true);
  else if (screen !== "hub") showHub();
}

/** Online or offline, signed in or not: the parts that depend on it, redrawn in place. */
function redrawOnline() {
  drawMe();
  if (screen === "hub") document.getElementById("online-slot")?.replaceChildren(...[onlineSection()].filter(Boolean));
  const friends = main.querySelector(".setup .friends");
  const g = screen === "setup" ? gameById(history.state?.game) : null;
  if (friends && g) friends.replaceWith(friendsSection(g));
}

/**
 * The admin's catalogue (which games are on, featured first, their order; AC8.2) and whether this
 * device's member is signed in (AC5.1). One call each per open; the service worker keeps the last
 * catalogue for offline. A signed-out fetch of a member path gets Access's redirect, not JSON.
 */
async function checkOnline() {
  const before = JSON.stringify([games.map((g) => g.id), net]);
  try {
    const res = await fetch("/api/catalog");
    if (res.ok) {
      const data = await res.json();
      games = arrange(allGames, data.games ?? []);
      net.ready = data.online === true;
    }
  } catch {
    // Offline, or no catalogue yet: every game, as the app has them.
  }
  if (net.ready) {
    try {
      const res = await fetch("/api/member/me", { redirect: "manual" });
      const me = res.ok ? await res.json() : null;
      net.member = Boolean(me?.email);
      net.email = typeof me?.email === "string" ? me.email : "";
      net.admin = me?.admin === true;
    } catch {
      net.member = false;
    }
  }
  // Only the online parts and the shelf change, in place: a name being typed stays.
  if (JSON.stringify([games.map((g) => g.id), net]) === before) return;
  redrawOnline();
  if (screen === "hub") {
    main.querySelector(".shelf")?.replaceChildren(...games.map(gameBox));
    markCached();
  }
}

/** The games on, featured first, then in the admin's order, then as index.json lists them. */
function arrange(list, catalog) {
  const row = new Map(catalog.map((r) => [r.game, r]));
  return list
    .filter((g) => row.get(g.id)?.enabled !== false)
    .map((g, i) => ({ ...g, featured: row.get(g.id)?.featured === true, order: row.get(g.id)?.sort ?? 1000 + i }))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order);
}

startApp();
