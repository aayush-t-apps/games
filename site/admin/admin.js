// The admin page (changes 0003, 0004; AC8.1–AC8.8): Overview, Games, Rooms and Scores, for the
// owner only. One call per tab open or Refresh; nothing polls. Game details come from index.json.
import { el } from "/lib/ui.js";
import { sortable } from "/admin/sort.js";

const TABS = ["Overview", "Games", "Rooms", "Scores"];
const TYPES = { cards: "Cards", board: "Board game", kids: "Kids" };
const DAY = 24 * 60 * 60 * 1000;
const RESTORE_DAYS = 30;
const NEW_GAME = "https://github.com/aayush-t-apps/shipify/issues/new?title=games%3A%20add%20";
const MEMBERS = "https://one.dash.cloudflare.com/";
const main = document.getElementById("main");
let games = [];
let tab = "Overview";
let email = "";
/** The last Overview, so Scores opens on the most played game with no extra call. */
let last = null;
/** The bookmark that undoes the last restore made on this page. */
let undo = null;

async function api(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    redirect: "manual",
    headers: { "content-type": "application/json" },
  });
  if (res.type === "opaqueredirect") return { status: 401, body: null };
  return { status: res.status, body: await res.json().catch(() => null) };
}

function stop(status) {
  const text =
    status === 403
      ? "This page is for the owner. Sign in with the email in ADMIN_EMAIL."
      : status === 503
        ? "Sign-in isn't set up yet: see docs/adr/0001-members-sign-in-with-access.md, Setup."
        : status === 401
          ? "Your sign-in ended. Open /admin again to sign in."
          : "The admin page needs signal. Connect, then reload.";
  main.replaceChildren(
    el("h1", {}, "Admin"),
    el("p", { class: "loading", role: "status" }, text),
    el("p", {}, el("a", { class: "button", href: "/" }, "Back to the games")),
  );
}

const nameOf = (id) => games.find((g) => g.id === id)?.name ?? id;
const date = (at) =>
  at
    ? new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "never";
const time = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const minutes = (secs) => (secs ? `${Math.round(secs / 60)} min` : "–");
/** A cell whose sort value differs from its text. */
const td = (text, sort) => el("td", sort === undefined ? {} : { dataset: { sort } }, text);
/** A table that scrolls on its own on a phone; its column heads sort it. */
const table = (caption, head, rows) =>
  el(
    "div",
    { class: "table-wrap" },
    sortable(
      el(
        "table",
        {},
        el("caption", { class: "sr-only" }, caption),
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            head.map((h) => (h ? el("th", { scope: "col" }, h) : el("th", { scope: "col", dataset: { nosort: "" } }, el("span", { class: "sr-only" }, "Actions")))),
          ),
        ),
        el("tbody", {}, rows),
      ),
    ),
  );
const toolbar = (...children) => el("div", { class: "row toolbar" }, ...children);
const refresh = (name) => el("button", { type: "button", onclick: () => open(name) }, "Refresh");

