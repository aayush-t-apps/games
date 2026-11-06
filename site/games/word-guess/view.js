// Word Guess's screen: the rows of guesses, each letter green (right square), yellow (elsewhere in
// the word) or grey (not in it), the row you type in, and a keyboard whose keys take the colours
// found so far. Type on it or on your own keyboard; Enter sends the word.
import { el } from "../../lib/ui.js";
import { LENGTH } from "./rules.js";

const ROWS = 6;
const KEYS = ["qwertyuiop", "asdfghjkl", "+zxcvbnm<"];
const TOPIC = {
  today: "Today's word",
  mix: "A mix",
  places: "Places",
  animals: "Animals",
  food: "Food",
  nature: "Nature",
  home: "Home",
  sports: "Sports",
};
const SAID = { g: "right", y: "in the word, another square", "-": "not in the word" };

// What this device keeps between draws: the letters typed in the open row, how many guesses and
// shown letters there were when they were typed, and the last hint taken.
let typed = "";
let seenGuesses = -1;
let seenShown = 0;
let hintSeen = null;

const CSS = `
.wg{display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%}
.wg-topic{margin:0;font-weight:800}
.wg-grid{display:grid;gap:5px;width:min(100%,19rem)}
.wg-row{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
.wg-cell{aspect-ratio:1;display:grid;place-items:center;border:2px solid #d3d0c4;border-radius:6px;background:var(--card);
color:var(--ink);font-size:clamp(1.3rem,8cqi,2rem);font-weight:800;text-transform:uppercase}
.wg-cell.full{border-color:#8c877a}
.wg-cell.shown{color:#8c877a}
.wg-cell.g{background:var(--green);border-color:var(--green);color:#fff}
.wg-cell.y{background:var(--yellow);border-color:var(--yellow);color:#1b1b1b}
.wg-cell.n{background:#77746c;border-color:#77746c;color:#fff}
.wg-row.fresh .wg-cell{animation:wg-flip .35s ease-out backwards;animation-delay:calc(var(--k) * 80ms)}
@keyframes wg-flip{from{transform:rotateX(90deg)}}
.wg-keys{display:grid;gap:6px;width:min(100%,32rem)}
.wg-keys div{display:flex;gap:4px;justify-content:center}
.wg-keys button{flex:1 1 0;min-width:0;padding:0;height:3.2rem;max-width:2.8rem;border:0;border-radius:6px;background:#e4dfd2;
color:#1b1b1b;font-weight:800;text-transform:uppercase}
.wg-keys button.wide{max-width:4.4rem;flex-grow:1.6;font-size:.85rem}
.wg-keys button.g{background:var(--green);color:#fff}
.wg-keys button.y{background:var(--yellow);color:#1b1b1b}
.wg-keys button.n{background:#77746c;color:#fff}
`;
let listening = false;
// The board on screen now: its box, its draw's context and how to draw it again.
let current = null;

/** Each letter's best mark so far: green beats yellow beats grey. */
function keyMarks(view) {
  const out = {};
  const rank = { g: 3, y: 2, "-": 1 };
  view.guesses.forEach((word, r) => {
    [...word].forEach((ch, i) => {
      const m = view.marks[r][i];
      if ((rank[m] ?? 0) > (rank[out[ch]] ?? 0)) out[ch] = m;
    });
  });
  return out;
}

/** A letter, Backspace or Enter, from the screen's keys or the device's keyboard. */
function press(key) {
  if (!current) return;
  const { ctx, redraw } = current;
  if (!ctx.legal.length) return;
  if (key === "<") typed = typed.slice(0, -1);
  else if (key === "+") {
    if (typed.length < LENGTH) return ctx.say("Type five letters, then Enter.");
    return ctx.play({ t: "guess", word: typed });
  } else if (/^[a-z]$/.test(key) && typed.length < LENGTH) typed += key;
  redraw();
}

