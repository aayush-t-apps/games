// Makes Word Tiles' word list (site/games/word-tiles/rules.js, its last line, `const WORDS`).
// The words: SCOWL's English, American and British words up to size 50 (common words and their
// forms, http://wordlist.aspell.net), lower case a–z only, 2 to 15 letters, and ENABLE's two- and
// three-letter words (public domain), the short words a crossword game needs, and FE, KI, OI, QI
// and ZA. Stored front coded in order: a digit (the letters shared with the word before, at most
// 9), then the rest.
//
//   curl -LO https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz && tar xzf scowl-*.tar.gz
//   curl -LO https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
//   node tools/word-list.mjs scowl-2020.12.07/final enable1.txt
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [scowl, enable] = process.argv.slice(2);
if (!scowl || !enable) {
  console.error("usage: node tools/word-list.mjs <scowl final dir> <enable1.txt>");
  process.exit(1);
}
const RULES = "site/games/word-tiles/rules.js";
const words = new Set();
for (const file of readdirSync(scowl)) {
  const m = /^(english|american|british)-words\.(\d+)$/.exec(file);
  if (!m || Number(m[2]) > 50) continue;
  for (const w of readFileSync(join(scowl, file), "latin1").split("\n"))
    if (/^[a-z]{2,15}$/.test(w.trim())) words.add(w.trim());
}
for (const w of readFileSync(enable, "utf8").split("\n"))
  if (/^[a-z]{2,3}$/.test(w.trim())) words.add(w.trim());
// Two-letter words that newer lists added after ENABLE: they make a Q or a Z easier to play.
for (const w of ["fe", "ki", "oi", "qi", "za"]) words.add(w);

let prev = "";
let out = "";
for (const w of [...words].sort()) {
  let k = 0;
  while (k < 9 && k < w.length && k < prev.length && w[k] === prev[k]) k++;
  out += k + w.slice(k);
  prev = w;
}
const text = readFileSync(RULES, "utf8");
const at = text.lastIndexOf("const WORDS = ");
writeFileSync(RULES, `${text.slice(0, at)}const WORDS = "${out}";\n`);
console.log(`${words.size} words, ${out.length} characters`);
