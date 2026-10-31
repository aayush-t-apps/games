// Cards, pieces and pictures, drawn by code as SVG. Every string here is made from our own numbers,
// never from text a player typed, so it is safe to put in innerHTML.

export const COLORS = {
  red: "#c0392b",
  blue: "#2457a6",
  yellow: "#e0a800",
  green: "#2e8b57",
  wood: "#8a5a2b",
  felt: "#1f5f46",
  paper: "#f7f4ec",
  ink: "#1b1b1b",
};

const svg = (viewBox, body, cls = "") =>
  `<svg class="${cls}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

// Suit shapes in a 10 × 10 box.
const SUIT_PATH = {
  H: "M5 9.4C3.2 7.9 0 5.6 0 3 0 1.3 1.3 0 2.8 0 3.8 0 4.6.6 5 1.4 5.4.6 6.2 0 7.2 0 8.7 0 10 1.3 10 3c0 2.6-3.2 4.9-5 6.4Z",
  D: "M5 0 9 5 5 10 1 5Z",
  S: "M5 0C3.5 1.8 0 4.2 0 6.4 0 7.9 1.2 9 2.6 9c.9 0 1.6-.4 2-1L4 10h2l-.6-2c.4.6 1.1 1 2 1C8.8 9 10 7.9 10 6.4 10 4.2 6.5 1.8 5 0Z",
  C: "M5 0a2.4 2.4 0 0 0-2.2 3.4A2.4 2.4 0 1 0 4.5 7.6L4 10h2l-.5-2.4A2.4 2.4 0 1 0 7.2 3.4 2.4 2.4 0 0 0 5 0Z",
};
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const red = (s) => s === "H" || s === "D";

/** One suit symbol at (x, y), `size` wide. */
export const suitShape = (s, x, y, size) =>
  `<path d="${SUIT_PATH[s]}" transform="translate(${x} ${y}) scale(${size / 10})" fill="${red(s) ? COLORS.red : COLORS.ink}"/>`;

/** A card face. `c` is 0..51 (see deck.js). */
export function cardFace(c) {
  const s = "SHDC"[Math.floor(c / 13)];
  const r = (c % 13) + 1;
  const ink = red(s) ? COLORS.red : COLORS.ink;
  const court = r > 10 || r === 1;
  const middle = court
    ? `<text x="30" y="55" text-anchor="middle" font-size="30" font-weight="800" fill="${ink}">${RANKS[r]}</text>${suitShape(s, 24, 60, 12)}`
    : suitShape(s, 15, 26, 30);
  return svg(
    "0 0 60 84",
    `<rect x="1" y="1" width="58" height="82" rx="6" fill="#fffdf7" stroke="${COLORS.ink}" stroke-width="1.5"/>` +
      `<text x="6" y="18" font-size="16" font-weight="800" fill="${ink}">${RANKS[r]}</text>` +
      suitShape(s, 6, 21, 9) +
      middle +
      `<g transform="rotate(180 30 42)"><text x="6" y="18" font-size="16" font-weight="800" fill="${ink}">${RANKS[r]}</text></g>`,
    "card",
  );
}

/** The back of a card. */
export function cardBack() {
  return svg(
    "0 0 60 84",
    `<rect x="1" y="1" width="58" height="82" rx="6" fill="${COLORS.red}" stroke="${COLORS.ink}" stroke-width="1.5"/>` +
      `<rect x="6" y="6" width="48" height="72" rx="3" fill="none" stroke="${COLORS.paper}" stroke-width="2"/>` +
      `<path d="M30 18 44 42 30 66 16 42Z" fill="${COLORS.paper}" opacity=".9"/>` +
      `<path d="M30 28 38 42 30 56 22 42Z" fill="${COLORS.wood}"/>`,
    "card",
  );
}

/** A disc for Four in a Row. */
export const disc = (color) =>
  `<circle cx="50" cy="50" r="40" fill="${color}"/><circle cx="50" cy="50" r="28" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="5"/>`;

/** A Ludo token. */
export const token = (color) =>
  svg(
    "0 0 40 40",
    `<circle cx="20" cy="20" r="17" fill="${color}" stroke="${COLORS.ink}" stroke-width="2.5"/>` +
      `<circle cx="20" cy="20" r="9" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="2"/>` +
      `<circle cx="20" cy="20" r="4" fill="${color}"/>`,
    "token",
  );

const PIPS = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ],
  5: [
    [1, 1],
    [3, 1],
    [2, 2],
    [1, 3],
    [3, 3],
  ],
  6: [
    [1, 1],
    [3, 1],
    [1, 2],
    [3, 2],
    [1, 3],
    [3, 3],
  ],
};

/** A die showing n (1..6), or a blank die. */
export function die(n) {
  const pips = (PIPS[n] ?? []).map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.6"/>`);
  return svg(
    "0 0 40 40",
    `<rect x="1.5" y="1.5" width="37" height="37" rx="7" fill="#fffdf7" stroke="${COLORS.ink}" stroke-width="2.5"/><g fill="${COLORS.ink}">${pips.join("")}</g>`,
    "die",
  );
}

