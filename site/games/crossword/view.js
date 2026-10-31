// Crossword's screen: the clue bar, the grid, letters to tap, and every clue on a big screen. Tap
// the selected square again to turn across or down.
import { el } from "../../lib/ui.js";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const NAME = { across: "Across", down: "Down" };
const CSS = `
.cw{display:grid;gap:.6rem;justify-items:center;width:100%;--cell:min(calc(94cqi / var(--w)),calc(48vh / var(--h)),2.75rem)}
.cw-side{grid-template-columns:auto minmax(11rem,1fr);align-items:start;--cell:min(calc(60cqi / var(--w)),calc(62vh / var(--h)),2.75rem)}
.cw-side .cw-lists{grid-column:2;grid-row:1/4}
.cw-bar{display:flex;align-items:center;gap:.4rem;width:100%;max-width:32rem}
.cw-bar p{flex:1;margin:0;min-height:2.9em;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700}
.board .cw-bar button,.board .cw-row button{padding:0;border-color:var(--ink);background:#fffdf7}
.cw-grid{display:grid;grid-template-columns:repeat(var(--w),var(--cell));gap:2px}
.cw-block{width:var(--cell);height:var(--cell);border-radius:3px;background:rgb(0 0 0/.28)}
.board .cw-cell{position:relative;width:var(--cell);height:var(--cell);min-width:0;min-height:0;padding:0;border:1px solid var(--ink);border-radius:3px;background:#fffdf7;color:var(--ink);font-size:calc(var(--cell)*.56);line-height:1}
.cw-num{position:absolute;top:1px;left:2px;font-size:max(8px,calc(var(--cell)*.27));font-weight:600}
.board .cw-cell.done{background:#cdebd5}
.board .cw-cell.word{background:#cfe0ff}
.board .cw-cell.sel{background:var(--yellow)}
.board .cw-cell.hint{box-shadow:0 0 0 2px #fff,0 0 0 5px var(--glow);z-index:1}
.cw-cell.pop{animation:cw-pop .5s ease-out}
@keyframes cw-pop{40%{transform:scale(1.18)}}
.cw-keys{display:grid;gap:5px;width:100%;max-width:34rem}
.cw-row{display:flex;gap:4px;justify-content:center}
.board .cw-row button{flex:1 1 0;min-width:0;max-width:3.2rem;min-height:44px;font-size:1.05rem}
.board .cw-row .cw-del{flex-grow:1.6;max-width:5rem}
.cw-lists{width:100%;display:grid;gap:.5rem;align-content:start;max-height:75vh;overflow:auto}
.cw-lists h2{font-size:1rem;margin:0}
.cw-lists ol{list-style:none;margin:0;padding:0}
.board .cw-lists button{width:100%;min-height:2.2rem;padding:.2rem .5rem;border:0;background:none;color:var(--on-table);text-align:left;font-weight:400}
.board .cw-lists button.cur{background:rgb(255 255 255/.2);font-weight:700}
.board .cw-lists button.done{opacity:.65}
@media (prefers-reduced-motion:reduce){.cw-cell.pop,.board .cw-cell.hint{animation:none}}
`;

let sel = -1;
let dir = "across";
let hinted = null;
let seenDone = null;
let aim = null;
let host = null;
let cur = null;
let draws = 0;
const bound = new WeakSet();

const cellsOf = (e, w) =>
  Array.from({ length: e.len }, (_, k) => (e.dir === "down" ? (e.y + k) * w + e.x : e.y * w + e.x + k));
const has = (v, e, i) => cellsOf(e, v.w).includes(i);
// The word through square i going way d, else the other way.
const entryAt = (v, i, d) => v.entries.find((e) => e.dir === d && has(v, e, i)) ?? v.entries.find((e) => has(v, e, i));
const title = (e) => `${e.n} ${NAME[e.dir]}`;

function goTo(v, e) {
  dir = e.dir;
  const cells = cellsOf(e, v.w);
  sel = cells.find((i) => !v.got[i]) ?? cells[0];
}

