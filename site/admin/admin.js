// The admin page (change 0003, AC8.1–AC8.4): Overview, Games, Rooms and Scores, for the owner only.
// One GET /api/admin/stats per open or Refresh; nothing polls. Game details come from index.json.
import { el } from "/lib/ui.js";

const TABS = ["Overview", "Games", "Rooms", "Scores"];
const TYPES = { cards: "Cards", board: "Board game", kids: "Kids" };
const DAY = 24 * 60 * 60 * 1000;
const NEW_GAME = "https://github.com/aayush-t-apps/shipify/issues/new?title=games%3A%20add%20";
const MEMBERS = "https://one.dash.cloudflare.com/";
const main = document.getElementById("main");
let games = [];
let tab = "Overview";

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
      ? "This page is for the owner."
      : status === 503
        ? "Sign-in isn't set up yet: see docs/adr/0001-members-sign-in-with-access.md, Setup."
        : status === 401
          ? "Your sign-in ended. Open /admin again to sign in."
          : "The admin page needs signal. Connect, then Refresh.";
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
const minutes = (secs) => (secs ? `${Math.round(secs / 60)} min` : "–");
const table = (head, rows) =>
  el(
    "table",
    {},
    el("thead", {}, el("tr", {}, head.map((h) => el("th", { scope: "col" }, h)))),
    el("tbody", {}, rows),
  );

function frame(...body) {
  main.replaceChildren(
    el("h1", {}, "Admin"),
    el(
      "div",
      { class: "tabs", role: "tablist", "aria-label": "Admin" },
      TABS.map((name) =>
        el(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": name === tab ? "true" : "false",
            onclick: () => open(name),
          },
          name,
        ),
      ),
      el("a", { class: "button", href: MEMBERS, target: "_blank", rel: "noopener" }, "Members"),
    ),
    el("section", { class: "panel", role: "tabpanel", "aria-label": tab }, ...body),
  );
}

async function open(name) {
  tab = name;
  frame(el("p", { class: "loading", role: "status" }, "Loading…"));
  if (name === "Overview") return overview();
  if (name === "Games") return catalogue();
  if (name === "Rooms") return rooms();
  return scores(games[0]?.id);
}

// ---------- Overview (AC8.1) ----------

