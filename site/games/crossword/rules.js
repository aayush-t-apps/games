// Crossword: one player fills a small crossword made from the seed. Pick a topic, a mix, or Today's
// puzzle (a mix of every topic, the same for everyone on the day). A word right glows; all right wins.
import { check, copy } from "../../lib/board.js";
import { shuffle } from "../../lib/rng.js";

const SIZE = 13;
const MOST = 12;
const ENOUGH = 10;
const TRIES = 12;
const MAX_MOVES = 3000;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// "WORD|Clue". Words are 3 to 9 letters, A to Z.
export const BANK = {
  animals: [
    "TIGER|Big striped cat",
    "LION|Big cat known as the king of the jungle",
    "ZEBRA|Horse-like animal with black and white stripes",
    "GIRAFFE|Tallest animal, with a very long neck",
    "ELEPHANT|Big grey animal with a trunk",
    "MONKEY|Tree climber that loves bananas",
    "PENGUIN|Black and white bird that swims but cannot fly",
    "DOLPHIN|Clever sea mammal that clicks and whistles",
    "WHALE|Biggest animal in the ocean",
    "SHARK|Ocean hunter with rows of teeth",
    "OWL|Night bird that hoots",
    "EAGLE|Large bird of prey with a hooked beak",
    "PARROT|Colourful bird that can copy words",
    "RABBIT|Long-eared pet that hops",
    "HAMSTER|Small pet that stuffs food in its cheeks",
    "TURTLE|Reptile that carries its shell",
    "FROG|Green hopper that croaks",
    "SNAKE|Long reptile with no legs",
    "CAMEL|Desert animal with one or two humps",
    "KANGAROO|Australian hopper with a pouch",
    "KOALA|Grey tree-dweller that eats eucalyptus",
    "PANDA|Black and white bear that eats bamboo",
    "BEAVER|Animal that builds dams",
    "OTTER|Playful swimmer that floats on its back",
    "FOX|Wild animal with a bushy red tail",
    "WOLF|Wild cousin of the dog that howls",
    "BEAR|Big furry animal that sleeps all winter",
    "MOOSE|Largest deer, with wide antlers",
    "HORSE|Animal you can ride, that neighs",
    "DONKEY|Animal that brays",
    "GOAT|Farm animal with a beard",
    "SHEEP|Farm animal that gives us wool",
    "PIG|Farm animal that oinks",
    "COW|Farm animal that moos",
    "HEN|Female chicken",
    "DUCK|Bird that quacks",
    "SWAN|Graceful white bird with a long neck",
    "BEE|Insect that makes honey",
    "ANT|Tiny insect that lives in a colony",
    "SPIDER|Eight-legged web spinner",
    "OCTOPUS|Sea creature with eight arms",
    "CRAB|Shore creature that walks sideways",
    "BAT|Flying mammal that sleeps upside down",
    "HEDGEHOG|Small spiny animal that rolls into a ball",
    "SNAIL|Slow mover that carries its home",
  ],
  food: [
    "APPLE|Crunchy fruit, red or green",
    "BANANA|Long yellow fruit",
    "ORANGE|Citrus fruit and a colour",
    "LEMON|Sour yellow citrus fruit",
    "GRAPE|Small fruit that grows in bunches",
    "MANGO|Sweet tropical fruit with a big stone",
    "CHERRY|Small red fruit on a stalk",
    "PEACH|Fuzzy fruit with a stone",
    "PEAR|Fruit shaped like a bell",
    "MELON|Big juicy fruit with a hard rind",
    "CARROT|Orange root that rabbits love",
    "POTATO|Root you can mash, bake or fry",
    "TOMATO|Red fruit used in salads and sauces",
    "ONION|Bulb that can make you cry",
    "GARLIC|Strong-smelling bulb made of cloves",
    "PEPPER|Spice that can make you sneeze",
    "BREAD|Loaf baked from flour and yeast",
    "BUTTER|Yellow spread made from cream",
    "CHEESE|Food made from milk, like cheddar",
    "EGG|Food a hen lays",
    "RICE|Small grains eaten all over the world",
    "PASTA|Italian food like spaghetti",
    "PIZZA|Flat round dish with toppings",
    "SOUP|Hot dish you eat with a spoon",
    "SALAD|Mix of fresh leaves and vegetables",
    "HONEY|Sweet food made by bees",
    "SUGAR|Sweet white crystals",
    "SALT|White seasoning from the sea",
    "FLOUR|Powder made from ground wheat",
    "NOODLE|Long thin strip of dough",
    "PANCAKE|Flat cake cooked in a pan",
    "WAFFLE|Breakfast cake with a grid pattern",
    "COOKIE|Small sweet baked treat",
    "MUFFIN|Small cake baked in a paper cup",
    "YOGURT|Thick creamy food made from milk",
    "OLIVE|Small fruit pressed for oil",
    "BEAN|Seed in a pod, often baked",
    "PEA|Small green ball from a pod",
    "CORN|Yellow kernels on a cob",
    "OAT|Grain used for porridge",
    "TEA|Hot drink made from leaves",
    "JAM|Sweet fruit spread",
    "PIE|Baked dish with a pastry crust",
    "CURRY|Spicy dish often served with rice",
    "TOAST|Bread browned by heat",
  ],
  world: [
    "OCEAN|Huge body of salt water",
    "RIVER|Water flowing to the sea",
    "LAKE|Body of water with land all around",
    "ISLAND|Land with water all around it",
    "DESERT|Very dry, sandy place",
    "FOREST|Large area full of trees",
    "JUNGLE|Thick tropical forest",
    "MOUNTAIN|Very high hill, like Everest",
    "VALLEY|Low land between hills",
    "VOLCANO|Mountain that can erupt",
    "CANYON|Deep valley cut by a river",
    "BEACH|Sandy shore by the sea",
    "CLIFF|Steep rock face",
    "GLACIER|Slow river of ice",
    "CAVE|Hollow in a hill or under the ground",
    "EUROPE|Continent with France and Italy",
    "AFRICA|Continent with the Sahara",
    "ASIA|Largest continent",
    "EQUATOR|Imaginary line around the middle of Earth",
    "NORTH|Way a compass needle points",
    "SOUTH|Opposite of north",
    "EAST|Where the sun rises",
    "WEST|Where the sun sets",
    "MAP|Drawing that shows where places are",
    "GLOBE|Round model of the Earth",
    "CITY|Large busy town",
    "VILLAGE|Small country settlement",
    "PARIS|Capital of France",
    "ROME|Capital of Italy",
    "TOKYO|Capital of Japan",
    "CAIRO|Capital of Egypt",
    "NILE|Long river in Africa",
    "SAHARA|Largest hot desert",
    "ALPS|Mountains of Switzerland",
    "RAIN|Water falling from clouds",
    "SNOW|Frozen flakes from the sky",
    "STORM|Wild weather with wind and rain",
    "TIDE|Rise and fall of the sea",
    "WAVE|Moving ridge of water",
    "POND|Small still pool of water",
    "HILL|Small rise of land",
    "CORAL|Reef builder in warm seas",
  ],
  science: [
    "ATOM|Tiny building block of matter",
    "CELL|Smallest unit of life",
    "GENE|Unit of heredity in DNA",
    "ENERGY|Power to do work",
    "GRAVITY|Force that pulls things down",
    "MAGNET|It pulls iron towards it",
    "PLANET|Earth is one",
    "COMET|Icy body with a glowing tail",
    "ORBIT|Path around a planet or star",
    "MOON|It goes around the Earth",
    "STAR|The Sun is one",
    "GALAXY|Huge group of stars",
    "ROCKET|Vehicle that flies to space",
    "OXYGEN|Gas we breathe in",
    "CARBON|Element in diamonds and coal",
    "HYDROGEN|Lightest element",
    "METAL|Iron or copper, for example",
    "ACID|Lemon juice is a weak one",
    "LENS|Curved glass that bends light",
    "LASER|Narrow beam of bright light",
    "PRISM|Glass that splits light into colours",
    "SOUND|What your ears pick up",
    "LIGHT|It travels fastest of all",
    "HEAT|Warmth, a form of energy",
    "FORCE|A push or a pull",
    "MASS|Amount of matter in something",
    "VOLT|Unit of electric potential",
    "ROBOT|Machine that can do tasks by itself",
    "FOSSIL|Remains of ancient life in rock",
    "DINOSAUR|Extinct reptile, like T. rex",
    "BRAIN|Organ you think with",
    "HEART|Organ that pumps blood",
    "LUNG|Organ you breathe with",
    "BONE|Hard part of the skeleton",
    "BLOOD|Red liquid in your veins",
    "VIRUS|Tiny germ that can make you ill",
    "MICROBE|Living thing too small to see",
    "CLIMATE|Weather over many years",
    "THEORY|An idea that explains the facts",
    "SOLAR|Of the Sun",
    "ECLIPSE|When the Moon hides the Sun",
  ],
  sports: [
    "SOCCER|Game also called football",
    "TENNIS|Game with rackets and a net",
    "GOLF|Game with clubs and eighteen holes",
    "RUGBY|Game with an oval ball and tries",
    "HOCKEY|Game with sticks and a puck or ball",
    "CRICKET|Bat and ball game with wickets",
    "BASEBALL|Game with home runs on a diamond",
    "BOXING|Sport in a ring with gloves",
    "KARATE|Martial art from Japan",
    "JUDO|Martial art with throws",
    "SKIING|Sliding down snowy slopes",
    "SURFING|Riding waves on a board",
    "ROWING|Racing boats with oars",
    "CYCLING|Sport on two wheels",
    "SWIMMING|Sport in a pool",
    "DIVING|Jumping into water from a board",
    "ARCHERY|Sport with a bow and arrows",
    "SKATING|Gliding on ice",
    "CHESS|Board game with kings and pawns",
    "RACE|Contest of speed",
    "GOAL|Score in soccer",
    "TEAM|Group playing together",
    "COACH|Person who trains a team",
    "MEDAL|Gold, silver or bronze prize",
    "TROPHY|Cup given to the winner",
    "REFEREE|Official who keeps the rules",
    "BALL|Round thing you kick or throw",
    "NET|Mesh across a tennis court",
    "RACKET|Tennis bat with strings",
    "SCORE|The points in a game",
    "PITCH|Field for soccer or cricket",
    "COURT|Place to play tennis",
    "STADIUM|Big arena for sport",
    "MARATHON|Very long running race",
    "SPRINT|Short, very fast race",
    "RELAY|Race where teammates pass a baton",
    "HURDLES|Race with jumps over barriers",
    "JOG|Run at a gentle pace",
    "SKI|Long runner worn on snow",
    "DART|Small arrow thrown at a board",
    "KICK|Hit with the foot",
    "SERVE|Start a point in tennis",
    "WIN|Opposite of lose",
  ],
  arts: [
    "PIANO|Instrument with black and white keys",
    "GUITAR|Instrument with six strings",
    "DRUM|Instrument you hit with sticks",
    "VIOLIN|Instrument played with a bow under the chin",
    "FLUTE|Instrument you blow across",
    "TRUMPET|Brass instrument with three valves",
    "HARP|Big instrument with strings you pluck",
    "SONG|Music you sing",
    "CHOIR|Group of singers",
    "OPERA|Play that is sung",
    "BALLET|Dance on tiptoe that tells a story",
    "TUNE|A melody",
    "RHYTHM|The beat of music",
    "BAND|Group that plays music",
    "CONCERT|Live music show",
    "NOVEL|Long story in a book",
    "POEM|Verse that may rhyme",
    "AUTHOR|Person who writes books",
    "CHAPTER|Part of a book",
    "STORY|A tale",
    "LIBRARY|Place to borrow books",
    "FILM|A movie",
    "ACTOR|Person who plays a part",
    "STAGE|Platform where plays are put on",
    "SCRIPT|Words for actors to say",
    "CARTOON|Animated film or funny drawing",
    "PAINT|Colour you brush on",
    "CANVAS|Cloth that painters work on",
    "BRUSH|Tool for painting",
    "EASEL|Stand that holds a painting",
    "SKETCH|Quick rough drawing",
    "STATUE|Carved or cast figure",
    "POTTERY|Pots made from clay",
    "CRAYON|Waxy colouring stick",
    "MUSEUM|Place to see art and history",
    "GALLERY|Room or building showing art",
    "POET|Person who writes verse",
    "HERO|Main good character",
    "COMEDY|Funny play or film",
    "DRAMA|Serious play",
    "MIME|Acting without words",
    "PUPPET|Doll moved by strings or a hand",
  ],
  words: [
    "HAPPY|Opposite of sad",
    "ASLEEP|Opposite of awake",
    "EARLY|Opposite of late",
    "OPEN|Opposite of closed",
    "LOUD|Opposite of quiet",
    "FAST|Opposite of slow",
    "HEAVY|Opposite of light",
    "EMPTY|Opposite of full",
    "BEGIN|Start",
    "BRAVE|Not afraid",
    "TINY|Very small",
    "HUGE|Very big",
    "QUICK|Fast, speedy",
    "CUP|Tea ___ or ___cake",
    "HOME|___work or ___made",
    "SUN|___flower or ___shine",
    "BOW|Rain___ or ___ and arrow",
    "FIRE|___work or camp___",
    "BOOK|___case or note___",
    "FOOT|___ball or bare___",
    "DOOR|___bell or back___",
    "KEY|___board or ___hole",
    "HOUSE|Green___ or light___",
    "SAND|___castle or ___paper",
    "WATER|___fall or ___melon",
    "TOOTH|___brush or ___paste",
    "RHYME|Cat and hat do this",
    "SPELL|Say the letters of a word",
    "VERB|Doing word, like run",
    "NOUN|Naming word, like table",
    "ECHO|Sound that comes back",
    "SECRET|Something you keep to yourself",
    "PUZZLE|A problem to solve for fun",
    "RIDDLE|Tricky question with a clever answer",
    "WORD|Letters that make sense together",
    "LETTER|A, B or C, for example",
    "ALPHABET|A to Z",
    "FRIEND|Someone you like and trust",
    "LAUGH|What you do at a joke",
    "SMILE|Happy look on your face",
    "DREAM|Story you see while asleep",
    "THANKS|Word said for a gift",
    "HELLO|A greeting",
    "GOODBYE|Word said when you leave",
    "CLOCK|It tells the time",
  ],
};
export const TOPICS = Object.keys(BANK);

