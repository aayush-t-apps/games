// Snakes and Ladders' screen: the board in SVG with the tokens on top, and below it the dice and,
// after a roll, a button for each pick. The squares a pick reaches glow.
import { COLORS, die, token } from "../../lib/cards.js";
import { el } from "../../lib/ui.js";
import { JUMPS, LAST, land } from "./rules.js";

const PALETTE = [COLORS.red, COLORS.blue, COLORS.green, COLORS.yellow];
const NAMES = ["Red", "Blue", "Green", "Yellow"];
const SNAKES = [COLORS.green, COLORS.red, COLORS.blue];
const SIZE = 0.55; // A token, in squares.

// Square k (1..100) in board units: 1 is bottom left, and the rows snake up. 0 is the start,
// a strip below the board, with a place for each seat.
function centre(k, seat = 0) {
  if (k === 0) return [0.7 + seat * 0.8, 10.5];
  const row = Math.floor((k - 1) / 10);
  const col = row % 2 ? 9 - ((k - 1) % 10) : (k - 1) % 10;
  return [col + 0.5, 9.5 - row];
}

let boardSvg = "";
function board() {
  if (boardSvg) return boardSvg;
  let out = `<rect width="10" height="11" fill="${COLORS.felt}"/>`;
  for (let k = 1; k <= LAST; k++) {
    const [x, y] = centre(k);
    const fill = k === LAST ? COLORS.yellow : (Math.floor(x) + Math.floor(y)) % 2 ? "#f1e3c8" : "#fffdf7";
    out += `<rect x="${x - 0.5}" y="${y - 0.5}" width="1" height="1" fill="${fill}" stroke="${COLORS.ink}" stroke-width=".02"/>`;
    out += `<text x="${x - 0.42}" y="${y - 0.2}" font-size=".26" font-weight="700" fill="${COLORS.ink}" opacity=".6">${k}</text>`;
  }
  out += `<text x="9.6" y="10.62" font-size=".36" font-weight="800" text-anchor="end" fill="${COLORS.paper}">Start</text>`;
  let n = 0;
  for (const [from, to] of Object.entries(JUMPS).map(([a, b]) => [Number(a), b])) {
    const [x1, y1] = centre(from);
    const [x2, y2] = centre(to);
    const [dx, dy] = [x2 - x1, y2 - y1];
    const len = Math.hypot(dx, dy);
    const [nx, ny] = [-dy / len, dx / len];
    if (to > from) {
      // A ladder: two rails and a rung every half square.
      const w = 0.17;
      let rungs = "";
      for (let t = 0.35 / len; t < 1; t += 0.5 / len) {
        const [cx, cy] = [x1 + dx * t, y1 + dy * t];
        rungs += `M${cx + nx * w} ${cy + ny * w}L${cx - nx * w} ${cy - ny * w}`;
      }
      out += `<path d="M${x1 + nx * w} ${y1 + ny * w}L${x2 + nx * w} ${y2 + ny * w}M${x1 - nx * w} ${y1 - ny * w}L${x2 - nx * w} ${y2 - ny * w}${rungs}" stroke="${COLORS.wood}" stroke-width=".09" stroke-linecap="round" fill="none"/>`;
    } else {
      // A snake: a wavy body from its head (from) to its tail (to), and a head with eyes.
      const color = SNAKES[n++ % SNAKES.length];
      const bend = Math.min(0.9, len / 4);
      const body = `M${x1} ${y1}C${x1 + dx / 3 + nx * bend} ${y1 + dy / 3 + ny * bend} ${x1 + (2 * dx) / 3 - nx * bend} ${y1 + (2 * dy) / 3 - ny * bend} ${x2} ${y2}`;
      out += `<path d="${body}" stroke="${COLORS.ink}" stroke-width=".3" stroke-linecap="round" fill="none" opacity=".5"/>`;
      out += `<path d="${body}" stroke="${color}" stroke-width=".22" stroke-linecap="round" fill="none"/>`;
      out += `<circle cx="${x1}" cy="${y1}" r=".2" fill="${color}" stroke="${COLORS.ink}" stroke-width=".04"/>`;
      out += `<circle cx="${x1 - 0.07}" cy="${y1 - 0.05}" r=".045" fill="#fff"/><circle cx="${x1 + 0.07}" cy="${y1 - 0.05}" r=".045" fill="#fff"/>`;
    }
  }
  boardSvg = `<svg class="sl-board" viewBox="0 0 10 11" aria-hidden="true" focusable="false">${out}</svg>`;
  return boardSvg;
}

// Where each token was at the last draw (seat → [x, y]), so a moved one slides from there.
let was = new Map();
let lastDice = null;