function frame(...body) {
  const tabs = TABS.map((name) =>
    el(
      "button",
      {
        type: "button",
        role: "tab",
        id: `tab-${name}`,
        "aria-controls": "panel",
        "aria-selected": name === tab ? "true" : "false",
        tabindex: name === tab ? "0" : "-1",
        onclick: () => open(name),
      },
      name,
    ),
  );
  const list = el("div", { class: "tabs", role: "tablist", "aria-label": "Admin" }, tabs);
  // Arrow keys move between the tabs (the ARIA tabs pattern).
  list.addEventListener("keydown", (e) => {
    const i = TABS.indexOf(tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    open(TABS[(to + TABS.length) % TABS.length]).then(() => document.getElementById(`tab-${tab}`)?.focus());
  });
  main.replaceChildren(
    el(
      "header",
      { class: "admin-head" },
      el("div", {}, el("h1", {}, "Admin"), email ? el("p", { class: "who-am-i" }, `Signed in as ${email}`) : null),
      el("a", { class: "button", href: MEMBERS, target: "_blank", rel: "noopener" }, "Members"),
    ),
    list,
    el("section", { class: "panel", id: "panel", role: "tabpanel", "aria-labelledby": `tab-${tab}` }, ...body),
  );
}

async function open(name) {
  tab = name;
  frame(el("p", { class: "loading", role: "status" }, "Loading…"));
  if (name === "Overview") return overview();
  if (name === "Games") return catalogue();
  if (name === "Rooms") return rooms();
  return scores(mostPlayed());
}

const mostPlayed = () =>
  [...(last?.games ?? [])].sort((a, b) => b.d30 - a.d30)[0]?.game ?? games.find((g) => g.players[1] >= 2)?.id ?? games[0]?.id;

// ---------- Overview (AC8.1, AC8.6) ----------

async function overview() {
  const { status, body: s } = await api("/api/admin/stats");
  if (status !== 200) return stop(status);
  last = s;
  const on = (id) => s.catalog.find((r) => r.game === id)?.enabled !== false;
  const per = new Map(s.games.map((g) => [g.game, g]));
  const byType = {};
  for (const g of games) byType[g.type] = (byType[g.type] ?? 0) + (per.get(g.id)?.d30 ?? 0);
  const quiet = games.filter((g) => on(g.id) && (s.last[g.id] ?? 0) < s.now - 60 * DAY);
  const most = [...s.games].sort((a, b) => b.d30 - a.d30)[0];
  const kb = games.reduce((n, g) => n + g.kb, 0);
  const largest = [...games].sort((a, b) => b.kb - a.kb)[0];
  const members = [...new Set(s.live.map((r) => r.member))];
  const people = s.live.reduce((n, r) => n + (r.players ?? 0), 0);
  const month = s.games.reduce((n, g) => n + g.d30, 0);
  const fact = (n, label) => el("li", { class: "fact" }, el("strong", {}, n), el("span", {}, label));
  const hints = [
    ...quiet.map((g) => `${g.name}: not played online in 60 days. Turn it off?`),
    most?.d30 ? `${nameOf(most.game)}: the most played in 30 days. Feature it?` : null,
  ].filter(Boolean);
  frame(
    toolbar(refresh("Overview"), el("a", { class: "button", href: "https://dash.cloudflare.com/", target: "_blank", rel: "noopener" }, "Free-plan use")),
    el("h2", {}, "Today"),
    el(
      "ul",
      { class: "facts" },
      fact(s.live.length, s.live.length === 1 ? "live room" : "live rooms"),
      fact(people, people === 1 ? "person in them" : "people in them"),
      fact(s.today, "matches today (UTC)"),
      fact(month, "matches in 30 days"),
    ),
    members.length ? el("p", {}, `Rooms by: ${members.join(", ")}.`) : null,
    el("h2", {}, "Games"),
    table(
      "Games",
      ["Game", "Type", "Players", "Size", "On", "7 days", "30 days", "Avg length", "Avg players", "Last played"],
      games.map((g) => {
        const p = per.get(g.id);
        return el(
          "tr",
          {},
          el("th", { scope: "row" }, g.name),
          td(TYPES[g.type] ?? g.type),
          td(`${g.players[0]}–${g.players[1]}`, g.players[1]),
          td(`${g.kb} KB`, g.kb),
          td(on(g.id) ? "on" : "off"),
          td(p?.d7 ?? 0),
          td(p?.d30 ?? 0),
          td(minutes(p?.avgSecs), p?.avgSecs ?? 0),
          td(p?.avgSeats || "–", p?.avgSeats ?? 0),
          td(date(s.last[g.id]), s.last[g.id] ?? 0),
        );
      }),
    ),
    el("h2", {}, "Hints"),
    hints.length
      ? [el("ul", { class: "hints" }, hints.map((h) => el("li", {}, h))), toolbar(el("button", { type: "button", onclick: () => open("Games") }, "Open Games"))]
      : el("p", {}, "No hints yet."),
    el("h2", {}, "Matches by type, 30 days"),
    table(
      "Matches by type",
      ["Type", "Matches"],
      Object.entries(byType).map(([t, n]) => el("tr", {}, el("th", { scope: "row" }, TYPES[t] ?? t), td(n))),
    ),
    el("h2", {}, "Size of the app"),
    el("p", {}, `${games.length} games, ${kb} KB in all. The largest: ${largest?.name} (${largest?.kb} KB).`),
  );
}

// ---------- Games (AC8.2) ----------

async function catalogue() {
  const { status, body } = await api("/api/admin/catalog");
  if (status !== 200) return stop(status);
  const row = new Map(body.map((r) => [r.game, r]));
  const list = games
    .map((g, i) => ({
      game: g.id,
      enabled: row.get(g.id)?.enabled ?? true,
      featured: row.get(g.id)?.featured ?? false,
      sort: row.get(g.id)?.sort ?? 1000 + i,
    }))
    .sort((a, b) => a.sort - b.sort);
  const note = el("p", { role: "status", class: "note" });
  const save = async () => {
    note.textContent = "Saving…";
    const rows = list.map((r, i) => ({ ...r, sort: i }));
    const res = await api("/api/admin/catalog", { method: "PUT", body: JSON.stringify(rows) }).catch(() => ({ status: 0 }));
    note.textContent =
      res.status === 200 ? "Saved. The hub shows it within about a minute." : (res.body?.text ?? "Not saved: check the signal, then Save again.");
  };
  const move = (i, by, focus) => {
    list.splice(i + by, 0, ...list.splice(i, 1));
    draw();
    document.getElementById(`${focus}-${list[i + by].game}`)?.focus();
  };
  const check = (r, key, label) =>
    el(
      "label",
      { class: "choice" },
      el("input", {
        type: "checkbox",
        checked: r[key],
        onchange: (e) => {
          r[key] = e.target.checked;
          note.textContent = "Not saved yet.";
        },
      }),
      label,
    );
  const draw = () =>
    frame(
      el("p", {}, "A game turned off leaves the hub and gets no new rooms; its scores stay. Featured games come first."),
      el(
        "ol",
        { class: "game-list" },
        list.map((r, i) => {
          const g = games.find((x) => x.id === r.game);
          return el(
            "li",
            { class: r.enabled ? "" : "off" },
            el("div", { class: "game-name" }, el("strong", {}, nameOf(r.game)), el("span", {}, `${TYPES[g?.type] ?? ""}, ${g?.kb ?? "?"} KB`)),
            check(r, "enabled", "On"),
            check(r, "featured", "Featured"),
            el(
              "div",
              { class: "row order" },
              el("button", { type: "button", id: `up-${r.game}`, "aria-label": `Move ${nameOf(r.game)} up`, disabled: i === 0, onclick: () => move(i, -1, "up") }, "↑"),
              el("button", { type: "button", id: `down-${r.game}`, "aria-label": `Move ${nameOf(r.game)} down`, disabled: i === list.length - 1, onclick: () => move(i, 1, "down") }, "↓"),
            ),
          );
        }),
      ),
      toolbar(
        el("button", { type: "button", class: "primary", onclick: save }, "Save"),
        el("a", { class: "button", href: NEW_GAME, target: "_blank", rel: "noopener" }, "Add a game"),
      ),
      note,
    );
  draw();
}

// ---------- Rooms (AC8.3, AC8.6) ----------

async function rooms() {
  const { status, body } = await api("/api/admin/rooms");
  if (status !== 200) return stop(status);
  const ago = (at) => `${Math.max(1, Math.round((Date.now() - at) / 60000))} min ago`;
  frame(
    toolbar(refresh("Rooms")),
    body.length
      ? table(
          "Live rooms",
          ["Room", "Game", "Players", "Started by", "Started", "Ends", ""],
          body.map((r) =>
            el(
              "tr",
              {},
              el("th", { scope: "row" }, el("a", { href: `/r/${r.code}` }, r.code)),
              td(nameOf(r.game)),
              td(r.players ?? 0),
              td(r.member),
              td(ago(r.started), r.started),
              td(new Date(r.expires).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }), r.expires),
              el(
                "td",
                {},
                el(
                  "button",
                  {
                    type: "button",
                    class: "danger",
                    "aria-label": `Close room ${r.code}`,
                    onclick: async () => {
                      if (!window.confirm(`Close room ${r.code} on every device?`)) return;
                      await api(`/api/admin/rooms/${r.code}`, { method: "DELETE" });
                      open("Rooms");
                    },
                  },
                  "Close",
                ),
              ),
            ),
          ),
        )
      : el("p", { class: "empty" }, "No live rooms. A room shows here while it's open."),
  );
}

