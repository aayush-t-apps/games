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

const TYPES = { cards: "Cards", board: "Board game", kids: "Kids" };
const LEVEL_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" };
const CPU_PAUSE = 600;

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
const net = { ready: false, member: false, admin: false };
/** What online.js does when the player leaves its screens for the hub. */
let onlineExit = null;

export const filesOf = (id) => [`/games/${id}/rules.js`, `/games/${id}/view.js`];
export const players = ([min, max]) =>
  min === max ? `${min} players` : `${min}–${max} ${max === 1 ? "player" : "players"}`;
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
  const data = store.get();
  show(
    store.firstVisit ? welcome() : null,
    el("h1", { class: "hub-title" }, `Pick a game, ${data.player.nick}`),
    onlineSection(),
    el("ul", { class: "shelf" }, games.map(gameBox)),
    el(
      "section",
      { class: "offline-row", "aria-labelledby": "offline-title" },
      el("h2", { id: "offline-title" }, "Play with no signal"),
      el("p", {}, "Each game is saved on this device the first time you open it, or save them all now."),
      el("button", { type: "button", id: "download-all", onclick: downloadAll }, "Download all for offline"),
      el("p", { id: "download-status", role: "status" }),
    ),
    scoresSection(),
    installSection(),
  );
  markCached();
}

function welcome() {
  const input = el("input", {
    id: "first-nick",
    name: "nick",
    autocomplete: "nickname",
    maxlength: "24",
    placeholder: "Player",
  });
  const form = el(
    "form",
    {
      class: "welcome",
      onsubmit: (event) => {
        event.preventDefault();
        store.setNick(input.value);
        showHub();
      },
    },
    el("h2", {}, "Welcome! What should we call you?"),
    el("label", { for: "first-nick" }, "Your name (you can skip this)"),
    el(
      "div",
      { class: "row" },
      input,
      el("button", { class: "primary", type: "submit" }, "Save name"),
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            store.setNick("");
            showHub();
          },
        },
        "Skip",
      ),
    ),
  );
  return form;
}

function gameBox(g) {
  const playable = net.member && g.players[1] >= 2;
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
        { class: "primary", type: "button", "aria-label": `Play ${g.name}`, onclick: () => showSetup(g) },
        "Play",
      ),
      playable
        ? el(
            "button",
            {
              type: "button",
              class: "online-play",
              "aria-label": `Play ${g.name} online`,
              onclick: () => online().then((o) => o.startRoom(g)),
            },
            "Play online",
          )
        : null,
    ),
  );
}

