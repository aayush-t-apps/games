// Sudoku's screen: a 9 × 9 grid of squares, a number pad, Notes and Erase. Tap a square, then a
// digit; or type 1 to 9 on a square (Backspace erases, N turns notes on and off).
import { el } from "../../lib/ui.js";

const LEVEL_NAMES = { easy: "Easy", normal: "Medium", hard: "Hard", expert: "Expert" };
const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
const UNITS = [ROW, COL, BOX].flatMap((f, k) =>
  Array.from({ length: 9 }, (_, n) => ({ key: `${k}${n}`, cells: [...Array(81).keys()].filter((i) => f(i) === n) })),
);
const where = (i) => `row ${ROW(i) + 1}, column ${COL(i) + 1}`;
// The selection, notes mode, the hint last seen and the units full at the last draw.
let sel = -1;
let pencil = false;
let hinted = "";
let full = new Set();

const CSS = `
.sudoku{display:flex;flex-direction:column;align-items:center;gap:.75rem;width:100%;
--su-line:var(--text);--su-mine:var(--blue);--su-bad:var(--red)}
:root[data-theme="dark"] .sudoku{--su-mine:#8fb8ff;--su-bad:#ff8a7a}
:root[data-theme="contrast"] .sudoku{--su-mine:#7fdcff;--su-bad:#ff7070}
@media (prefers-color-scheme:dark){:root[data-theme="auto"] .sudoku{--su-mine:#8fb8ff;--su-bad:#ff8a7a}}
.su-grid{display:grid;--t:repeat(3,1fr) 1px repeat(3,1fr) 1px repeat(3,1fr);grid-template:var(--t)/var(--t);
gap:1px;padding:2px;width:min(100%,34rem,56dvh);aspect-ratio:1;background:var(--su-line);border-radius:6px;container-type:inline-size}
.sudoku .cell{position:relative;min-width:0;min-height:0;padding:0;border:0;border-radius:0;
background:var(--surface);color:var(--su-mine);font-size:7cqi;font-weight:600;line-height:1}
.sudoku .cell.given{color:var(--text);font-weight:800}
.sudoku .cell.peer{background:color-mix(in srgb,var(--focus) 12%,var(--surface))}
.sudoku .cell.same{background:color-mix(in srgb,var(--focus) 30%,var(--surface))}
.sudoku .cell.sel{background:color-mix(in srgb,var(--glow) 50%,var(--surface))}
.sudoku .cell.bad{color:var(--su-bad);background:color-mix(in srgb,var(--red) 22%,var(--surface))}
.sudoku .cell:focus-visible{outline:3px solid var(--focus);outline-offset:-3px;z-index:2}
.sudoku .cell.hint{z-index:1}
.sudoku .cell.pop{animation:su-pop .45s ease-out}
@keyframes su-pop{40%{transform:scale(1.15);background:var(--glow)}}
.su-notes{position:absolute;inset:6%;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);
font-size:2.9cqi;font-weight:600;color:var(--muted);place-items:center}
.su-side{display:flex;flex-direction:column;gap:.5rem;width:min(100%,34rem)}
.su-pad{display:grid;grid-template-columns:repeat(9,1fr);gap:4px}
.su-tools{display:flex;gap:.5rem;align-items:center}
.sudoku .su-tools button{flex:1;padding:.5rem;color:var(--text)}
.su-level{flex:1;font-weight:700;color:var(--on-table)}
.sudoku .su-pad button{min-width:0;min-height:52px;padding:0;display:flex;flex-direction:column;
align-items:center;justify-content:center;font-size:1.5rem;line-height:1;color:var(--text)}
.su-pad small{font-size:.7rem;font-weight:600;color:var(--muted)}
.su-pad .done{opacity:.4}
.sudoku .su-tools [aria-pressed="true"]{background:var(--glow);color:#1b1b1b}
@container (max-width:420px){.su-pad{grid-template-columns:repeat(5,1fr)}}
@container (min-width:44rem){.sudoku{flex-direction:row;justify-content:center;align-items:flex-start}
.su-grid{width:min(34rem,70dvh)}.su-side{width:13rem}.su-pad{grid-template-columns:repeat(3,1fr)}
.su-tools{flex-wrap:wrap}.su-level{flex-basis:100%}}
`;

