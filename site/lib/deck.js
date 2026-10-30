// Cards for the rules: a card is a number 0..51, `suit * 13 + rank - 1`. Suits are S, H, D, C
// (spades, hearts, diamonds, clubs); ranks are 1 (ace) to 13 (king).
import { shuffle } from "./rng.js";

export const SUITS = ["S", "H", "D", "C"];
export const SUIT_NAMES = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
export const RANK_NAMES = [
  "",
  "ace",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "jack",
  "queen",
  "king",
];

export const rank = (card) => (card % 13) + 1;
export const suit = (card) => SUITS[Math.floor(card / 13)];
export const card = (r, s) => SUITS.indexOf(s) * 13 + r - 1;

/** A short label: "A♥", "10♠", "K♣". */
export function label(c) {
  const r = rank(c);
  const symbol = { S: "♠", H: "♥", D: "♦", C: "♣" }[suit(c)];
  return `${r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : r}${symbol}`;
}

/** The words a screen reader says: "queen of hearts". */
export function spoken(c) {
  return `${RANK_NAMES[rank(c)]} of ${SUIT_NAMES[suit(c)]}`;
}

/** A shuffled 52-card deck. */
export function newDeck(holder) {
  return shuffle(
    holder,
    Array.from({ length: 52 }, (_, i) => i),
  );
}

/** Deal `count` cards to each of `seats` hands from the top of `stock` (it shrinks). */
export function deal(stock, seats, count) {
  const hands = Array.from({ length: seats }, () => []);
  for (let i = 0; i < count; i++) for (const hand of hands) hand.push(stock.pop());
  return hands;
}

/** Draw one card from the stock into a hand. `false` when the stock is empty. */
export function draw(stock, hand) {
  if (!stock.length) return false;
  hand.push(stock.pop());
  return true;
}

/** Turn the discard pile, all but its top card, into a new shuffled stock. */
export function refill(holder, stock, discard) {
  if (stock.length || discard.length < 2) return false;
  const top = discard.pop();
  stock.push(...shuffle(holder, discard));
  discard.length = 0;
  discard.push(top);
  return true;
}

/** Sort a hand by suit, then rank, for display. */
export function sortHand(hand) {
  return hand.slice().sort((a, b) => a - b);
}
