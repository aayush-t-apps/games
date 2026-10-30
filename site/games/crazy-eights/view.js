// Crazy Eights' screen: the stock and the pile on the table, your hand as a fan at the bottom.
// Tap a card to play it; an 8 then asks for the next suit.
import { cardBack, cardFace, suitShape } from "../../lib/cards.js";
import { SUIT_NAMES, rank, spoken } from "../../lib/deck.js";
import { el } from "../../lib/ui.js";

let picking = null;
let lastTop = null;

const suitIcon = (s) =>
  `<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">${suitShape(s, 0, 0, 10)}</svg>`;

export default {
  status: (view, seat) => ({ text: `${view.counts[seat]} ${view.counts[seat] === 1 ? "card" : "cards"}` }),
  hintText(move) {
    if (move.t === "draw") return "Draw a card.";
    if (move.t === "pass") return "Pass: keep your cards.";
    return move.suit
      ? `Play the ${spoken(move.card)} and pick ${SUIT_NAMES[move.suit]}.`
      : `Play the ${spoken(move.card)}.`;
  },
  render(box, ctx) {
    const { hand, top, suit, stock, drew } = ctx.view;
    const isLegal = (m) => ctx.legal.some((l) => l.t === m.t && l.card === m.card);
    if (!ctx.legal.length || !hand.includes(picking)) picking = null;
    const fresh = top !== lastTop;
    lastTop = top;
    const play = (card) => {
      if (rank(card) === 8 && ctx.legal.some((l) => l.card === card)) {
        picking = card;
        ctx.say("Pick the next suit.");
        this.render(box, ctx);
        box.querySelector(".suits button")?.focus();
      } else ctx.play({ t: "play", card });
    };
    const kidMark = (m) => (ctx.kid && isLegal(m) ? " legal" : "");
    const hinted = (m) =>
      ctx.hint && ctx.hint.t === m.t && (m.card === undefined || ctx.hint.card === m.card) ? " hint" : "";
    const table = el(
      "div",
      { class: "table" },
      el(
        "button",
        {
          type: "button",
          class: `stock${kidMark({ t: "draw" })}${hinted({ t: "draw" })}`,
          dataset: { x: 0, y: 0, key: "draw" },
          "aria-label": `Draw a card. ${stock} in the stock`,
          onclick: () => ctx.play({ t: "draw" }),
        },
        el("span", { class: "card-slot", html: stock ? cardBack() : "" }),
        el("span", { class: "label" }, `Draw (${stock})`),
      ),
      el(
        "div",
        { class: "pile", role: "img", "aria-label": `On the pile: ${spoken(top)}. Suit to play: ${SUIT_NAMES[suit]}` },
        el("span", { class: `card-slot${fresh ? " slide" : ""}`, html: cardFace(top) }),
        el("span", { class: "label suit-now" }, el("span", { class: "suit-icon", html: suitIcon(suit) }), SUIT_NAMES[suit]),
      ),
    );
    const fan = el(
      "div",
      { class: "hand", role: "group", "aria-label": "Your cards" },
      hand.map((card, i) =>
        el("button", {
          type: "button",
          class: `card-btn${kidMark({ t: "play", card })}${hinted({ t: "play", card })}${picking === card ? " picked" : ""}`,
          dataset: { x: i, y: 1, key: `c${card}` },
          "aria-label": `Play ${spoken(card)}`,
          onclick: () => play(card),
          html: cardFace(card),
        }),
      ),
    );
    const extra = [];
    if (picking !== null) {
      extra.push(
        el(
          "div",
          { class: "suits", role: "group", "aria-label": "Pick the next suit" },
          ["S", "H", "D", "C"].map((s, i) =>
            el(
              "button",
              {
                type: "button",
                dataset: { x: i, y: 2, key: `s${s}` },
                onclick: () => {
                  const card = picking;
                  picking = null;
                  ctx.play({ t: "play", card, suit: s });
                },
              },
              el("span", { class: "suit-icon", html: suitIcon(s) }),
              SUIT_NAMES[s],
            ),
          ),
        ),
      );
    }
    if (ctx.legal.some((m) => m.t === "pass")) {
      extra.push(
        el(
          "button",
          {
            type: "button",
            class: `pass-btn${kidMark({ t: "pass" })}${hinted({ t: "pass" })}`,
            dataset: { x: 0, y: 3, key: "pass" },
            onclick: () => ctx.play({ t: "pass" }),
          },
          drew ? "Keep it and pass" : "Pass",
        ),
      );
    }
    box.replaceChildren(table, ...extra, fan);
  },
};