// The words of a pick, each once: {word, clue}.
const pools = {};
function pool(pick) {
  if (pools[pick]) return pools[pick];
  const seen = new Set();
  const out = [];
  for (const line of (BANK[pick] ? [BANK[pick]] : Object.values(BANK)).flat()) {
    const [word, clue] = line.split("|");
    if (!seen.has(word)) out.push({ word, clue });
    seen.add(word);
  }
  return (pools[pick] = out);
}

// One go at a grid: the first long word across the middle, then each next word where it crosses
// the most letters, nearest the middle. A word never runs on into another or lies beside one.
function build(holder, words) {
  const list = shuffle(holder, words);
  const g = Array(SIZE * SIZE).fill("");
  const used = Array(SIZE * SIZE).fill(0);
  const filled = [];
  const placed = [];
  const taken = new Set();
  const at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? "" : g[y * SIZE + x]);
  const put = (p) => {
    const [dx, dy] = p.dir ? [0, 1] : [1, 0];
    for (let k = 0; k < p.e.word.length; k++) {
      const i = (p.y + dy * k) * SIZE + p.x + dx * k;
      if (!g[i]) filled.push(i);
      g[i] = p.e.word[k];
      used[i] |= p.dir ? 2 : 1;
    }
    placed.push(p);
    taken.add(p.e);
  };
  // How many letters the word crosses there, or -1 where it may not go.
  const fits = (word, x, y, dir) => {
    const [dx, dy] = dir ? [0, 1] : [1, 0];
    const len = word.length;
    if (x < 0 || y < 0 || x + dx * (len - 1) >= SIZE || y + dy * (len - 1) >= SIZE) return -1;
    if (at(x - dx, y - dy) || at(x + dx * len, y + dy * len)) return -1;
    let cross = 0;
    for (let k = 0; k < len; k++) {
      const cx = x + dx * k;
      const cy = y + dy * k;
      const c = g[cy * SIZE + cx];
      if (c) {
        if (c !== word[k] || used[cy * SIZE + cx] & (dir ? 2 : 1)) return -1;
        cross++;
      } else if (at(cx + dy, cy + dx) || at(cx - dy, cy - dx)) return -1;
    }
    return cross && cross < len ? cross : -1;
  };
  const spot = (e) => {
    let best = null;
    let bestScore = -Infinity;
    const mid = (SIZE - 1) / 2;
    for (const i of filled) {
      const ix = i % SIZE;
      const iy = (i - ix) / SIZE;
      for (let k = 0; k < e.word.length; k++) {
        if (e.word[k] !== g[i]) continue;
        for (const dir of [0, 1]) {
          const x = dir ? ix : ix - k;
          const y = dir ? iy - k : iy;
          const cross = fits(e.word, x, y, dir);
          if (cross < 0) continue;
          const half = (e.word.length - 1) / 2;
          const score = cross * 20 - Math.abs(x + (dir ? 0 : half) - mid) - Math.abs(y + (dir ? half : 0) - mid);
          if (score > bestScore) {
            bestScore = score;
            best = { e, dir, x, y };
          }
        }
      }
    }
    return best;
  };
  const first = list.find((e) => e.word.length >= 6) ?? list[0];
  put({ e: first, dir: 0, x: (SIZE - first.word.length) >> 1, y: SIZE >> 1 });
  for (let more = true; more && placed.length < MOST; ) {
    more = false;
    for (const e of list) {
      if (placed.length >= MOST) break;
      if (taken.has(e)) continue;
      const p = spot(e);
      if (p) {
        put(p);
        more = true;
      }
    }
  }
  return placed;
}