/** Online play on the hub (AC5.1): sign in, join a room, the online scores. Hidden until set up. */
function onlineSection() {
  if (!net.ready || !navigator.onLine) return null;
  return el(
    "section",
    { class: "online-row", "aria-labelledby": "online-title" },
    el("h2", { id: "online-title" }, "Play with friends online"),
    el(
      "p",
      {},
      net.member
        ? "Pick Play online on a game, then share the room's link, code or QR code."
        : "Members start rooms. Anyone with a room's link or code joins, with no sign-in.",
    ),
    el(
      "div",
      { class: "row" },
      net.member ? null : el("a", { class: "button primary", href: "/member" }, "Sign in to play online"),
      el("button", { type: "button", onclick: () => online().then((o) => o.showJoin()) }, "Join a room"),
      el("button", { type: "button", onclick: () => online().then((o) => o.showScores()) }, "Online scores"),
      net.admin ? el("a", { class: "button", href: "/admin" }, "Admin") : null,
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

function showSetup(g, previous) {
  stopMatch();
  screen = "setup";
  document.title = `${g.name}: Games`;
  const data = store.get();
  const [min, max] = g.players;
  const cfg = previous ?? {
    seats: [{ kind: "human", name: data.player.nick }, ...(max > 1 ? [{ kind: "cpu", name: "" }] : [])],
    level: "normal",
    kid: data.settings.kid,
  };
  const draw = () => {
    let cpu = 0;
    const rows = cfg.seats.map((seat, i) => {
      const label = seat.kind === "cpu" ? `CPU ${++cpu}` : null;
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
          : el(
              "button",
              {
                type: "button",
                onclick: () => {
                  seat.kind = seat.kind === "cpu" ? "human" : "cpu";
                  seat.name = seat.kind === "human" ? `Player ${i + 1}` : "";
                  draw();
                },
              },
              seat.kind === "cpu" ? "Make it a person" : "Make it a CPU",
            ),
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
        el(
          "fieldset",
          {},
          el("legend", {}, "Players"),
          el("ul", { class: "seats" }, rows),
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
        ),
        el(
          "fieldset",
          { class: "levels" },
          el("legend", {}, "CPU level"),
          levels.map((lv) =>
            el(
              "label",
              { class: "choice" },
              el("input", {
                type: "radio",
                name: "level",
                value: lv,
                checked: (cfg.kid ? "easy" : cfg.level) === lv,
                onchange: () => {
                  cfg.level = lv;
                },
              }),
              LEVEL_NAMES[lv],
            ),
          ),
          cfg.kid ? el("p", { class: "hint-text" }, "Kid mode plays on easy.") : null,
        ),
        el(
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
          el("button", { type: "button", onclick: showHub }, "Back to games"),
        ),
      ),
    );
  };
  draw();
  main.querySelector("h1")?.focus();
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

async function startMatch(g, cfg) {
  stopMatch();
  screen = "match";
  show(el("p", { class: "loading", role: "status" }, `Getting ${g.name}…`));
  let code;
  try {
    code = await load(g.id);
  } catch (error) {
    console.warn("games: can't load", g.id, error);
    show(
      el("h1", {}, g.name),
      el("p", { class: "loading" }, `${g.name} needs signal once. Connect to the internet, then try again.`),
      el("button", { type: "button", onclick: showHub }, "Back to games"),
    );
    return;
  }
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
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const engine = createEngine({ game: code.rules, seats, seed, transport, delay: CPU_PAUSE });
  const m = {
    g,
    cfg,
    ...code,
    seats,
    humans,
    names: seats.map((s) => s.name),
    level: seats.some((s) => s.kind === "cpu") ? level : "friends",
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
        kid
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
  else if (m.ended || window.confirm("Leave this match? It won't be kept.")) showHub();
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
        el("button", { type: "button", onclick: showHub }, "Back to games"),
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
      sound(m.seats[v.last.seat].kind === "human" ? "mine" : "move");
    }
  }
  if (!m.online && !v.places && m.seats[turn].kind === "human") {
    if (m.rules.hidden && m.humans.length > 1 && m.passed !== turn) {
      m.passed = turn;
      draw(m, true);
      await passScreen(m.names[turn]);
      if (match !== m) return;
    }
    m.shown = turn;
  }
  draw(m);
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
      return el(
        "li",
        { class: `chip${i === v.turn ? " active" : ""}`, "aria-current": i === v.turn ? "true" : null },
        status.color ? el("span", { class: "dot", style: `background:${status.color}` }) : null,
        el("strong", {}, s.name),
        el("span", {}, status.text),
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
  m.view.render(board, {
    view: v.view,
    legal: v.legal,
    me: m.shown,
    turn: v.turn,
    names: m.names,
    kid: m.cfg.kid,
    hint: m.hint,
    layout: layout(),
    play: (move) => send(m, { t: "move", seat: m.shown, seq: v.seq, move }),
    say,
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
  const headline =
    places.length === 1 && !solo
      ? "It's a draw"
      : m.humans.length === 1
        ? won
          ? "You won!"
          : `${firsts.join(" and ")} won`
        : `${firsts.join(" and ")} won!`;
  if (won || m.humans.length > 1) sound("win");
  announce(headline);
  setTimeout(() => {
    if (match !== m) return;
    let rank = 1;
    show(
      el(
        "section",
        { class: "result", "aria-labelledby": "result-title" },
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
                el("button", { type: "button", onclick: showHub }, "Choose another game"),
              ],
        ),
      ),
    );
    main.querySelector("h1")?.focus();
  }, 1200);
}

// ---------- Settings ----------

function openSettings() {
  const data = store.get();
  const status = el("p", { role: "status", id: "import-status" });
  const dialog = el(
    "dialog",
    { class: "sheet", "aria-labelledby": "settings-title" },
    el(
      "form",
      { method: "dialog" },
      el("h2", { id: "settings-title" }, "Settings"),
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
      el("h3", {}, "Move your scores to another device"),
      el("div", { class: "row" }, el("button", { type: "button", id: "export", onclick: exportData }, "Export my data")),
      el("label", { for: "import" }, "Import a save file"),
      el("input", { type: "file", id: "import", accept: ".json,application/json", onchange: (e) => importData(e.target, status) }),
      status,
      store.kept ? null : el("p", { class: "warn" }, "This browser isn't keeping data (private mode?), so your scores won't be kept."),
      install ? el("button", { type: "button", onclick: () => install?.() }, "Install Games") : null,
      el("div", { class: "row" }, el("button", { class: "primary", value: "done" }, "Done")),
    ),
  );
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (screen === "hub") showHub();
  });
  document.body.append(dialog);
  dialog.showModal();
}

function exportData() {
  const blob = new Blob([store.exportText()], { type: "application/json" });
  const link = el("a", { href: URL.createObjectURL(blob), download: "games-save.json" });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importData(input, status) {
  const file = input.files?.[0];
  if (!file) return;
  const why = file.size > 100_000 ? "This file is too big to be a Games save." : store.importText(await file.text());
  status.textContent = why ?? "Save loaded.";
  status.className = why ? "warn" : "";
  input.value = "";
  if (!why) {
    applySettings();
    document.getElementById("nick").value = store.get().player.nick;
  }
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
  };
  window.addEventListener("online", signal);
  window.addEventListener("offline", signal);
  signal();
  document.getElementById("open-settings").addEventListener("click", openSettings);
  document.getElementById("home").addEventListener("click", (event) => {
    event.preventDefault();
    if (match && !match.ended) quit(match);
    else showHub();
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

/** The page for this address: a room's link (/r/<code>), or the hub. */
function route() {
  const room = location.pathname.match(ROOM_PATH);
  if (room) online().then((o) => o.openRoom(room[1].toUpperCase()));
  else if (screen !== "hub") showHub();
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
      net.admin = me?.admin === true;
    } catch {
      net.member = false;
    }
  }
  if (screen === "hub" && JSON.stringify([games.map((g) => g.id), net]) !== before) showHub();
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