// Where to go after a letter in square i: the next gap in the word, else the next clue with a gap.
function nextSpot(v, i) {
  const e = entryAt(v, i, dir);
  const gap = (j) => j !== i && !v.got[j];
  const cells = cellsOf(e, v.w);
  const k = cells.indexOf(i);
  const ahead = [...cells.slice(k + 1), ...cells.slice(0, k)].find(gap);
  if (ahead !== undefined) return ahead;
  const at = v.entries.indexOf(e);
  for (let s = 1; s < v.entries.length; s++) {
    const f = v.entries[(at + s) % v.entries.length];
    const j = cellsOf(f, v.w).find(gap);
    if (j !== undefined) {
      dir = f.dir;
      return j;
    }
  }
  return cells[Math.min(k + 1, cells.length - 1)];
}

const paint = () => host && cur && render(host, cur);

// Play a move; draw again unless the engine already did.
function send(move) {
  const n = draws;
  if (move) cur.play(move);
  if (draws === n) paint();
}

function type(ch) {
  const v = cur.view;
  if (!cur.legal.length || !v.open[sel]) return;
  const i = sel;
  sel = nextSpot(v, i);
  aim ??= "cell";
  send(v.got[i] === ch ? null : { t: "put", i, ch });
}

// Backspace: clear the square, or step back when it is empty.
function erase() {
  const v = cur.view;
  if (!cur.legal.length || !v.open[sel]) return;
  aim ??= "cell";
  if (v.got[sel]) return send({ t: "clear", i: sel });
  const cells = cellsOf(entryAt(v, sel, dir), v.w);
  sel = cells[Math.max(0, cells.indexOf(sel) - 1)];
  paint();
}

