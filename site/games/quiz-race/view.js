// Quiz Race's screen: the question, four answers, and the race track.
import { COLORS } from "../../lib/cards.js";
import { el } from "../../lib/ui.js";

const LANES = [COLORS.red, COLORS.blue, COLORS.yellow, COLORS.green];

export default {
  status: (view, seat) => ({ text: `Step ${view.pos[seat]} of ${view.steps}`, color: LANES[seat] }),
  hintText: (move, view) => `Try ${view.q.options[move.i]}.`,
  render(box, ctx) {
    const { steps, pos, q } = ctx.view;
    const mine = ctx.legal.length > 0;
    const answers = q.options.map((text, i) =>
      el(
        "button",
        {
          type: "button",
          class: `answer${ctx.kid && mine ? " legal" : ""}${ctx.hint?.i === i ? " hint" : ""}`,
          dataset: { x: i % 2, y: Math.floor(i / 2), key: `a${i}` },
          onclick: () => ctx.play({ t: "answer", i }),
        },
        text,
      ),
    );
    const lanes = pos.map((p, seat) =>
      el(
        "li",
        { class: "lane", "aria-label": `${ctx.names[seat]}: step ${p} of ${steps}` },
        el("span", { class: "lane-name", "aria-hidden": "true" }, ctx.names[seat]),
        el(
          "span",
          { class: "steps", "aria-hidden": "true", style: `--steps:${steps}` },
          Array.from({ length: steps }, (_, i) =>
            el("span", {
              class: `step${i < p ? " done" : ""}${i === p - 1 ? " here" : ""}`,
              style: i < p ? `--lane:${LANES[seat]}` : null,
            }),
          ),
        ),
      ),
    );
    box.replaceChildren(
      el("p", { class: "question" }, q.text),
      el("div", { class: "answers", role: "group", "aria-label": "Answers" }, answers),
      el("ol", { class: "race", "aria-label": "The race" }, lanes),
    );
  },
};