// Ten pictures for Memory, in a 40 × 40 box: each has its own shape and colour.
const PICTURES = [
  // sun
  `<g stroke="${COLORS.yellow}" stroke-width="3" stroke-linecap="round"><path d="M20 3v6M20 31v6M3 20h6M31 20h6M8 8l4 4M28 28l4 4M8 32l4-4M28 12l4-4"/></g><circle cx="20" cy="20" r="8" fill="${COLORS.yellow}"/>`,
  // moon
  `<path d="M26 5a15 15 0 1 0 9 22A12 12 0 0 1 26 5Z" fill="${COLORS.blue}"/>`,
  // star
  `<path d="M20 3l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1Z" fill="${COLORS.red}"/>`,
  // heart
  `<path d="M20 35C14 30 4 23 4 14a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 9-10 16-16 21Z" fill="${COLORS.red}" opacity=".75"/>`,
  // leaf
  `<path d="M6 34C6 16 16 6 35 5c0 19-10 29-29 29Z" fill="${COLORS.green}"/><path d="M8 32 28 12" stroke="${COLORS.paper}" stroke-width="2"/>`,
  // fish
  `<path d="M4 20c6-9 18-11 26 0-8 11-20 9-26 0Z" fill="${COLORS.blue}"/><path d="m29 20 8-7v14Z" fill="${COLORS.blue}"/><circle cx="12" cy="18" r="2" fill="${COLORS.paper}"/>`,
  // flower
  `<g fill="${COLORS.yellow}"><circle cx="20" cy="9" r="6"/><circle cx="31" cy="20" r="6"/><circle cx="20" cy="31" r="6"/><circle cx="9" cy="20" r="6"/></g><circle cx="20" cy="20" r="6" fill="${COLORS.wood}"/>`,
  // house
  `<path d="M5 19 20 6l15 13v16H5Z" fill="${COLORS.wood}"/><rect x="16" y="24" width="8" height="11" fill="${COLORS.paper}"/>`,
  // tree
  `<path d="M20 3 34 27H6Z" fill="${COLORS.green}"/><rect x="17" y="27" width="6" height="10" fill="${COLORS.wood}"/>`,
  // boat
  `<path d="M4 26h32l-6 9H10Z" fill="${COLORS.wood}"/><path d="M20 4v20H8Z" fill="${COLORS.red}"/><path d="M22 8v16h10Z" fill="${COLORS.blue}"/>`,
];
export const PICTURE_NAMES = [
  "sun",
  "moon",
  "star",
  "heart",
  "leaf",
  "fish",
  "flower",
  "house",
  "tree",
  "boat",
];

/** A Memory tile: a picture, or its back when `n` is null. */
export function tile(n) {
  if (n === null)
    return svg(
      "0 0 40 40",
      `<rect x="1" y="1" width="38" height="38" rx="6" fill="${COLORS.wood}"/><path d="M20 9 31 20 20 31 9 20Z" fill="none" stroke="${COLORS.paper}" stroke-width="2" opacity=".7"/>`,
      "tile",
    );
  return svg(
    "0 0 40 40",
    `<rect x="1" y="1" width="38" height="38" rx="6" fill="#fffdf7"/>${PICTURES[n]}`,
    "tile",
  );
}