function onKey(event) {
  if (!cur || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (/^[a-z]$/i.test(key)) {
    event.preventDefault();
    type(key.toUpperCase());
  } else if (key === "Backspace" || key === "Delete") {
    event.preventDefault();
    erase();
  } else if (key.startsWith("Arrow") && event.target.dataset?.x) {
    // input.js has moved the focus already: select where it went.
    const to = Number(document.activeElement?.dataset.key?.slice(1));
    if (cur.view.open[to]) sel = to;
    dir = key === "ArrowLeft" || key === "ArrowRight" ? "across" : "down";
    aim = "cell";
    paint();
  }
}

function choose(v, e, btn) {
  goTo(v, e);
  aim = btn;
  paint();
}

function tap(i) {
  if (i === sel) dir = dir === "across" ? "down" : "across";
  sel = i;
  aim = "cell";
  paint();
}

function render(box, ctx) {
  draws += 1;
  if (ctx.first) {
    sel = -1;
    dir = "across";
    hinted = null;
    seenDone = null;
  }
  if (!document.getElementById("crossword-style")) document.head.append(el("style", { id: "crossword-style" }, CSS));
  if (!bound.has(box)) {
    bound.add(box);
    box.addEventListener("keydown", onKey);
  }
  const was = document.activeElement;
  const focus = aim ?? (box.contains(was) ? (was.dataset.btn ?? "cell") : null);
  aim = null;
  host = box;
  cur = { ...ctx, first: false };
  const v = ctx.view;
  const { w, h } = v;
  const live = ctx.legal.length > 0;
  if (ctx.hint && ctx.hint !== hinted) {
    hinted = ctx.hint;
    sel = ctx.hint.i;
    dir = v.entries.find((e) => has(v, e, sel)).dir;
  }
  if (!v.open[sel]) goTo(v, v.entries.find((_, k) => !v.done.includes(k)) ?? v.entries[0]);
  const e = entryAt(v, sel, dir);
  dir = e.dir;
  const word = cellsOf(e, w);
  const done = new Set();
  const fresh = new Set();
  for (const k of v.done)
    for (const i of cellsOf(v.entries[k], w)) {
      done.add(i);
      if (seenDone && !seenDone.has(k)) fresh.add(i);
    }
  seenDone = new Set(v.done);

  const cells = v.open.map((on, i) => {
    if (!on) return el("span", { class: "cw-block", "aria-hidden": "true" });
    const own = word.includes(i) ? e : entryAt(v, i, dir);
    const k = cellsOf(own, w).indexOf(i);
    const classes = ["cw-cell"];
    if (i === sel) classes.push("sel");
    else if (word.includes(i)) classes.push("word");
    if (done.has(i)) classes.push("done");
    if (fresh.has(i)) classes.push("pop");
    if (ctx.hint?.i === i) classes.push("hint");
    return el(
      "button",
      {
        type: "button",
        class: classes.join(" "),
        dataset: { x: i % w, y: Math.floor(i / w), key: `k${i}` },
        "aria-label": `${title(own)}, letter ${k + 1} of ${own.len}, ${v.got[i] || "empty"}`,
        "aria-current": i === sel ? "true" : null,
        onclick: () => tap(i),
      },
      v.nums[i] ? el("span", { class: "cw-num", "aria-hidden": "true" }, v.nums[i]) : null,
      v.got[i],
    );
  });

  const n = v.entries.length;
  const step = (by, btn) => () => choose(v, v.entries[(v.entries.indexOf(e) + by + n) % n], btn);
  const bar = el(
    "div",
    { class: "cw-bar" },
    el("button", { type: "button", dataset: { btn: "prev" }, "aria-label": "Previous clue", onclick: step(-1, "prev") }, "◀"),
    el("p", {}, `${title(e)}: ${e.clue}`),
    el("button", { type: "button", dataset: { btn: "next" }, "aria-label": "Next clue", onclick: step(1, "next") }, "▶"),
  );
  const key = (ch) => el("button", { type: "button", disabled: !live, onclick: () => type(ch) }, ch);
  const del = el("button", { type: "button", class: "cw-del", disabled: !live, "aria-label": "Delete letter", onclick: erase }, "⌫");
  const keys = el(
    "div",
    { class: "cw-keys", role: "group", "aria-label": "Letters" },
    ROWS.map((row, r) => el("div", { class: "cw-row" }, [...row].map(key), r === 2 && del)),
  );
  // Every clue beside the grid, on a big screen.
  const side = ctx.layout !== "compact";
  const clue = (x, k) =>
    el(
      "li",
      {},
      el(
        "button",
        { type: "button", class: `${x === e ? "cur" : ""}${v.done.includes(k) ? " done" : ""}`, onclick: () => choose(v, x, "cell") },
        el("b", {}, x.n),
        ` ${x.clue}`,
      ),
    );
  const lists =
    side &&
    el(
      "div",
      { class: "cw-lists" },
      ["across", "down"].map((d) =>
        el("section", {}, el("h2", {}, NAME[d]), el("ol", {}, v.entries.map((x, k) => x.dir === d && clue(x, k)))),
      ),
    );

  box.replaceChildren(
    el(
      "div",
      { class: `cw${side ? " cw-side" : ""}`, style: `--w:${w};--h:${h}` },
      bar,
      el("div", { class: "cw-grid", role: "group", "aria-label": `Crossword, ${v.left} squares left` }, cells),
      keys,
      lists,
    ),
  );
  // After the app puts its tab stop back, keep the focus where the player is working.
  if (focus)
    queueMicrotask(() =>
      box.querySelector(focus === "cell" ? `[data-key="k${sel}"]` : `[data-btn="${focus}"]`)?.focus({ preventScroll: true }),
    );
}

export default {
  status: (view) => ({ text: `${view.done.length} of ${view.entries.length} words` }),
  hintText(move, view) {
    const e = view.entries.find((x) => has(view, x, move.i));
    const k = cellsOf(e, view.w).indexOf(move.i) + 1;
    return move.t === "put" ? `${title(e)}: try ${move.ch} in square ${k}.` : `${title(e)}: clear square ${k}.`;
  },
  sound: (_move, note) => (note && /got|solved/.test(note) ? "home" : undefined),
  render,
};
