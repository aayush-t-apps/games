// Memory's screen: a grid of tiles; a tap or Enter turns one over.
import { PICTURE_NAMES, tile } from "../../lib/cards.js";
import { el } from "../../lib/ui.js";

let shown = [];

export default {
  status: (view, seat) => ({ text: `${view.pairs[seat]} ${view.pairs[seat] === 1 ? "pair" : "pairs"}` }),
  hintText: () => "Try the card that glows.",
  render(box, ctx) {
    const { cols, faces } = ctx.view;
    const legal = new Set(ctx.legal.map((m) => m.i));
    const tiles = faces.map((face, i) => {
      const at = { x: i % cols, y: Math.floor(i / cols), key: `t${i}` };
      if (face === -1) return el("span", { class: "tile gone", "aria-hidden": "true" });
      const classes = ["tile"];
      if (face !== null && shown[i] === null) classes.push("flip");
      if (ctx.kid && legal.has(i)) classes.push("legal");
      if (ctx.hint?.i === i) classes.push("hint");
      return el("button", {
        type: "button",
        class: classes.join(" "),
        dataset: at,
        "aria-label": `Card ${i + 1}, ${face === null ? "face down" : PICTURE_NAMES[face]}`,
        onclick: () => ctx.play({ t: "flip", i }),
        html: tile(face),
      });
    });
    shown = faces.slice();
    box.replaceChildren(el("div", { class: "memory", style: `--cols:${cols}` }, tiles));
  },
};
