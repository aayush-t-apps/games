// Word Tiles' screen: the 15 × 15 board, your rack below it, and your turn's buttons. Tap a tile in
// your rack, then a square, to put it there (a blank asks for its letter); tap a tile you put down
// to take it back. The words and their points show as you go, and Play sends them.
import { el } from "../../lib/ui.js";
import { CENTRE, N, PREMIUM, judge, parseTiles, playOf, points } from "./rules.js";

const LABELS = { T: "3W", D: "2W", t: "3L", d: "2L" };
const KINDS = { T: "triple word", D: "double word", t: "triple letter", d: "double letter" };
const where = (i) => `row ${Math.floor(i / N) + 1}, column ${(i % N) + 1}`;
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

// What this device keeps between draws, for the position it was made in (`seen`): the tiles put
// down but not played ([square, letter, rack index]), the rack's order, the tile picked (an
// index), the square waiting for a blank's letter, the tiles marked to swap, and the last hint.
let seen = "";
let put = [];
let order = [];
let picked = -1;
let blankAt = -1;
let swapping = null;
let hintSeen = null;

const CSS = `
.wt{display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%}
.wt-board{display:grid;grid-template-columns:repeat(15,1fr);gap:1px;padding:3px;width:min(100%,40rem,64dvh);
aspect-ratio:1;background:var(--wood);border-radius:8px;container-type:inline-size}
.wt-cell{position:relative;min-width:0;min-height:0;padding:0;border:0;border-radius:2px;background:#efe6d2;
color:#6b5a43;font-size:2.3cqi;font-weight:800;line-height:1;display:grid;place-items:center}
.wt-cell.p-T{background:#c0392b;color:#fff}.wt-cell.p-D{background:#eab0a6;color:#6d1f16}
.wt-cell.p-t{background:#2457a6;color:#fff}.wt-cell.p-d{background:#a9c3ea;color:#173d78}
.wt-cell.centre{font-size:4cqi}
.wt-tile{background:#f6d99a;color:#1b1b1b;box-shadow:inset 0 -2px 0 #c9a25a;font-size:3.8cqi}
.wt-tile .v{position:absolute;right:6%;bottom:4%;font-size:1.7cqi}
.wt-tile.blank .l{color:#2457a6}
.wt-tile.new{background:#ffe9a8;box-shadow:inset 0 0 0 2px var(--glow)}
.wt-tile.last{box-shadow:inset 0 0 0 2px var(--focus)}
.wt-tile.put-in{animation:wt-put .25s ease-out}
@keyframes wt-put{from{scale:1.5;opacity:0}}
.wt-rack{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,3.6rem);gap:.3rem;justify-content:center;width:min(100%,27rem)}
.wt-rack button{position:relative;min-width:0;width:100%;aspect-ratio:1;padding:0;border:0;border-radius:6px;
background:#f6d99a;color:#1b1b1b;box-shadow:inset 0 -3px 0 #c9a25a;font-size:clamp(1.3rem,6cqi,1.9rem);font-weight:800}
.wt-rack .v{position:absolute;right:6%;bottom:4%;font-size:.45em}
.wt-rack button.picked{transform:translateY(-12%);box-shadow:0 0 0 3px var(--glow),inset 0 -3px 0 #c9a25a}
.wt-rack button.marked{background:#bcd3f2;box-shadow:inset 0 0 0 3px var(--blue)}
.wt-score{margin:0;font-weight:700;text-align:center;min-height:1.4em}
.wt-actions,.wt-letters{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center}
.board .wt-actions button.primary{color:#fff}
.wt-letters button{min-width:44px;font-weight:800}
.wt-bag{margin:0;font-size:.9rem;opacity:.85}
`;

/** Empty squares a word can join: beside a tile, or the centre on an empty board. */
function joins(board) {
  const out = new Set();
  if (!/[A-Za-z]/.test(board)) return out.add(CENTRE);
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== ".") continue;
    const r = Math.floor(i / N);
    const c = i % N;
    const near = [r > 0 && i - N, r < N - 1 && i + N, c > 0 && i - 1, c < N - 1 && i + 1];
    if (near.some((j) => j !== false && board[j] !== ".")) out.add(i);
  }
  return out;
}

/** The rack indexes for a hint's tiles: each letter from the rack, a blank's letter from a "?". */
function fromRack(tiles) {
  const free = order.map((_, k) => k);
  return tiles.map(([i, ch]) => {
    const want = ch === ch.toLowerCase() ? "?" : ch;
    const at = free.findIndex((k) => order[k] === want);
    return [i, ch, free.splice(at, 1)[0]];
  });
}

const tileHtml = (ch) =>
  `<span class="l">${ch.toUpperCase()}</span>${ch === "?" ? "" : `<span class="v">${points(ch)}</span>`}`;

