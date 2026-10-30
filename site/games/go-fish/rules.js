// Go Fish: ask another player for a rank you hold. They give you all of it and you ask again; if
// they have none, go fish: draw a card, and ask again only if it's the rank you asked for. Four of
// a rank make a book. When every book is made, the most books win.
import { check, copy, nextSeat, placesBy } from "../../lib/board.js";
import { RANK_NAMES, deal, draw, newDeck, rank, sortHand } from "../../lib/deck.js";
import { int, fork } from "../../lib/rng.js";

const MAX_MOVES = 1500;
const plural = (r) => (r === 6 ? "6s" : `${RANK_NAMES[r]}s`);

function init(seats, seed) {
  const s = {
    seats,
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    hands: [],
    stock: [],
    books: Array.from({ length: seats }, () => []),
    // Ranks each seat is known to hold, because it asked for them (everyone hears the asks).
    known: Array.from({ length: seats }, () => []),
    note: null,
  };
  s.stock = newDeck(s);
  s.hands = deal(s.stock, seats, seats <= 3 ? 7 : 5);
  for (let seat = 0; seat < seats; seat++) makeBooks(s, seat);
  return s;
}

function makeBooks(s, seat) {
  const hand = s.hands[seat];
  for (let r = 1; r <= 13; r++) {
    if (hand.filter((c) => rank(c) === r).length < 4) continue;
    s.hands[seat] = hand.filter((c) => rank(c) !== r);
    s.books[seat].push(r);
    for (const list of s.known) if (list.includes(r)) list.splice(list.indexOf(r), 1);
    return makeBooks(s, seat);
  }
}

const booksMade = (s) => s.books.reduce((n, b) => n + b.length, 0);
const over = (s) => booksMade(s) === 13 || s.moves >= MAX_MOVES;

function legalMoves(s, seat) {
  if (seat !== s.turn || over(s)) return [];
  const ranks = [...new Set(s.hands[seat].map(rank))].sort((a, b) => a - b);
  const out = [];
  for (const r of ranks)
    for (let from = 0; from < s.seats; from++)
      if (from !== seat && s.hands[from].length) out.push({ t: "ask", from, rank: r });
  return out;
}

/** Empty hands draw from the stock; the turn moves on past seats that have no cards. */
function settle(s, seat, again) {
  for (let i = 0; i < s.seats; i++) {
    const who = (seat + i) % s.seats;
    if (!s.hands[who].length) draw(s.stock, s.hands[who]);
  }
  let turn = again ? seat : nextSeat(seat, s.seats);
  for (let i = 0; i < s.seats && !over(s); i++) {
    if (s.hands[turn].length && legalMoves({ ...s, turn }, turn).length) break;
    turn = nextSeat(turn, s.seats);
  }
  s.turn = turn;
}

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, "Ask another player for a rank that is in your hand.");
  const next = copy(s);
  next.moves += 1;
  const { from, rank: r } = move;
  const hand = next.hands[seat];
  const given = next.hands[from].filter((c) => rank(c) === r);
  if (!next.known[seat].includes(r)) next.known[seat].push(r);
  next.known[from] = next.known[from].filter((k) => k !== r);
  let again = false;
  if (given.length) {
    next.hands[from] = next.hands[from].filter((c) => rank(c) !== r);
    hand.push(...given);
    again = true;
    next.note = `@${seat} asked @${from} for ${plural(r)} and got ${given.length}`;
  } else if (draw(next.stock, hand)) {
    again = rank(hand[hand.length - 1]) === r;
    next.note = again
      ? `@${seat} asked @${from} for ${plural(r)}, went fishing and caught one`
      : `@${seat} asked @${from} for ${plural(r)} and went fishing`;
  } else {
    next.note = `@${seat} asked @${from} for ${plural(r)}. No cards to fish`;
  }
  makeBooks(next, seat);
  settle(next, seat, again);
  return next;
}

function winner(s) {
  return over(s) ? { places: placesBy(s.books.map((b) => b.length)) } : null;
}

// With no seat (`null`), the public view: no hand, for spectators and a table.
function view(s, seat) {
  return {
    hand: seat === null ? [] : sortHand(s.hands[seat]),
    counts: s.hands.map((h) => h.length),
    books: s.books,
    stock: s.stock.length,
    known: s.known,
  };
}

// The CPU uses its own hand and what everyone heard: who asked for which rank.
function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  const r = fork(s, seat);
  if (level === "easy") return legal[int(r, legal.length)];
  const hand = s.hands[seat];
  const count = (k) => hand.filter((c) => rank(c) === k).length;
  if (level !== "normal") {
    const sure = legal.filter((m) => s.known[m.from].includes(m.rank));
    if (sure.length) return sure.reduce((a, b) => (count(b.rank) > count(a.rank) ? b : a));
  }
  const most = legal.reduce((a, b) => (count(b.rank) > count(a.rank) ? b : a)).rank;
  const asks = legal.filter((m) => m.rank === most);
  if (level === "normal") return asks[int(r, asks.length)];
  return asks.reduce((a, b) => (s.hands[b.from].length > s.hands[a.from].length ? b : a));
}

export default {
  id: "go-fish",
  name: "Go Fish",
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