export default {
  status: (view) => ({
    text: `${view.left} to go · ${view.mistakes ? `${view.mistakes} ${view.mistakes === 1 ? "mistake" : "mistakes"}` : "no mistakes"}`,
  }),
  hintText: (move, view) =>
    move.t === "clear"
      ? `That ${view.grid[move.i]} in ${where(move.i)} is wrong.`
      : `Try a ${move.d} in ${where(move.i)}.`,
  sound: (move, note) =>
    !note ? undefined : note.includes("mistake") ? "bad" : /finished|solved/.test(note) ? "home" : move.t === "put" ? "card" : undefined,
  render(box, ctx) {
    const { given, grid, marks, conflicts, level } = ctx.view;
    if (!document.getElementById("sudoku-style"))
      document.head.append(el("style", { id: "sudoku-style" }, CSS));
    // A unit is full when it holds nine digits with no clash; a newly full one pops.
    const bad = new Set(conflicts);
    const now = new Set(UNITS.filter((u) => u.cells.every((i) => grid[i] && !bad.has(i))).map((u) => u.key));
    const pop = new Set(ctx.first ? [] : UNITS.filter((u) => now.has(u.key) && !full.has(u.key)).flatMap((u) => u.cells));
    if (ctx.first) [sel, pencil, hinted] = [-1, false, ""];
    full = now;
    if (ctx.hint && JSON.stringify(ctx.hint) !== hinted) sel = ctx.hint.i;
    hinted = JSON.stringify(ctx.hint ?? "");
    const padFocus = box.contains(document.activeElement) ? document.activeElement.dataset.pad : undefined;

    const play = (move) => ctx.play(move);
    const enter = (d) => {
      if (sel < 0) return ctx.say("Pick a square first.");
      play(pencil ? { t: "note", i: sel, d } : grid[sel] === d ? { t: "clear", i: sel } : { t: "put", i: sel, d });
    };
    const erase = () => {
      if (sel < 0) return ctx.say("Pick a square first.");
      if (given[sel]) return ctx.say("That square is part of the puzzle.");
      if (grid[sel] || marks[sel]) play({ t: "clear", i: sel });
    };

    const cells = grid.map((d, i) => {
      const notes = !d && marks[i] ? [...Array(9).keys()].map((k) => (marks[i] >> k) & 1 ? k + 1 : "") : [];
      const what = given[i] ? `given ${d}` : d ? `${d}${bad.has(i) ? ", clashes" : ""}` : notes.length ? `empty, notes ${notes.filter(Boolean).join(" ")}` : "empty";
      const at = (n) => n + 1 + Math.floor(n / 3);
      const node = el(
        "button",
        {
          type: "button",
          class: `cell${given[i] ? " given" : ""}${bad.has(i) ? " bad" : ""}${pop.has(i) ? " pop" : ""}${ctx.hint?.i === i ? " hint" : ""}`,
          style: `grid-area:${at(ROW(i))}/${at(COL(i))}`,
          dataset: { x: COL(i), y: ROW(i), key: `s${i}` },
          "aria-label": `Row ${ROW(i) + 1}, column ${COL(i) + 1}, ${what}`,
          onfocus: () => choose(i),
          onclick: () => {
            choose(i);
            node.focus();
          },
        },
        d ? String(d) : notes.length ? el("span", { class: "su-notes", "aria-hidden": "true" }, notes.map((n) => el("span", {}, n))) : "",
      );
      return node;
    });

    const count = (d) => grid.filter((g) => g === d).length;
    const pad = Array.from({ length: 9 }, (_, k) => {
      const left = Math.max(0, 9 - count(k + 1));
      return el(
        "button",
        { type: "button", class: left ? "" : "done", dataset: { pad: `d${k + 1}` }, "aria-label": `${k + 1}, ${left ? `${left} to place` : "all placed"}`, onclick: () => enter(k + 1) },
        String(k + 1),
        el("small", { "aria-hidden": "true" }, left ? String(left) : "✓"),
      );
    });
    const notesButton = el(
      "button",
      { type: "button", "aria-pressed": String(pencil), dataset: { pad: "notes" }, onclick: () => toggle() },
      "Notes",
    );
    const toggle = () => {
      pencil = !pencil;
      notesButton.setAttribute("aria-pressed", String(pencil));
    };

    // The selected square's row, column and box, and the squares with its digit, light up.
    function choose(i) {
      sel = i;
      cells.forEach((node, j) => {
        node.classList.toggle("sel", j === sel);
        node.classList.toggle("peer", sel >= 0 && j !== sel && (ROW(j) === ROW(sel) || COL(j) === COL(sel) || BOX(j) === BOX(sel)));
        node.classList.toggle("same", sel >= 0 && j !== sel && grid[j] > 0 && grid[j] === grid[sel]);
      });
    }

    const wrap = el(
      "div",
      {
        class: "sudoku",
        onkeydown: (event) => {
          const k = event.key;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (/^[1-9]$/.test(k)) enter(Number(k));
          else if (k === "Backspace" || k === "Delete" || k === "0") erase();
          else if (k === "n" || k === "N") toggle();
          else return;
          event.preventDefault();
        },
      },
      el("div", { class: "su-grid", role: "group", "aria-label": `Sudoku, ${LEVEL_NAMES[level]}` }, cells),
      el(
        "div",
        { class: "su-side" },
        el("div", { class: "su-pad", role: "group", "aria-label": "Digits" }, pad),
        el(
          "div",
          { class: "su-tools" },
          el("span", { class: "su-level" }, LEVEL_NAMES[level] ?? ""),
          notesButton,
          el("button", { type: "button", dataset: { pad: "erase" }, onclick: erase }, "Erase"),
        ),
      ),
    );
    box.replaceChildren(wrap);
    choose(sel);
    if (padFocus) wrap.querySelector(`[data-pad="${padFocus}"]`)?.focus();
    // After the match screen sets the tab stop, keep it on the selected square.
    if (sel >= 0) queueMicrotask(() => cells.forEach((node, j) => (node.tabIndex = j === sel ? 0 : -1)));
  },
};
