// Four in a Row's screen: seven column buttons; a tap or Enter drops a disc in that column.
import { COLORS, disc } from "../../lib/cards.js";
import { el } from "../../lib/ui.js";

const SEAT_COLORS = [COLORS.red, COLORS.yellow];
const SEAT_NAMES = ["Red", "Yellow"];
let animated = null;

export default {
  status: (_view, seat) => ({ text: SEAT_NAMES[seat], color: SEAT_COLORS[seat] }),
  hintText: (move) => `Try column ${move.col + 1}.`,
  sound: () => "drop",
  render(box, ctx) {
    const { cols, rows, cells, last, line } = ctx.view;
    const legal = new Set(ctx.legal.map((m) => m.col));
    const win = new Set(line ?? []);
    const fresh = last !== animated;
    animated = last;
    const columns = Array.from({ length: cols }, (_, col) => {
      let free = 0;
      let holes = "";
      for (let row = 0; row < rows; row++) {
        const i = row * cols + col;
        const who = cells[i];
        if (who === null) free++;
        holes += `<circle cx="50" cy="${row * 100 + 50}" r="40" class="hole"/>`;
        if (who !== null) {
          const cls = `${i === last && fresh ? "drop" : ""}${win.has(i) ? " win" : ""}`;
          holes += `<g class="${cls}" style="--from:${-(row + 1) * 100}px" transform="translate(0 ${row * 100})">${disc(SEAT_COLORS[who])}</g>`;
        }
      }
      const classes = ["col"];
      if (ctx.kid && legal.has(col)) classes.push("legal");
      if (ctx.hint?.col === col) classes.push("hint");
      return el(
        "button",
        {
          type: "button",
          class: classes.join(" "),
          dataset: { x: col, y: 0, key: `c${col}` },
          "aria-label": `Column ${col + 1}, ${free ? `${free} free` : "full"}`,
          onclick: () => ctx.play({ t: "drop", col }),
          html: `<svg viewBox="0 0 100 ${rows * 100}" aria-hidden="true" focusable="false">${holes}</svg>`,
        },
      );
    });
    box.replaceChildren(el("div", { class: "c4" }, columns));
  },
};
