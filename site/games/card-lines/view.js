// Card Lines' screen: the 10 × 10 board of cards with the chips on it, and your hand below it.
// Tap a card and its open squares glow, then tap one; or tap a square that shows a card you hold.
import { COLORS, cardFace, suitShape } from "../../lib/cards.js";
import { spoken } from "../../lib/deck.js";
import { el } from "../../lib/ui.js";
import { BOARD, isJack, twoEyed } from "./rules.js";

const N = 10;
// A colour a player, or a pair of partners (four players: seats 1 and 3 against 2 and 4).
const FILLS = [COLORS.blue, COLORS.red, COLORS.green];
const NAMES = ["Blue", "Red", "Green"];
// A white mark in each colour's chip, so the chips differ by shape as well as by colour.
const MARKS = [
  '<circle cx="20" cy="20" r="5" fill="#fff"/>',
  '<rect x="15" y="15" width="10" height="10" fill="#fff"/>',
  '<path d="M20 13 27 26H13Z" fill="#fff"/>',
];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const STAR = `<path d="M20 5l4.4 9.6 10.6 1.2-7.9 7.1 2.2 10.4L20 28l-9.3 5.3 2.2-10.4L5 15.8l10.6-1.2Z" fill="${COLORS.wood}"/>`;
const where = (i) => `row ${Math.floor(i / N) + 1}, column ${(i % N) + 1}`;
const svg = (body) => `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${body}</svg>`;

// The card picked in the hand, the last move drawn, how many lines there were, and the hand at the
// last draw and whose it was (a card you draw slides in).
let picked = null;
let lastSeen = null;
let linesSeen = 0;
let held = [];
let heldBy = null;

const CSS = `
.cl{display:flex;flex-direction:column;align-items:center;gap:.5rem;width:100%}
.cl-board{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;padding:4px;width:min(100%,36rem,56dvh);
aspect-ratio:1;background:var(--wood);border-radius:10px}
.cl-cell{min-width:0;min-height:0;padding:0;border:0;border-radius:4px;background:#fffdf7}
.cl-cell svg{display:block;width:100%;height:100%}
.cl-cell text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cl-cell.spot{box-shadow:0 0 0 3px var(--glow);position:relative;z-index:1}
.cl-cell.last{outline:3px solid var(--focus);outline-offset:-3px}
.cl-cell .put{animation:cl-put .3s ease-out;transform-origin:center}
.cl-cell.in-line .chip{stroke:#ffd34d;stroke-width:4}
.cl-cell.fresh .chip{animation:shine .5s ease-in-out 3}
@keyframes cl-put{from{scale:1.6;opacity:0}}
.cl .card-btn.dead{opacity:.55}
`;