// ---------- Scores, Export and Restore (AC8.4, AC8.8) ----------

/** "2026-10-31T09:30", the form a datetime-local field takes, in this device's time. */
const local = (at) => {
  const d = new Date(at - new Date(at).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

function restoreSection() {
  const note = el("p", { role: "status", class: "note" });
  const now = Date.now();
  const input = el("input", { type: "datetime-local", id: "restore-at", min: local(now - RESTORE_DAYS * DAY + 120_000), max: local(now), value: local(now - 60 * 60 * 1000) });
  const undoBox = el("div", { class: "row" });
  const post = async (body) => {
    const res = await api("/api/admin/restore", { method: "POST", body: JSON.stringify(body) }).catch(() => ({ status: 0 }));
    if (res.status !== 200) note.textContent = res.body?.text ?? "Not restored: check the signal, then try again.";
    return res.status === 200 ? res.body.undo : null;
  };
  // replaceChildren() writes null as the text "null": with no undo, the box is just emptied.
  const drawUndo = () =>
    undoBox.replaceChildren(
      ...[
        undo
        ? el(
            "button",
            {
              type: "button",
              onclick: async () => {
                if (!window.confirm("Undo the restore, and put the data back as it was just before it?")) return;
                note.textContent = "Undoing…";
                if ((await post({ bookmark: undo })) === null) return;
                undo = null;
                drawUndo();
                note.textContent = "The restore is undone.";
              },
            },
            "Undo the restore",
          )
        : null,
      ].filter(Boolean),
    );
  drawUndo();
  return el(
    "section",
    { class: "card", "aria-labelledby": "restore-title" },
    el("h2", { id: "restore-title" }, "Restore"),
    el(
      "p",
      {},
      `Cloudflare keeps this data's history for ${RESTORE_DAYS} days. Put it back as it was at a time: the game switches, the live rooms list and every match. Anything newer goes; Undo puts it back. Rooms that are playing go on.`,
    ),
    el("label", { for: "restore-at" }, "Restore to (this device's time)"),
    el(
      "div",
      { class: "row" },
      input,
      el(
        "button",
        {
          type: "button",
          onclick: async () => {
            const at = new Date(input.value).getTime();
            if (!Number.isFinite(at)) {
              note.textContent = "Pick a date and time.";
              return;
            }
            if (!window.confirm(`Put the online data back as it was at ${time(at)}? Anything newer goes. You can undo it.`)) return;
            note.textContent = "Restoring…";
            const bookmark = await post({ at });
            if (bookmark === null) return;
            undo = bookmark;
            drawUndo();
            note.textContent = `Restored to ${time(at)}. Keep this page open to undo it.`;
          },
        },
        "Restore…",
      ),
    ),
    undoBox,
    note,
  );
}

async function scores(id) {
  const { status, body } = await api(`/api/scores?game=${id}`);
  if (status !== 200) return stop(status);
  frame(
    el("label", { for: "admin-game" }, "Game"),
    el(
      "select",
      { id: "admin-game", onchange: (e) => scores(e.target.value) },
      games.map((g) => el("option", { value: g.id, selected: g.id === id }, g.name)),
    ),
    el("h2", {}, "Top players"),
    body.top.length
      ? table("Top players", ["Player", "Wins"], body.top.map((r) => el("tr", {}, el("th", { scope: "row" }, r.nick), td(r.wins))))
      : el("p", { class: "empty" }, "No online wins yet."),
    el("h2", {}, "Last matches"),
    body.recent.length
      ? table(
          "Last matches",
          ["When", "Players", "Winner", "Length"],
          body.recent.map((m) =>
            el(
              "tr",
              {},
              td(date(m.at), m.at),
              td(m.players.join(", ")),
              td((m.places[0] ?? []).map((i) => m.players[i]).join(", ")),
              td(minutes(m.secs), m.secs),
            ),
          ),
        )
      : el("p", { class: "empty" }, "No online matches yet."),
    el(
      "section",
      { class: "card", "aria-labelledby": "backup-title" },
      el("h2", { id: "backup-title" }, "Back up"),
      el("p", {}, "All online data (the switches, live rooms and every match) as one JSON file, to keep yourself."),
      el("a", { class: "button primary", href: "/api/admin/export", download: "games-hub.json" }, "Export"),
    ),
    restoreSection(),
  );
}

async function start() {
  const me = await api("/api/member/me");
  if (me.status !== 200) return stop(me.status);
  if (!me.body?.admin) return stop(403);
  email = me.body.email;
  games = await (await fetch("/games/index.json")).json();
  open("Overview");
}

start().catch(() => stop(0));