export default {
  status: (view) => ({
    text: view.done
      ? `Found in ${view.guesses.length}`
      : `${view.guesses.length} ${view.guesses.length === 1 ? "guess" : "guesses"}`,
  }),
  hintText: (move) => (move.t === "show" ? "One right letter is in its square." : `Try ${move.word.toUpperCase()}.`),
  sound: (move, note) => (note?.includes("found") ? "home" : move.t === "guess" ? "card" : undefined),
  render(box, ctx) {
    if (!document.getElementById("word-guess-style")) document.head.append(el("style", { id: "word-guess-style" }, CSS));
    const v = ctx.view;
    if (ctx.first) [typed, seenGuesses, seenShown, hintSeen] = ["", -1, 0, null];
    const fresh = seenGuesses >= 0 && v.guesses.length > seenGuesses;
    // A new guess, or a letter shown by a hint, clears the open row (the letter shows there).
    if (v.guesses.length !== seenGuesses || v.shown.length !== seenShown) {
      typed = "";
      seenGuesses = v.guesses.length;
      seenShown = v.shown.length;
    }
    // A hint: a letter is shown at once (a move), or, with every letter known, the word is typed in.
    if (ctx.hint && ctx.hint !== hintSeen) {
      hintSeen = ctx.hint;
      if (ctx.hint.t === "show") return ctx.play(ctx.hint);
      typed = ctx.hint.word;
    }
    // Draw again after a key, with the focus where it was.
    const redraw = () => {
      const had = box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
      this.render(box, { ...ctx, first: false });
      if (had) box.querySelector(`[data-key="${had}"]`)?.focus();
    };
    current = { box, ctx, redraw };
    if (!listening) {
      listening = true;
      // The device's own keyboard types too, while this board is on screen (not in a text field).
      document.addEventListener("keydown", (event) => {
        // Only while Word Guess is on the board (the board's box is the next game's too).
        if (!current?.box.isConnected || !current.box.querySelector(".wg") || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, dialog")) return;
        const key = event.key === "Enter" ? "+" : event.key === "Backspace" ? "<" : event.key.toLowerCase();
        // Enter on a focused button is that button's own tap.
        if (key === "+" && event.target instanceof HTMLButtonElement) return;
        if (key === "+" || key === "<" || /^[a-z]$/.test(key)) {
          event.preventDefault();
          press(key);
        }
      });
    }

    const shown = new Map(v.shown);
    const rows = [];
    const count = Math.max(ROWS, v.guesses.length + (v.done ? 0 : 1));
    for (let r = 0; r < count; r++) {
      const word = v.guesses[r];
      const open = r === v.guesses.length && !v.done;
      const cells = Array.from({ length: LENGTH }, (_, i) => {
        if (word) {
          const m = v.marks[r][i];
          return el(
            "span",
            { class: `wg-cell ${m === "-" ? "n" : m}`, style: `--k:${i}`, "aria-label": `${word[i].toUpperCase()}, ${SAID[m]}` },
            word[i],
          );
        }
        const ch = open ? typed[i] : undefined;
        const hintCh = open && !ch ? shown.get(i) : undefined;
        return el("span", { class: `wg-cell${ch ? " full" : hintCh ? " shown" : ""}` }, ch ?? hintCh ?? "");
      });
      rows.push(
        el(
          "div",
          {
            class: `wg-row${fresh && r === v.guesses.length - 1 ? " fresh" : ""}`,
            role: "group",
            "aria-label": word ? `Guess ${r + 1}` : open ? "Your next guess" : `Row ${r + 1}, empty`,
          },
          cells,
        ),
      );
    }

    const best = keyMarks(v);
    const keys = el(
      "div",
      { class: "wg-keys", role: "group", "aria-label": "Keyboard" },
      KEYS.map((line, y) =>
        el(
          "div",
          {},
          [...line].map((k, x) => {
            const wide = k === "+" || k === "<";
            const m = best[k];
            const label = k === "+" ? "Enter" : k === "<" ? "⌫" : k;
            return el(
              "button",
              {
                type: "button",
                class: [wide ? "wide" : "", m ? (m === "-" ? "n" : m) : "", k === "+" && ctx.hint?.t === "guess" ? "hint" : ""]
                  .filter(Boolean)
                  .join(" ") || null,
                dataset: { x: x + (y === 1 ? 0.5 : 0), y, key: `k${k}` },
                "aria-label": k === "+" ? "Enter" : k === "<" ? "Delete a letter" : `${k.toUpperCase()}${m ? `, ${SAID[m]}` : ""}`,
                disabled: !ctx.legal.length,
                onclick: () => press(k),
              },
              label,
            );
          }),
        ),
      ),
    );
    box.replaceChildren(
      el(
        "div",
        { class: "wg" },
        el("p", { class: "wg-topic" }, `${TOPIC[v.pick] ?? "A word"}: a word of five letters`),
        el("div", { class: "wg-grid", role: "group", "aria-label": "Your guesses" }, rows),
        keys,
      ),
    );
  },
};
