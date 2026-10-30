// Quiz Race: on your turn, answer a question. A right answer moves you one step on a 10-step track;
// the first player home wins. Questions are sums made from the seed, or kids' facts from the pack
// below. The CPU is right 60, 80 or 95 times in 100, by level.
import { check, copy, nextSeat, placesBy } from "../../lib/board.js";
import { int, fork, next as random, pick, shuffle } from "../../lib/rng.js";

export const STEPS = 10;
const MAX_MOVES = 600;
const RIGHT = { easy: 0.6, normal: 0.8, hard: 0.95, best: 1 };

// [question, right answer, three wrong answers]
export const FACTS = [
  ["How many legs does a spider have?", "8", "6", "10", "4"],
  ["How many legs does an insect have?", "6", "8", "4", "10"],
  ["Which planet do we live on?", "Earth", "Mars", "Venus", "Jupiter"],
  ["Which is the biggest planet?", "Jupiter", "Earth", "Mars", "Mercury"],
  ["What do bees make?", "Honey", "Milk", "Silk", "Wax crayons"],
  ["How many days are in a week?", "7", "5", "6", "10"],
  ["How many months are in a year?", "12", "10", "11", "13"],
  ["How many hours are in a day?", "24", "12", "20", "60"],
  ["What colour do blue and yellow make?", "Green", "Purple", "Orange", "Brown"],
  ["What colour do red and yellow make?", "Orange", "Green", "Pink", "Blue"],
  ["Which animal is the tallest?", "Giraffe", "Elephant", "Horse", "Camel"],
  ["Which land animal is the fastest?", "Cheetah", "Lion", "Horse", "Rabbit"],
  ["What is frozen water called?", "Ice", "Steam", "Snowman", "Glass"],
  ["How many sides does a triangle have?", "3", "4", "5", "6"],
  ["How many sides does a hexagon have?", "6", "5", "8", "7"],
  ["Which shape has four equal sides and four right angles?", "Square", "Circle", "Triangle", "Oval"],
  ["Which is the biggest ocean?", "Pacific", "Atlantic", "Indian", "Arctic"],
  ["What does a caterpillar turn into?", "Butterfly", "Bee", "Spider", "Beetle"],
  ["Which star is closest to Earth?", "The Sun", "The Moon", "Polaris", "Sirius"],
  ["What is a baby dog called?", "Puppy", "Kitten", "Calf", "Cub"],
  ["What is a baby cat called?", "Kitten", "Puppy", "Foal", "Lamb"],
  ["Which of these is a mammal?", "Whale", "Shark", "Trout", "Octopus"],
  ["How many continents are there?", "7", "5", "6", "9"],
  ["Which sense do you use your nose for?", "Smell", "Taste", "Touch", "Hearing"],
  ["How many wheels does a tricycle have?", "3", "2", "4", "1"],
  ["What do plants need from the Sun to grow?", "Light", "Sand", "Noise", "Wind"],
  ["Which season comes after winter?", "Spring", "Summer", "Autumn", "Winter again"],
  ["What do we call water falling from clouds?", "Rain", "Fog", "Dew", "Steam"],
  ["Which animal lays eggs?", "Hen", "Cow", "Dog", "Goat"],
  ["What is the opposite of hot?", "Cold", "Warm", "Wet", "Loud"],
];

function makeQuestion(s) {
  if (random(s) < 0.5) {
    const fresh = FACTS.map((_, i) => i).filter((i) => !s.used.includes(i));
    if (!fresh.length) s.used = [];
    const i = pick(s, fresh.length ? fresh : FACTS.map((_, k) => k));
    s.used.push(i);
    const [text, right, ...wrong] = FACTS[i];
    const options = shuffle(s, [right, ...wrong]);
    return { text, options, answer: options.indexOf(right) };
  }
  const kind = int(s, 3);
  let a = int(s, 10) + 1;
  let b = int(s, 10) + 1;
  let text;
  let right;
  if (kind === 0) {
    text = `${a} + ${b} = ?`;
    right = a + b;
  } else if (kind === 1) {
    if (b > a) [a, b] = [b, a];
    text = `${a} − ${b} = ?`;
    right = a - b;
  } else {
    text = `${a} × ${b} = ?`;
    right = a * b;
  }
  const wrong = new Set();
  for (const d of shuffle(s, [1, -1, 2, -2, 10, -10, 3])) {
    if (right + d >= 0 && wrong.size < 3) wrong.add(right + d);
  }
  const options = shuffle(s, [right, ...wrong]).map(String);
  return { text, options, answer: options.indexOf(String(right)) };
}

function init(seats, seed) {
  const s = {
    seats,
    rng: seed >>> 0,
    turn: 0,
    moves: 0,
    pos: Array(seats).fill(0),
    used: [],
    q: null,
    note: null,
  };
  s.q = makeQuestion(s);
  return s;
}

const done = (s) => s.pos.some((p) => p >= STEPS) || s.moves >= MAX_MOVES;

function legalMoves(s, seat) {
  if (seat !== s.turn || done(s)) return [];
  return s.q.options.map((_, i) => ({ t: "answer", i }));
}

function apply(s, seat, move) {
  check(legalMoves(s, seat), move, "Pick one of the answers.");
  const next = copy(s);
  next.moves += 1;
  const { q } = next;
  const right = q.options[q.answer];
  if (move.i === q.answer) {
    next.pos[seat] += 1;
    next.note = `@${seat} got it right: ${right}`;
  } else {
    next.note = `@${seat} answered ${q.options[move.i]}. The answer was ${right}`;
  }
  if (!done(next)) {
    next.turn = nextSeat(seat, s.seats);
    next.q = makeQuestion(next);
  }
  return next;
}

function winner(s) {
  return done(s) ? { places: placesBy(s.pos) } : null;
}

const view = (s) => ({ steps: STEPS, pos: s.pos, q: { text: s.q.text, options: s.q.options } });

function ai(s, seat, level) {
  const legal = legalMoves(s, seat);
  const r = fork(s, seat);
  if (random(r) < (RIGHT[level] ?? RIGHT.hard)) return legal[s.q.answer];
  const wrong = legal.filter((m) => m.i !== s.q.answer);
  return wrong[int(r, wrong.length)];
}

export default {
  id: "quiz-race",
  name: "Quiz Race",
  version: 1,
  players: { min: 1, max: 4 },
  hidden: false,
  realtime: false,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
