---
change: 10
app: games
title: "Word Guess by topic, and filters on the hub"
bump: minor
released: v0.8.0
task: aayush-t-apps/shipify#691
---

# 0010: Word Guess by topic, and filters on the hub

## Why

The owner (2026-11-06), on the same task as Word Tiles (change 0009), asked for "wordle", with
"vocab from places categories", "clear and well", and for the games to be "categorize[d] by
players, kids or text games", with filters "simply organized". With twelve games, the hub needs
a quick way to the right one.

## Spec changes

### Added

- **US15 (P2): Word Guess, a word of five letters by topic** (change 0010). As a player, I want
  to find a hidden word from colour clues, from a topic I pick, so that I play a short word
  puzzle alone.
  - AC15.1 WHEN I start Word Guess with **Today's word** THE APP SHALL give every device the same
    word that day; WHEN I pick a topic (Places, Animals, Food, Nature, Home, Sports, or A mix) it
    SHALL pick the word from that topic's list.
  - AC15.2 WHEN I enter a word of five letters from the word list THE APP SHALL mark each letter
    green (right square), yellow (in the word, another square) or grey (not in it, or not again),
    and colour the keyboard's keys the same; else it SHALL say why in one line.
  - AC15.3 WHEN I find the word THE APP SHALL say how many guesses it took; there is no limit on
    guesses (six rows show, more come as needed), and **Hint** shows one right letter in its
    square, or types in the word once every square is known.
- **US16 (P2): Find a game fast** (change 0010). As anyone, I want to filter the hub by how many
  play and by kind, so that I find a game for who is here.
  - AC16.1 WHEN I tap a **Players** chip (Any, 1, 2, 3–4, 5–6) or a **Kind** chip (All, Kids,
    Words, Cards, Board, Puzzles) THE APP SHALL show only the games that fit both, and say "No
    game fits both" with **Show all games** when none does. Kids: a kids' game, or one for ages 5+
    or younger. Words: Crossword, Word Tiles and Word Guess.

### Changed

- AC1.1: the hub lists twelve games; Word Guess (Puzzle, 1 player, ages 7+) comes last.

### Removed

- None.

## Alternatives considered

- **Six guesses, then a loss:** the app has no lost puzzle (a puzzle ends "Solved!") and the hub
  is for kids too. Unlimited guesses, with the count, is simpler and kinder.
- **Guesses from Word Tiles' word list:** a game may import only `site/lib/{rng,deck,board}.js`.
  Word Guess keeps its own list of five-letter words (about 8,700, 43 KB).
- **Filters as one row of tags, or a search box:** two short rows (who plays, what kind) answer
  the two questions people ask, with no typing.

## UI

- **Word Guess:** the topic over the grid, six rows of five squares (more as needed), the open
  row with the letters typed, and a keyboard (Q to P, A to L, Enter, Z to M, ⌫) whose keys take
  each letter's best colour. The device's own keyboard types too. Each guess flips in. A shown
  letter sits grey in its square. Setup's pick is **Words**: Today's word, A mix, then the topics.
  The box's picture is two rows of coloured squares.
- **Hub:** under Join friends, two rows of chips, **Players** and **Kind**, with the one on in
  wood colour. They stay as set until the page closes.

## Design

- `site/games/word-guess/rules.js` and `view.js`, a line in `index.json` (with a `pick` and
  `daily: "today"`), the emblem in `cards.js`. The word is in the state, never in a view. Moves:
  `{t: "guess", word}` and `{t: "show", i}` (the hint). `legalMoves` holds only the hint; `apply`
  takes any word of the list. A match ends after 60 moves with the word put in.
- The topic lists are in `rules.js`, 30 to 55 words each; Places has cities and countries (any
  topic word is a guess). The guesses: SCOWL's five-letter words to size 50 and ENABLE's, made by
  `tools/word-list.mjs` with Word Tiles' list.
- `index.json` gets an optional `tags` list; `"words"` marks the word games. The filters are
  `fits(game, filters)` in `app.js`; the boxes that don't fit are hidden.

## Rollout and rollback

- Ships with the release (with change 0009); nothing new is stored. A rollback restores the
  previous version.

## Docs and clean-up

- `docs/spec.md` (AC1.1, US15, US16, the games table, `index.json`'s fields), `README.md`,
  `DESIGN.md`, `AGENTS.md`, `CHANGELOG.md`.

## Tasks

- [x] T1 [US15] Word Guess's rules and topics — files: `site/games/word-guess/rules.js`,
  `tools/word-list.mjs`, `tests/unit/word-guess.test.ts`, `tests/unit/games.test.ts` — verifies:
  AC15.1, AC15.2, AC15.3, AC1.3, AC1.5
- [x] T2 [US15] Word Guess's screen and box — files: `site/games/word-guess/view.js`,
  `site/games/index.json`, `site/lib/cards.js`, `tests/e2e/games.spec.ts` — verifies: AC15.2,
  AC15.3, AC1.1
- [x] T3 [US16] The hub's filters — files: `site/lib/app.js`, `site/lib/app.css`,
  `site/games/index.json`, `tests/e2e/games.spec.ts` — verifies: AC16.1

## Verification

- `make verify` passes. `docs/spec.md` is updated to match this change.