export default {
  status: (view, seat) => ({ text: `${view.scores[seat]} ${view.scores[seat] === 1 ? "point" : "points"}` }),
  hintText(move, view) {
    if (move.t === "swap") return "Swap your tiles: no word fits.";
    if (move.t === "pass") return "Pass: no word fits.";
    const r = judge(view.board, parseTiles(move.tiles) ?? []);
    return r.error ? "Try the tiles on the board." : `Try ${r.words[0]} for ${r.score}: its tiles are on the board. Tap Play.`;
  },
  sound: (move, note) => (note?.includes("all seven") ? "home" : move.t === "play" ? "card" : undefined),
  render(box, ctx) {
    if (!document.getElementById("word-tiles-style"))
      document.head.append(el("style", { id: "word-tiles-style" }, CSS));
    const { board, hand, last, bag } = ctx.view;
    const mine = ctx.legal.length > 0;
    // A new position (a move, a new match, another seat's turn on this device) starts afresh.
    const key = `${ctx.me}|${board}|${hand.join("")}`;
    if (ctx.first || key !== seen) {
      seen = key;
      put = [];
      order = hand.slice();
      picked = -1;
      blankAt = -1;
      swapping = null;
      hintSeen = null;
    }
    // A hint puts its tiles on the board, ready to play.
    if (ctx.hint && ctx.hint !== hintSeen) {
      hintSeen = ctx.hint;
      if (ctx.hint.t === "play") {
        put = fromRack(parseTiles(ctx.hint.tiles) ?? []);
        [picked, blankAt, swapping] = [-1, -1, null];
      }
    }
    // Draw again after a tap, with the focus where it was.
    const rerender = () => {
      const had = box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
      this.render(box, { ...ctx, first: false });
      if (had) box.querySelector(`[data-key="${had}"]`)?.focus();
    };
    const used = new Set(put.map(([, , k]) => k));
    const at = new Map(put.map(([i, ch]) => [i, ch]));
    const lastCells = new Set(last?.cells ?? []);
    const glow = ctx.kid && mine && !put.length ? joins(board) : new Set();
    const hintCells = new Set(ctx.hint?.t === "play" ? (parseTiles(ctx.hint.tiles) ?? []).map(([i]) => i) : []);

    const tapCell = (i) => {
      if (at.has(i)) {
        put = put.filter(([j]) => j !== i);
        return rerender();
      }
      if (board[i] !== ".") return ctx.say("That square is taken.");
      if (!mine) return ctx.say("Wait for your turn.");
      if (swapping) return ctx.say("Pick the tiles to swap, or tap Cancel.");
      if (picked < 0) return ctx.say("Tap a tile in your rack first, then a square.");
      if (order[picked] === "?") {
        blankAt = i;
        ctx.say("A blank: pick its letter.");
        rerender();
        box.querySelector(".wt-letters button")?.focus();
        return;
      }
      put.push([i, order[picked], picked]);
      picked = -1;
      rerender();
    };

    const tapTile = (k) => {
      if (!mine) return ctx.say("Wait for your turn.");
      if (swapping) {
        if (swapping.has(k)) swapping.delete(k);
        else swapping.add(k);
      } else {
        picked = picked === k ? -1 : k;
        blankAt = -1;
        if (picked >= 0) ctx.say("Now tap a square for it.");
      }
      rerender();
    };

    const cells = Array.from({ length: N * N }, (_, i) => {
      const ch = at.get(i) ?? (board[i] !== "." ? board[i] : null);
      const prem = PREMIUM[i];
      const classes = ["wt-cell"];
      let html = "";
      let name;
      if (ch) {
        const blank = ch === ch.toLowerCase();
        classes.push("wt-tile");
        if (blank) classes.push("blank");
        if (at.has(i)) classes.push("new", "put-in");
        else if (lastCells.has(i)) classes.push("last");
        html = tileHtml(ch);
        name = `${ch.toUpperCase()}${blank ? ", a blank" : `, ${points(ch)} ${points(ch) === 1 ? "point" : "points"}`}${at.has(i) ? ", yours: tap to take it back" : ""}`;
      } else {
        if (prem !== ".") classes.push(`p-${prem}`);
        if (i === CENTRE) classes.push("centre");
        html = i === CENTRE ? "★" : (LABELS[prem] ?? "");
        name = `empty${prem !== "." ? `, ${KINDS[prem]}` : ""}${i === CENTRE ? ", the centre star" : ""}`;
      }
      if (glow.has(i)) classes.push("legal");
      if (hintCells.has(i)) classes.push("hint");
      return el("button", {
        type: "button",
        class: classes.join(" "),
        dataset: { x: i % N, y: Math.floor(i / N), key: `b${i}` },
        "aria-label": `${where(i)}: ${name}`,
        onclick: () => tapCell(i),
        html,
      });
    });

    const rack = el(
      "div",
      { class: "wt-rack", role: "group", "aria-label": "Your tiles" },
      order.map((ch, k) =>
        used.has(k)
          ? null
          : el("button", {
              type: "button",
              class: `${picked === k ? "picked" : ""}${swapping?.has(k) ? " marked" : ""}`.trim() || null,
              dataset: { x: k * 2, y: N, key: `r${k}` },
              "aria-label": `${ch === "?" ? "Blank, any letter" : `${ch}, ${points(ch)} ${points(ch) === 1 ? "point" : "points"}`}${swapping?.has(k) ? ", to swap" : ""}`,
              "aria-pressed": String(picked === k || Boolean(swapping?.has(k))),
              onclick: () => tapTile(k),
              html: tileHtml(ch),
            }),
      ),
    );

    const button = (label, keyName, onclick, extra = {}) =>
      el(
        "button",
        { type: "button", dataset: { x: extra.x ?? 0, y: N + 2, key: keyName }, onclick, ...extra.attrs },
        label,
      );
    const parts = [el("div", { class: "wt-board", role: "group", "aria-label": "The board" }, cells), rack];

    if (blankAt >= 0) {
      parts.push(
        el(
          "div",
          { class: "wt-letters", role: "group", "aria-label": "The blank's letter" },
          LETTERS.map((L, n) =>
            el(
              "button",
              {
                type: "button",
                dataset: { x: n % 13, y: N + 1 + Math.floor(n / 13) / 2, key: `L${L}` },
                onclick: () => {
                  put.push([blankAt, L.toLowerCase(), picked]);
                  [blankAt, picked] = [-1, -1];
                  rerender();
                },
              },
              L,
            ),
          ),
          button("Cancel", "L-cancel", () => {
            blankAt = -1;
            rerender();
          }, { x: 14 }),
        ),
      );
    } else if (mine && swapping) {
      const n = swapping.size;
      const tiles = [...swapping].map((k) => order[k]).sort().join("");
      parts.push(
        el("p", { class: "wt-score" }, "Tap the tiles to swap. They go back in the bag, and you draw as many."),
        el(
          "div",
          { class: "wt-actions" },
          button(n ? `Swap ${n} ${n === 1 ? "tile" : "tiles"}` : "Swap", "swap-go", () => ctx.play({ t: "swap", tiles }), {
            attrs: { class: "primary", disabled: n === 0 },
          }),
          button("Cancel", "swap-cancel", () => {
            swapping = null;
            rerender();
          }, { x: 2 }),
        ),
      );
    } else if (mine) {
      const r = put.length ? judge(board, put.map(([i, ch]) => [i, ch])) : null;
      const line = !r
        ? "Tap a tile, then a square."
        : r.error
          ? r.error
          : `${r.words.join(", ")}: ${r.score} ${r.score === 1 ? "point" : "points"}`;
      const canSwap = ctx.legal.some((m) => m.t === "swap");
      const hinted = (t) => (ctx.hint?.t === t ? " hint" : "");
      parts.push(
        el("p", { class: "wt-score" }, line),
        el(
          "div",
          { class: "wt-actions" },
          button(r && !r.error ? `Play ${r.words[0]}` : "Play", "play", () => ctx.play(playOf(put.map(([i, ch]) => [i, ch]))), {
            attrs: { class: `primary${ctx.hint?.t === "play" ? " hint" : ""}`, disabled: !r || Boolean(r.error) },
          }),
          put.length
            ? button("Take back", "back", () => {
                put = [];
                rerender();
              }, { x: 2 })
            : null,
          button("Mix", "mix", () => {
            // A new order for the tiles still on the rack (Fisher-Yates).
            const free = order.map((_, k) => k).filter((k) => !used.has(k));
            for (let n = free.length - 1; n > 0; n--) {
              const m = Math.floor(Math.random() * (n + 1));
              [order[free[n]], order[free[m]]] = [order[free[m]], order[free[n]]];
            }
            picked = -1;
            rerender();
          }, { x: 4 }),
          canSwap
            ? button("Swap", "swap", () => {
                swapping = new Set();
                put = [];
                picked = -1;
                rerender();
              }, { x: 6, attrs: { class: hinted("swap").trim() || null } })
            : null,
          button("Pass", "pass", () => ctx.play({ t: "pass" }), { x: 8, attrs: { class: hinted("pass").trim() || null } }),
        ),
      );
    }
    parts.push(el("p", { class: "wt-bag" }, `${bag} ${bag === 1 ? "tile" : "tiles"} in the bag`));
    box.replaceChildren(el("div", { class: "wt" }, parts));
  },
};