async function overview() {
  const { status, body: s } = await api("/api/admin/stats");
  if (status !== 200) return stop(status);
  const on = (id) => s.catalog.find((r) => r.game === id)?.enabled !== false;
  const per = new Map(s.games.map((g) => [g.game, g]));
  const byType = {};
  for (const g of games) byType[g.type] = (byType[g.type] ?? 0) + (per.get(g.id)?.d30 ?? 0);
  const quiet = games.filter((g) => on(g.id) && (s.last[g.id] ?? 0) < s.now - 60 * DAY);
  const most = [...s.games].sort((a, b) => b.d30 - a.d30)[0];
  const kb = games.reduce((n, g) => n + g.kb, 0);
  const largest = [...games].sort((a, b) => b.kb - a.kb)[0];
  const members = [...new Set(s.live.map((r) => r.member))];
  frame(
    el("div", { class: "row" }, el("button", { type: "button", onclick: () => open("Overview") }, "Refresh")),
    el("h2", {}, "Today"),
    el(
      "ul",
      { class: "facts" },
      el("li", {}, el("strong", {}, s.live.length), "live rooms"),
      el("li", {}, el("strong", {}, s.today), "matches finished today (UTC)"),
    ),
    members.length ? el("p", {}, `Rooms by: ${members.join(", ")}.`) : null,
    el(
      "p",
      {},
      "Exact free-plan use: ",
      el("a", { href: "https://dash.cloudflare.com/", target: "_blank", rel: "noopener" }, "Cloudflare's dashboard"),
      ".",
    ),
    el("h2", {}, "Games"),
    table(
      ["Game", "Type", "Players", "CPU", "Size", "On", "7 days", "30 days", "Avg length", "Avg players", "Last played"],
      games.map((g) => {
        const p = per.get(g.id);
        return el(
          "tr",
          {},
          el("th", { scope: "row" }, g.name),
          el("td", {}, TYPES[g.type] ?? g.type),
          el("td", {}, `${g.players[0]}–${g.players[1]}`),
          el("td", {}, g.cpu ? "yes" : "no"),
          el("td", {}, `${g.kb} KB`),
          el("td", {}, on(g.id) ? "on" : "off"),
          el("td", {}, p?.d7 ?? 0),
          el("td", {}, p?.d30 ?? 0),
          el("td", {}, minutes(p?.avgSecs)),
          el("td", {}, p?.avgSeats || "–"),
          el("td", {}, date(s.last[g.id])),
        );
      }),
    ),
    el("h2", {}, "Hints"),
    el(
      "ul",
      {},
      quiet.map((g) =>
        el(
          "li",
          {},
          `${g.name}: not played online in 60 days. Turn it off? `,
          el("button", { type: "button", onclick: () => open("Games") }, "Games"),
        ),
      ),
      most?.d30
        ? el(
            "li",
            {},
            `${nameOf(most.game)}: most played in 30 days. Feature it? `,
            el("button", { type: "button", onclick: () => open("Games") }, "Games"),
          )
        : null,
      !quiet.length && !most?.d30 ? el("li", {}, "No hints yet.") : null,
    ),
    el("h2", {}, "Matches by type, 30 days"),
    table(
      ["Type", "Matches"],
      Object.entries(byType).map(([t, n]) => el("tr", {}, el("th", { scope: "row" }, TYPES[t] ?? t), el("td", {}, n))),
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
  const note = el("p", { role: "status" });
  const save = async () => {
    const rows = list.map((r, i) => ({ ...r, sort: i }));
    const res = await api("/api/admin/catalog", { method: "PUT", body: JSON.stringify(rows) });
    note.textContent =
      res.status === 200 ? "Saved. The hub shows it within about a minute." : (res.body?.text ?? "Not saved.");
  };
  const draw = () =>
    frame(
      el("p", {}, "Turn a game off to take it off the hub and refuse new rooms for it; its scores stay."),
      table(
        ["Game", "On", "Featured", "Order"],
        list.map((r, i) =>
          el(
            "tr",
            {},
            el("th", { scope: "row" }, nameOf(r.game)),
            el(
              "td",
              {},
              el(
                "label",
                { class: "choice" },
                el("input", {
                  type: "checkbox",
                  checked: r.enabled,
                  onchange: (e) => {
                    r.enabled = e.target.checked;
                  },
                }),
                "On",
              ),
            ),
            el(
              "td",
              {},
              el(
                "label",
                { class: "choice" },
                el("input", {
                  type: "checkbox",
                  checked: r.featured,
                  onchange: (e) => {
                    r.featured = e.target.checked;
                  },
                }),
                "Featured",
              ),
            ),
            el(
              "td",
              { class: "row" },
              el(
                "button",
                {
                  type: "button",
                  "aria-label": `Move ${nameOf(r.game)} up`,
                  disabled: i === 0,
                  onclick: () => {
                    list.splice(i - 1, 0, ...list.splice(i, 1));
                    draw();
                  },
                },
                "Up",
              ),
              el(
                "button",
                {
                  type: "button",
                  "aria-label": `Move ${nameOf(r.game)} down`,
                  disabled: i === list.length - 1,
                  onclick: () => {
                    list.splice(i + 1, 0, ...list.splice(i, 1));
                    draw();
                  },
                },
                "Down",
              ),
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "row" },
        el("button", { type: "button", class: "primary", onclick: save }, "Save"),
        el("a", { class: "button", href: NEW_GAME, target: "_blank", rel: "noopener" }, "Add a game"),
      ),
      note,
    );
  draw();
}

// ---------- Rooms (AC8.3) ----------

async function rooms() {
  const { status, body } = await api("/api/admin/rooms");
  if (status !== 200) return stop(status);
  const ago = (at) => `${Math.max(1, Math.round((Date.now() - at) / 60000))} min ago`;
  frame(
    el("div", { class: "row" }, el("button", { type: "button", onclick: () => open("Rooms") }, "Refresh")),
    body.length
      ? table(
          ["Room", "Game", "Started by", "Started", "Ends", ""],
          body.map((r) =>
            el(
              "tr",
              {},
              el("th", { scope: "row" }, r.code),
              el("td", {}, nameOf(r.game)),
              el("td", {}, r.member),
              el("td", {}, ago(r.started)),
              el("td", {}, new Date(r.expires).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })),
              el(
                "td",
                {},
                el(
                  "button",
                  {
                    type: "button",
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
      : el("p", {}, "No live rooms."),
  );
}

// ---------- Scores (AC8.4) ----------

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
      ? table(["Player", "Wins"], body.top.map((r) => el("tr", {}, el("th", { scope: "row" }, r.nick), el("td", {}, r.wins))))
      : el("p", {}, "No online wins yet."),
    el("h2", {}, "Last matches"),
    body.recent.length
      ? table(
          ["When", "Players", "Winner", "Length"],
          body.recent.map((m) =>
            el(
              "tr",
              {},
              el("td", {}, date(m.at)),
              el("td", {}, m.players.join(", ")),
              el("td", {}, (m.places[0] ?? []).map((i) => m.players[i]).join(", ")),
              el("td", {}, minutes(m.secs)),
            ),
          ),
        )
      : el("p", {}, "No online matches yet."),
    el("h2", {}, "Back up"),
    el("p", {}, "All Hub data (the switches, live rooms and every match) as one JSON file."),
    el("a", { class: "button primary", href: "/api/admin/export", download: "games-hub.json" }, "Export"),
  );
}

async function start() {
  const me = await api("/api/member/me");
  if (me.status !== 200) return stop(me.status);
  if (!me.body?.admin) return stop(403);
  games = await (await fetch("/games/index.json")).json();
  open("Overview");
}

start().catch(() => stop(0));