const where = (p) => (p === 0 ? "at the start" : `on ${p}`);
const box = (x, y, w, h) => `left:${(x / 10) * 100}%;top:${(y / 11) * 100}%;width:${(w / 10) * 100}%;height:${(h / 11) * 100}%`;

/** Where a pick ends, in words: short on the button ("ladder to 25"), in full for a screen reader. */
function pickText(from, n, full) {
  const square = from + n;
  const to = land(from, n);
  if (to === square) return `to ${to}`;
  const kind = to > square ? "ladder" : "snake";
  return full ? `to ${square}, a ${kind} ${to > square ? "up" : "down"} to ${to}` : `${kind} to ${to}`;
}

export default {
  status: (view, seat) => ({ text: view.pos[seat] === 0 ? "At the start" : `On ${view.pos[seat]}`, color: PALETTE[seat] }),
  hintText: (move) => (move.t === "roll" ? "Roll the dice." : `Move ${move.n}.`),
  sound: (move, note) =>
    move.t === "roll" ? "roll" : note.includes("snake") ? "capture" : note.includes("ladder") || note.includes("100") ? "home" : undefined,
  render(root, ctx) {
    const { pos, dice } = ctx.view;
    const picks = ctx.legal.filter((m) => m.t === "move");
    const from = pos[ctx.me];
    if (ctx.first) {
      was = new Map();
      lastDice = null;
    }
    const now = new Map();
    const layer = [];
    // The squares this seat's picks reach glow.
    for (const { n } of picks) {
      const [x, y] = centre(from + n);
      layer.push(el("span", { class: `sl-spot${ctx.hint?.n === n ? " hint" : ""}`, style: box(x - 0.5, y - 0.5, 1, 1) }));
    }
    pos.forEach((p, seat) => {
      // Each seat has its own corner of a square, so tokens that share one stay apart.
      const [cx, cy] = centre(p, seat);
      const [x, y] = p === 0 ? [cx, cy] : [cx + (seat % 2 ? 0.2 : -0.2), cy + (seat < 2 ? -0.08 : 0.25)];
      now.set(seat, [x, y]);
      const [ox, oy] = was.get(seat) ?? [x, y];
      const moved = ox !== x || oy !== y;
      const motion = moved ? `;--dx:${((ox - x) / SIZE).toFixed(2)};--dy:${((oy - y) / SIZE).toFixed(2)}` : "";
      layer.push(
        el("span", {
          class: `sl-piece${moved ? " slid" : ""}`,
          style: box(x - SIZE / 2, y - SIZE / 2, SIZE, SIZE) + motion,
          role: "img",
          "aria-label": `${NAMES[seat]} token, ${ctx.names[seat]}, ${where(p)}`,
          html: token(PALETTE[seat]),
        }),
      );
    });
    was = now;
    const rolledNow = dice !== null && dice.join() !== lastDice;
    lastDice = dice?.join() ?? null;
    const canRoll = ctx.legal.some((m) => m.t === "roll");
    const mine = ctx.turn === ctx.me;
    const who = mine ? "You" : ctx.names[ctx.turn];
    const label = dice ? `${who} rolled ${dice[0]} and ${dice[1]}` : mine ? "Tap to roll" : `${who}'s roll`;
    const faces = (dice ?? [null, null]).map((d) => el("span", { class: `die-face${rolledNow ? " rolled" : ""}`, html: die(d) }));
    const roll = el(
      "button",
      {
        type: "button",
        style: `--seat:${PALETTE[ctx.turn]}`,
        class: `roll sl-roll${ctx.kid && canRoll ? " legal" : ""}${ctx.hint?.t === "roll" ? " hint" : ""}`,
        dataset: { x: 0, y: 12, key: "roll" },
        "aria-label": dice ? `The dice show ${dice[0]} and ${dice[1]}` : "Roll the dice",
        onclick: () => ctx.play({ t: "roll" }),
      },
      el("span", { class: "sl-dice" }, faces),
      el("span", { class: "label" }, label),
    );
    const buttons = picks.map(({ n }, i) =>
      el(
        "button",
        {
          type: "button",
          class: `sl-pick${ctx.kid ? " legal" : ""}${ctx.hint?.n === n ? " hint" : ""}`,
          dataset: { x: 2 + i * 2, y: 12, key: `n${n}` },
          "aria-label": `Move ${n}, ${pickText(from, n, true)}`,
          onclick: () => ctx.play({ t: "move", n }),
        },
        el("strong", {}, `Move ${n}`),
        el("small", {}, pickText(from, n, false)),
      ),
    );
    root.replaceChildren(
      el("div", { class: "sl" }, el("div", { class: "sl-wrap", html: board() }, ...layer)),
      el("div", { class: "sl-controls" }, roll, el("div", { class: "sl-picks" }, buttons)),
    );
  },
};
