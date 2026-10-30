// Ludo's screen: the board in SVG with the tokens on top as buttons, and the die below it.
// Roll, then tap the token to move.
import { COLORS, die, token } from "../../lib/cards.js";
import { el } from "../../lib/ui.js";

const PALETTE = [COLORS.red, COLORS.green, COLORS.yellow, COLORS.blue];
const NAMES = ["Red", "Green", "Yellow", "Blue"];
const HOME = 56;

// Board geometry in cell units (15 × 15), as the centre of each place. Colour 0's corner is top
// left; each next colour is a quarter turn clockwise.
const turn = ([x, y], n) => {
  let p = [x, y];
  for (let i = 0; i < n; i++) p = [15 - p[1], p[0]];
  return p;
};
const ARM = [
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
  [8, 0],
].map(([x, y]) => [x + 0.5, y + 0.5]);
const TRACK = [0, 1, 2, 3].flatMap((q) => ARM.map((p) => turn(p, q)));
const LANE = [1, 2, 3, 4, 5].map((x) => [x + 0.5, 7.5]);
const BASE = [
  [1.75, 1.75],
  [4.25, 1.75],
  [1.75, 4.25],
  [4.25, 4.25],
];
const DONE = [
  [6.4, 7.1],
  [6.4, 7.9],
  [6.9, 7.1],
  [6.9, 7.9],
];

function place(color, p, k) {
  if (p === -1) return turn(BASE[k], color);
  if (p === HOME) return turn(DONE[k], color);
  if (p > 50) return turn(LANE[p - 51], color);
  return TRACK[(color * 13 + p) % 52];
}

let boardSvg = "";
function board(safe) {
  if (boardSvg) return boardSvg;
  const cell = ([cx, cy], fill, extra = "") =>
    `<rect x="${cx - 0.5}" y="${cy - 0.5}" width="1" height="1" fill="${fill}" stroke="${COLORS.ink}" stroke-width=".04"/>${extra}`;
  let out = `<rect width="15" height="15" fill="#fffdf7"/>`;
  for (let c = 0; c < 4; c++) {
    const [bx, by] = turn([3, 3], c);
    out += `<rect x="${bx - 3}" y="${by - 3}" width="6" height="6" fill="${PALETTE[c]}" stroke="${COLORS.ink}" stroke-width=".06"/>`;
    out += `<rect x="${bx - 2.2}" y="${by - 2.2}" width="4.4" height="4.4" rx=".4" fill="#fffdf7"/>`;
    for (const spot of BASE) {
      const [sx, sy] = turn(spot, c);
      out += `<circle cx="${sx}" cy="${sy}" r=".55" fill="none" stroke="${PALETTE[c]}" stroke-width=".12"/>`;
    }
    for (const lane of LANE) out += cell(turn(lane, c), PALETTE[c]);
    out += cell(TRACK[c * 13], PALETTE[c]);
    const [a, b] = [turn([6, 6], c), turn([6, 9], c)];
    out += `<path d="M${a[0]} ${a[1]}L7.5 7.5L${b[0]} ${b[1]}Z" fill="${PALETTE[c]}" stroke="${COLORS.ink}" stroke-width=".04"/>`;
  }
  TRACK.forEach((center, i) => {
    if (i % 13 === 0) return;
    const star = safe.includes(i)
      ? `<path d="M${center[0]} ${center[1] - 0.32}l.09.2.22.03-.16.15.04.22-.19-.1-.19.1.04-.22-.16-.15.22-.03Z" fill="${COLORS.wood}"/>`
      : "";
    out += cell(center, "#fffdf7", star);
  });
  boardSvg = `<svg class="ludo-board" viewBox="0 0 15 15" aria-hidden="true" focusable="false">${out}</svg>`;
  return boardSvg;
}

// Where each token was at the last draw ("seat:k" → [x, y, p]), so a moved one slides from there.
let was = new Map();
let lastDie = null;

const where = (p) =>
  p === -1 ? "in base" : p === HOME ? "home" : p > 50 ? `${HOME - p} from home` : `${p + 1} squares out`;

export default {
  status(view, seat) {
    const home = view.tokens[seat].filter((p) => p === HOME).length;
    return { text: `${home} of 4 home`, color: PALETTE[view.colors[seat]] };
  },
  hintText: (move) => (move.t === "roll" ? "Roll the die." : "Move the token that glows."),
  render(box, ctx) {
    const { colors, tokens, die: rolled, safe } = ctx.view;
    const movable = new Set(ctx.legal.filter((m) => m.t === "move").map((m) => m.k));
    if (ctx.first) was = new Map();
    const now = new Map();
    const pieces = [];
    tokens.forEach((list, seat) => {
      const color = colors[seat];
      list.forEach((p, k) => {
        const [cx, cy] = place(color, p, k);
        // Tokens that share a square sit a little apart.
        const twins = list.filter((q, j) => j < k && q === p && p !== -1 && p !== HOME).length;
        const [x, y] = [cx + twins * 0.18, cy - twins * 0.18];
        now.set(`${seat}:${k}`, [x, y, p]);
        // A moved token slides from its last place; one sent back to base (captured) flies there.
        const [ox, oy, op] = was.get(`${seat}:${k}`) ?? [x, y, p];
        const moved = ox !== x || oy !== y;
        const motion = moved ? `;--dx:${(ox - x).toFixed(2)};--dy:${(oy - y).toFixed(2)}` : "";
        const style = `left:${((x - 0.5) / 15) * 100}%;top:${((y - 0.5) / 15) * 100}%${motion}`;
        const label = `${NAMES[color]} token ${k + 1}, ${where(p)}`;
        const classes = ["piece"];
        if (moved) classes.push(p === -1 && op !== -1 ? "knocked" : "slid");
        if (seat === ctx.me && p !== HOME) {
          if (ctx.kid && movable.has(k)) classes.push("legal");
          if (ctx.hint?.t === "move" && ctx.hint.k === k) classes.push("hint");
          pieces.push(
            el("button", {
              type: "button",
              class: classes.join(" "),
              style,
              dataset: { x: Math.round(cx * 2), y: Math.round(cy * 2), key: `k${k}` },
              "aria-label": `Move ${label}`,
              onclick: () => ctx.play({ t: "move", k }),
              html: token(PALETTE[color]),
            }),
          );
        } else {
          pieces.push(el("span", { class: classes.join(" "), style, role: "img", "aria-label": label, html: token(PALETTE[color]) }));
        }
      });
    });
    was = now;
    const rolledNow = rolled !== null && rolled !== lastDie;
    lastDie = rolled;
    const canRoll = ctx.legal.some((m) => m.t === "roll");
    const roll = el(
      "button",
      {
        type: "button",
        class: `roll${ctx.kid && canRoll ? " legal" : ""}${ctx.hint?.t === "roll" ? " hint" : ""}`,
        dataset: { x: 15, y: 32, key: "roll" },
        "aria-label": rolled ? `The die shows ${rolled}` : "Roll the die",
        onclick: () => ctx.play({ t: "roll" }),
      },
      el("span", { class: `die-face${rolledNow ? " rolled" : ""}`, html: die(rolled) }),
      el("span", { class: "label" }, rolled ? `Rolled ${rolled}` : "Roll"),
    );
    box.replaceChildren(
      el("div", { class: "ludo" }, el("div", { class: "ludo-wrap", html: board(safe) }, ...pieces)),
      roll,
    );
  },
};