export default {
  status: (view, seat) => {
    const colour = seat % view.colours;
    const n = view.lines.filter((l) => l.colour === colour).length;
    return {
      text: `${NAMES[colour]} · ${n} of ${view.need} ${view.need === 1 ? "line" : "lines"}`,
      color: FILLS[colour],
    };
  },
  hintText(move) {
    if (move.t === "pass") return "Pass: no card fits.";
    if (move.t === "dead") return `Trade in the ${spoken(move.card)}: both its squares are taken.`;
    if (move.t === "take") return `Use the ${spoken(move.card)} to take the chip on ${where(move.cell)}.`;
    return `Play the ${spoken(move.card)} on ${where(move.cell)}.`;
  },
  sound: (move, note) => (move.t === "take" ? "capture" : note?.includes("made a line") ? "home" : "card"),
  render(box, ctx) {
    const { chips, lines, hand, last } = ctx.view;
    if (!document.getElementById("card-lines-style"))
      document.head.append(el("style", { id: "card-lines-style" }, CSS));
    if (ctx.first) [picked, lastSeen, linesSeen] = [null, null, 0];
    if (!ctx.legal.length || !hand.includes(picked)) picked = null;
    const fresh = JSON.stringify(last) !== JSON.stringify(lastSeen);
    lastSeen = last;
    const inLine = new Set(lines.flatMap((l) => l.cells));
    const newLine = new Set(lines.slice(linesSeen).flatMap((l) => l.cells));
    linesSeen = lines.length;
    const before = ctx.first || ctx.me !== heldBy ? hand : held;
    [held, heldBy] = [hand, ctx.me];

    const movesOf = (card) => ctx.legal.filter((m) => m.card === card);
    const spots = new Set(
      (picked === null ? (ctx.kid ? ctx.legal.filter((m) => m.t === "play" && !isJack(m.card)) : []) : movesOf(picked))
        .filter((m) => m.cell !== undefined)
        .map((m) => m.cell),
    );
    const rerender = () => this.render(box, { ...ctx, first: false });

    const tapCell = (i) => {
      if (!ctx.legal.length) return ctx.play({ t: "play", card: BOARD[i], cell: i });
      const here = ctx.legal.filter((m) => m.cell === i);
      const move = here.find((m) => m.card === picked) ?? here.find((m) => !isJack(m.card));
      if (move) {
        picked = null;
        return ctx.play(move);
      }
      if (here.some((m) => m.t === "take")) return ctx.say("Tap a one-eyed jack (♠ or ♥) first to take this chip.");
      if (here.length) return ctx.say("Tap a two-eyed jack (♦ or ♣) first to play here.");
      ctx.say(picked === null ? "Tap a card in your hand first: its squares glow." : "That square isn't open for this card.");
    };

    const tapCard = (card) => {
      const moves = movesOf(card);
      if (moves.length === 1 && moves[0].t === "dead") return ctx.play(moves[0]);
      if (!moves.some((m) => m.t !== "dead")) return ctx.say("This card can't be played now.");
      picked = picked === card ? null : card;
      if (picked !== null)
        ctx.say(
          !isJack(card)
            ? `Tap a glowing square for the ${spoken(card)}.`
            : twoEyed(card)
              ? "Two-eyed jack: tap any open square."
              : "One-eyed jack: tap a chip to take it off.",
        );
      rerender();
      // The keyboard goes on to the first glowing square.
      (box.querySelector(".cl-cell.spot") ?? box.querySelector(`.card-btn[aria-pressed="true"]`))?.focus();
    };

    const hinted = (m) => ctx.hint && JSON.stringify(ctx.hint) === JSON.stringify(m);
    const cells = BOARD.map((c, i) => {
      const who = chips[i];
      let body = "";
      let name = "free corner, counts for every player";
      if (c !== -1) {
        const ink = c >= 13 && c < 39 ? COLORS.red : COLORS.ink;
        const s = "SHDC"[Math.floor(c / 13)];
        body = `<text x="20" y="18" text-anchor="middle" font-size="16" font-weight="800" fill="${ink}">${RANKS[(c % 13) + 1]}</text>${suitShape(s, 13, 21, 14)}`;
        name = spoken(c);
      } else body = STAR;
      if (who !== null) {
        body += `<g class="${fresh && last?.cell === i ? "put" : ""}"><circle class="chip" cx="20" cy="20" r="16" fill="${FILLS[who]}" stroke="#fff" stroke-width="2"/>${MARKS[who]}</g>`;
        name += `, ${NAMES[who]} chip${inLine.has(i) ? " in a line" : ""}`;
      } else if (c !== -1) name += ", open";
      const classes = ["cl-cell"];
      if (spots.has(i)) classes.push(ctx.kid && picked === null ? "legal" : "spot");
      if (last?.cell === i) classes.push("last");
      if (inLine.has(i)) classes.push("in-line");
      if (newLine.has(i) && !ctx.first) classes.push("fresh");
      if (ctx.hint?.cell === i) classes.push("hint");
      return el("button", {
        type: "button",
        class: classes.join(" "),
        dataset: { x: i % N, y: Math.floor(i / N), key: `b${i}` },
        "aria-label": `${where(i)}: ${name}`,
        onclick: () => tapCell(i),
        html: svg(body),
      });
    });

    const fan = el(
      "div",
      { class: "hand", role: "group", "aria-label": "Your cards" },
      hand.map((card, i) => {
        const moves = movesOf(card);
        const dead = moves.some((m) => m.t === "dead");
        const kind = !isJack(card) ? "" : twoEyed(card) ? ", wild: any open square" : ", takes a chip off";
        const classes = ["card-btn"];
        if (!before.includes(card)) classes.push("slide");
        if (picked === card) classes.push("picked");
        if (dead) classes.push("dead");
        if (ctx.kid && moves.length && picked === null) classes.push("legal");
        if (ctx.hint && ctx.hint.card === card) classes.push("hint");
        return el("button", {
          type: "button",
          class: classes.join(" "),
          dataset: { x: i, y: N, key: `h${card}-${i}` },
          "aria-label": `${spoken(card)}${kind}${dead ? ", dead: tap to trade it in" : ""}`,
          "aria-pressed": String(picked === card),
          onclick: () => tapCard(card),
          html: cardFace(card),
        });
      }),
    );

    const extra = [];
    if (ctx.legal.some((m) => m.t === "pass"))
      extra.push(
        el(
          "button",
          {
            type: "button",
            class: `pass-btn${hinted({ t: "pass" }) ? " hint" : ""}`,
            dataset: { x: 0, y: N + 1, key: "pass" },
            onclick: () => ctx.play({ t: "pass" }),
          },
          "Pass: no card fits",
        ),
      );
    box.replaceChildren(el("div", { class: "cl" }, el("div", { class: "cl-board", role: "group", "aria-label": "The board" }, cells), ...extra, fan));
  },
};