function init(_seats, seed, pick) {
  const chosen = pick === "mix" || Object.hasOwn(BANK, pick) ? pick : "today";
  const holder = { rng: seed >>> 0 };
  const words = pool(chosen === "mix" || chosen === "today" ? "all" : chosen);
  let placed = [];
  for (let t = 0; t < TRIES && placed.length < ENOUGH; t++) {
    const next = build(holder, words);
    if (next.length > placed.length) placed = next;
  }
  // Crop to the words, then number the squares the usual way.
  const span = (p, k) => (p.dir ? [p.x, p.y + k] : [p.x + k, p.y]);
  let [x0, y0, x1, y1] = [SIZE, SIZE, 0, 0];
  for (const p of placed)
    for (const k of [0, p.e.word.length - 1]) {
      const [x, y] = span(p, k);
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const sol = Array(w * h).fill("");
  for (const p of placed)
    for (let k = 0; k < p.e.word.length; k++) {
      const [x, y] = span(p, k);
      sol[(y - y0) * w + x - x0] = p.e.word[k];
    }
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sol[y * w + x] !== "";
  const nums = Array(w * h).fill(0);
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const across = !open(x - 1, y) && open(x + 1, y);
      const down = !open(x, y - 1) && open(x, y + 1);
      if (open(x, y) && (across || down)) nums[y * w + x] = ++n;
    }
  const entries = placed
    .map((p) => ({
      n: nums[(p.y - y0) * w + p.x - x0],
      dir: p.dir ? "down" : "across",
      x: p.x - x0,
      y: p.y - y0,
      len: p.e.word.length,
      clue: p.e.clue,
    }))
    .sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir === "across" ? -1 : 1));
  return {
    turn: 0,
    moves: 0,
    rng: holder.rng,
    note: null,
    pick: chosen,
    w,
    h,
    open: sol.map((c) => (c ? 1 : 0)),
    nums,
    got: sol.map(() => ""),
    entries,
    // Letters put over a wrong one.
    reveals: 0,
    sol,
  };
}

