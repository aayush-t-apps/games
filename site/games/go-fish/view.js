// Go Fish's screen: pick a card in your hand, then the player to ask for that rank.
import { cardBack, cardFace } from "../../lib/cards.js";
import { RANK_NAMES, rank, spoken } from "../../lib/deck.js";
import { el } from "../../lib/ui.js";

let picked = null;
const plural = (r) => (r === 6 ? "6s" : `${RANK_NAMES[r]}s`);

export default {
  status(view, seat) {
    const n = view.counts[seat];
    const b = view.books[seat].length;
    return { text: `${n} ${n === 1 ? "card" : "cards"}, ${b} ${b === 1 ? "book" : "books"}` };
  },
  hintText: (move, _view, names) => `Ask ${names[move.from]} for ${plural(move.rank)}.`,
  render(box, ctx) {
    const { hand, counts, books, stock } = ctx.view;
    const ranks = new Set(hand.map(rank));
    if (!ctx.legal.length || !ranks.has(picked)) picked = null;
    if (ctx.hint) picked = ctx.hint.rank;
    const targets = counts.flatMap((n, seat) => (seat !== ctx.me && n > 0 ? [seat] : []));
    const ask = (from) => {
      if (picked === null) {
        ctx.say("Pick a card first: the rank you want.");
        return;
      }
      ctx.play({ t: "ask", from, rank: picked });
    };
    const pick = (r) => {
      picked = r;
      if (targets.length === 1 && ctx.legal.length) ask(targets[0]);
      else {
        ctx.say(`Ask who for ${plural(r)}?`);
        this.render(box, { ...ctx, hint: null });
        box.querySelector(".ask button")?.focus();
      }
    };
    const legalFrom = new Set(ctx.legal.map((m) => m.from));
    const asks = el(
      "div",
      { class: "ask", role: "group", "aria-label": "Ask a player" },
      targets.map((seat, i) =>
        el(
          "button",
          {
            type: "button",
            class: `${ctx.kid && picked !== null && legalFrom.has(seat) ? "legal" : ""}${ctx.hint?.from === seat ? " hint" : ""}`,
            dataset: { x: i, y: 0, key: `a${seat}` },
            onclick: () => ask(seat),
          },
          picked === null ? `Ask ${ctx.names[seat]}` : `Ask ${ctx.names[seat]} for ${plural(picked)}`,
        ),
      ),
    );
    const pond = el(
      "div",
      { class: "pond", role: "img", "aria-label": `The pond has ${stock} cards` },
      el("span", { class: "card-slot", html: stock ? cardBack() : "" }),
      el("span", { class: "label" }, `Pond: ${stock}`),
    );
    const myBooks = books[ctx.me];
    const fan = el(
      "div",
      { class: "hand", role: "group", "aria-label": "Your cards" },
      hand.map((card, i) =>
        el("button", {
          type: "button",
          class: `card-btn${ctx.kid && ctx.legal.length ? " legal" : ""}${picked === rank(card) ? " picked" : ""}${ctx.hint && ctx.hint.rank === rank(card) && hand.find((c) => rank(c) === rank(card)) === card ? " hint" : ""}`,
          dataset: { x: i, y: 1, key: `c${card}` },
          "aria-label": `Ask for ${plural(rank(card))} (${spoken(card)})`,
          "aria-pressed": picked === rank(card) ? "true" : "false",
          onclick: () => pick(rank(card)),
          html: cardFace(card),
        }),
      ),
    );
    box.replaceChildren(
      el("div", { class: "table" }, pond, asks),
      el(
        "p",
        { class: "books" },
        myBooks.length ? `Your books: ${myBooks.map((r) => plural(r)).join(", ")}` : "No books yet. Collect four of a rank.",
      ),
      fan,
    );
  },
};