/** The small picture on each game's box in the hub. */
export function emblem(id) {
  const c = COLORS;
  const art = {
    "crazy-eights": `<g transform="rotate(-12 32 40)"><rect x="10" y="10" width="28" height="40" rx="4" fill="#fffdf7" stroke="${c.ink}" stroke-width="1.5"/><text x="14" y="26" font-size="14" font-weight="800" fill="${c.ink}">8</text></g><g transform="rotate(10 32 40)"><rect x="26" y="12" width="28" height="40" rx="4" fill="#fffdf7" stroke="${c.ink}" stroke-width="1.5"/><text x="30" y="28" font-size="14" font-weight="800" fill="${c.red}">8</text>${suitShape("H", 34, 32, 12)}</g>`,
    "go-fish": `<path d="M8 34c9-13 26-16 38 0-12 16-29 13-38 0Z" fill="${c.blue}"/><path d="m45 34 12-10v20Z" fill="${c.blue}"/><circle cx="19" cy="31" r="3" fill="${c.paper}"/><path d="M10 52c8 4 36 4 44 0" stroke="${c.paper}" stroke-width="3" fill="none"/>`,
    memory: `<rect x="8" y="8" width="22" height="22" rx="4" fill="${c.wood}"/><rect x="34" y="8" width="22" height="22" rx="4" fill="#fffdf7"/><path d="M45 11l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7-5.5-4.5 7-.5Z" fill="${c.red}"/><rect x="8" y="34" width="22" height="22" rx="4" fill="#fffdf7"/><path d="M19 37l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7-5.5-4.5 7-.5Z" fill="${c.red}"/><rect x="34" y="34" width="22" height="22" rx="4" fill="${c.wood}"/>`,
    ludo: `<rect x="6" y="6" width="22" height="22" fill="${c.red}"/><rect x="36" y="6" width="22" height="22" fill="${c.green}"/><rect x="36" y="36" width="22" height="22" fill="${c.yellow}"/><rect x="6" y="36" width="22" height="22" fill="${c.blue}"/><rect x="28" y="6" width="8" height="52" fill="#fffdf7"/><rect x="6" y="28" width="52" height="8" fill="#fffdf7"/>`,
    "four-in-a-row": `<rect x="4" y="10" width="56" height="46" rx="5" fill="${c.blue}"/>${[0, 1, 2, 3]
      .map((x) =>
        [0, 1, 2]
          .map(
            (y) =>
              `<circle cx="${13 + x * 13}" cy="${20 + y * 13}" r="5" fill="${(x + y) % 3 === 0 ? c.red : x === 3 - y ? c.yellow : c.paper}"/>`,
          )
          .join(""),
      )
      .join("")}`,
    "card-lines": `<g transform="rotate(-10 24 26)"><rect x="12" y="4" width="28" height="40" rx="4" fill="#fffdf7" stroke="${c.ink}" stroke-width="1.5"/><text x="16" y="20" font-size="14" font-weight="800" fill="${c.ink}">J</text>${suitShape("D", 25, 26, 11)}</g><circle cx="50" cy="22" r="6" fill="${c.red}" stroke="${c.paper}" stroke-width="1.5"/>${[0, 1, 2, 3, 4]
      .map((i) => `<circle cx="${8 + i * 12}" cy="55" r="5" fill="${c.blue}" stroke="${c.paper}" stroke-width="1.5"/>`)
      .join("")}`,
    "snakes-ladders": `<rect x="6" y="6" width="52" height="52" rx="4" fill="#fffdf7"/>${[0, 1, 2, 3]
      .map((x) =>
        [0, 1, 2, 3]
          .filter((y) => (x + y) % 2)
          .map((y) => `<rect x="${6 + x * 13}" y="${6 + y * 13}" width="13" height="13" fill="#f1e3c8"/>`)
          .join(""),
      )
      .join("")}<path d="M14 54 30 12M24 56 40 14M17 46l10 3.5M20 38l10 3.5M23 30l10 3.5M26 22l10 3.5" stroke="${c.wood}" stroke-width="3" stroke-linecap="round"/><path d="M48 12c-10 6 8 14-2 22s6 14-6 20" stroke="${c.green}" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="48" cy="12" r="4.5" fill="${c.green}"/><circle cx="46.5" cy="11" r="1.1" fill="#fff"/><circle cx="49.5" cy="11" r="1.1" fill="#fff"/>`,
    "quiz-race":`<path d="M6 50h52" stroke="${c.paper}" stroke-width="3" stroke-dasharray="6 4"/><circle cx="18" cy="44" r="6" fill="${c.red}"/><circle cx="32" cy="44" r="6" fill="${c.blue}"/><path d="M52 18v32" stroke="${c.paper}" stroke-width="3"/><path d="M52 18h-14l4 6-4 6h14Z" fill="${c.yellow}"/><text x="14" y="30" font-size="22" font-weight="800" fill="${c.paper}">?</text>`,
    sudoku: `<rect x="6" y="6" width="52" height="52" rx="4" fill="#fffdf7"/><path d="M23.3 6v52M40.6 6v52M6 23.3h52M6 40.6h52" stroke="${c.ink}" stroke-width="2"/><text x="10" y="20" font-size="12" font-weight="800" fill="${c.ink}">5</text><text x="28" y="37" font-size="12" font-weight="800" fill="${c.blue}">3</text><text x="45" y="54" font-size="12" font-weight="800" fill="${c.red}">9</text>`,
    crossword: `${[0, 1, 2, 3]
      .map((x) =>
        [0, 1, 2, 3]
          .map((y) => `<rect x="${6 + x * 13}" y="${6 + y * 13}" width="12" height="12" fill="${(x + 2 * y) % 5 === 3 ? c.ink : "#fffdf7"}"/>`)
          .join(""),
      )
      .join("")}<text x="9" y="16" font-size="9" font-weight="800" fill="${c.ink}">A</text><text x="22" y="16" font-size="9" font-weight="800" fill="${c.ink}">B</text><text x="9" y="29" font-size="9" font-weight="800" fill="${c.red}">C</text>`,
  }[id];
  return svg("0 0 64 64", art ?? "", "emblem");
}