/** The squares of an entry, as indexes y * w + x. */
export const cellsOf = (e, w) =>
  Array.from({ length: e.len }, (_, k) => (e.dir === "down" ? (e.y + k) * w + e.x : e.y * w + e.x + k));

const right = (s, e) => cellsOf(e, s.w).every((i) => s.got[i] === s.sol[i]);
const solved = (s) => s.sol.every((c, i) => s.got[i] === c);
const over = (s) => s.moves >= MAX_MOVES || solved(s);
const named = (s, e) => `${e.n} ${e.dir === "down" ? "Down" : "Across"}: ${cellsOf(e, s.w).map((i) => s.sol[i]).join("")}`;

function legalMoves(s, seat) {
  if (seat !== 0 || over(s)) return [];
  const out = [];
  s.open.forEach((on, i) => {
    if (!on) return;
    for (const ch of ABC) if (ch !== s.got[i]) out.push({ t: "put", i, ch });
    if (s.got[i]) out.push({ t: "clear", i });
  });
  return out;
}

// The move as it should be, or null: checked here rather than against the long list of moves.
function legal(s, seat, m) {
  if (seat !== 0 || over(s) || !m || typeof m !== "object" || !Number.isInteger(m.i) || !s.open[m.i]) return null;
  const { i, ch } = m;
  if (m.t === "put" && typeof ch === "string" && ch.length === 1 && ABC.includes(ch) && ch !== s.got[i])
    return { t: "put", i, ch };
  if (m.t === "clear" && s.got[i]) return { t: "clear", i };
  return null;
}

