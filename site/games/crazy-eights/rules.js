// Crazy Eights: match the top card's suit or rank. An 8 plays on anything and names the next suit.
// With no card to play, draw one; play it if it fits. The first player out of cards wins.
import { check, copy, nextSeat, placesBy } from "../../lib/board.js";
import { SUITS, SUIT_NAMES, deal, draw, label, newDeck, rank, refill, sortHand, suit } from "../../lib/deck.js";
import { int, fork } from "../../lib/rng.js";

const MAX_MOVES = 1500;

function init(seats, seed) {
  const s = {
    seats,
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    hands: [],
    stock: [],
    discard: [],
    suit: "S",
    drew: false,
    passes: 0,
    out: null,
    note: null,
  };
  s.stock = newDeck(s);
  s.hands = deal(s.stock, seats, seats === 2 ? 7 : 5);
  // The first card on the table is never an 8: an 8 goes back into the middle of the stock.
  while (rank(s.stock[s.stock.length - 1]) === 8) {
    s.stock.splice(Math.floor(s.stock.length / 2), 0, s.stock.pop());
  }
  s.discard.push(s.stock.pop());
  s.suit = suit(s.discard[0]);
  return s;
}

const top = (s) => s.discard[s.discard.length - 1];
const over = (s) => s.out !== null || s.passes >= s.seats || s.moves >= MAX_MOVES;
const fits = (s, c) => rank(c) === 8 || suit(c) === s.suit || rank(c) === rank(top(s));

function plays(s, cards) {
  const out = [];
  for (const c of cards) {
    if (!fits(s, c)) continue;
    if (rank(c) === 8) for (const named of SUITS) out.push({ t: "play", card: c, suit: named });
    else out.push({ t: "play", card: c });
  }
  return out;
}

function legalMoves(s, seat) {
  if (seat !== s.turn || over(s)) return [];
  const hand = s.hands[seat];
  if (s.drew) return [...plays(s, [hand[hand.length - 1]]), { t: "pass" }];
  const out = plays(s, hand);
  if (out.length) return out;
  return [{ t: s.stock.length || s.discard.length > 1 ? "draw" : "pass" }];
}

function endTurn(s, seat) {
  s.drew = false;
  s.turn = nextSeat(seat, s.seats);
}

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, "Play a card of the same suit or rank, or an 8. No card? Draw.");
  const next = copy(s);
  next.moves += 1;
  const hand = next.hands[seat];
  if (move.t === "play") {
    hand.splice(hand.indexOf(move.card), 1);
    next.discard.push(move.card);
    next.suit = move.suit ?? suit(move.card);
    next.passes = 0;
    next.note = move.suit
      ? `@${seat} played ${label(move.card)} and chose ${SUIT_NAMES[move.suit]}`
      : `@${seat} played ${label(move.card)}`;
    if (!hand.length) next.out = seat;
    else endTurn(next, seat);
  } else if (move.t === "draw") {
    refill(next, next.stock, next.discard);
    draw(next.stock, hand);
    next.passes = 0;
    next.note = `@${seat} drew a card`;
    if (fits(next, hand[hand.length - 1])) next.drew = true;
    else endTurn(next, seat);
  } else {
    next.passes += 1;
    next.note = `@${seat} passed`;
    endTurn(next, seat);
  }
  return next;
}

function winner(s) {
  if (!over(s)) return null;
  const sizes = s.hands.map((h) => h.length);
  return { places: placesBy(sizes, false) };
}

// With no seat (`null`), the public view: no hand, for spectators and a table.
function view(s, seat) {
  return {
    hand: seat === null ? [] : sortHand(s.hands[seat]),
    counts: s.hands.map((h) => h.length),
    top: top(s),
    suit: s.suit,
    stock: s.stock.length,
    drew: s.drew,
  };
}

// The CPU sees only its own view: its hand, the table and the card counts.
function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  const playsOnly = legal.filter((m) => m.t === "play");
  if (!playsOnly.length) return legal[0];
  const r = fork(s, seat);
  const hand = s.hands[seat];
  if (level === "easy") {
    const choice = playsOnly[int(r, playsOnly.length)];
    return choice.suit ? { ...choice, suit: SUITS[int(r, 4)] } : choice;
  }
  const rest = (c) => hand.filter((h) => h !== c);
  const bestSuit = (cards) => {
    const counts = SUITS.map((x) => cards.filter((c) => suit(c) === x && rank(c) !== 8).length);
    return SUITS[counts.indexOf(Math.max(...counts))];
  };
  const nextCount = s.hands[nextSeat(seat, s.seats)].length;
  const value = (m) => {
    const left = rest(m.card);
    const newSuit = m.suit ?? suit(m.card);
    let v = left.filter((c) => suit(c) === newSuit || rank(c) === rank(m.card)).length;
    if (rank(m.card) === 8) v -= left.length ? (level === "normal" || nextCount > 2 ? 10 : 0) : -10;
    return v;
  };
  let best = null;
  let bestValue = -Infinity;
  for (const m of playsOnly) {
    if (m.suit && m.suit !== bestSuit(rest(m.card))) continue;
    const v = value(m);
    if (v > bestValue) {
      best = m;
      bestValue = v;
    }
  }
  return best ?? playsOnly[0];
}

export default {
  id: "crazy-eights",
  name: "Crazy Eights",
  version: 1,
  players: { min: 2, max: 6 },
  hidden: true,
  realtime: false,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