function apply(s, seat, move) {
  const reason =
    seat !== 0 ? "Only the solver plays this puzzle." : over(s) ? "The crossword is finished." : "Pick an open square and a letter.";
  const ok = legal(s, seat, move);
  check(ok ? [ok] : [], move, reason);
  const next = copy(s);
  const { i } = ok;
  next.moves += 1;
  next.note = null;
  if (ok.t === "clear") {
    next.got[i] = "";
    return next;
  }
  if (s.got[i] && s.got[i] !== s.sol[i]) next.reveals += 1;
  next.got[i] = ok.ch;
  if (solved(next)) next.note = "@0 solved the crossword";
  else {
    const got = next.entries.filter((e) => cellsOf(e, s.w).includes(i) && right(next, e));
    if (got.length) next.note = `@0 got ${got.map((e) => named(next, e)).join(" and ")}`;
  }
  return next;
}

function winner(s) {
  return over(s) ? { places: [[0]] } : null;
}

function view(s) {
  const done = [];
  s.entries.forEach((e, k) => right(s, e) && done.push(k));
  const left = s.open.filter((on, i) => on && !s.got[i]).length;
  return { w: s.w, h: s.h, open: s.open, nums: s.nums, got: s.got, entries: s.entries, done, left };
}

// Every level: the first square in clue order that is empty or wrong gets its right letter.
function ai(s, seat) {
  for (const e of s.entries)
    for (const i of cellsOf(e, s.w)) if (s.got[i] !== s.sol[i]) return { t: "put", i, ch: s.sol[i] };
  return legalMoves(s, seat)[0];
}

export default {
  id: "crossword",
  name: "Crossword",
  version: 1,
  players: { min: 1, max: 1 },
  hidden: false,
  realtime: false,
  puzzle: true,
  init,
  view,
  legalMoves,
  apply,
  winner,
  ai,
};
