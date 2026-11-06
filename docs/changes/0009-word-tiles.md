---
change: 9
app: games
title: "Word Tiles, a crossword game for 2 to 4"
bump: minor
released: v0.8.0
task: aayush-t-apps/shipify#691
---

# 0009: Word Tiles, a crossword game for 2 to 4

## Why

The owner (2026-11-06) asked for Scrabble "for multiple players and cpu play with 2 players,
simple and well built". The hub has no word game for more than one player. Word Tiles is the
classic game, named generically (no trade names, as for Four in a Row and Wild Jacks).

## Spec changes

### Added

- **US14 (P2): Word Tiles, a crossword game for 2 to 4** (change 0009). As a family or friends, I
  want to make words on a board from letter tiles, against the CPU or each other, so that we play
  a word game together.
  - AC14.1 WHEN I put tiles from my rack on the board THE APP SHALL show the words they make and
    their points as I go, and play them only when they are in one line with no gap, joined to the
    tiles there (the first word on the centre star), and every word is in the word list; else it
    SHALL say why in one line.
  - AC14.2 WHEN a play scores THE APP SHALL add each word's letters, with a 2L or 3L square under a
    new tile doubling or tripling that letter and a 2W or 3W square the word, and 50 more for all
    seven tiles; a blank is any letter and worth 0.
  - AC14.3 WHEN I swap THE APP SHALL put the tiles I picked back in the bag and give me as many new
    ones, only while the bag holds 7 or more; WHEN I pass, the turn goes on.
  - AC14.4 WHEN a player uses their last tile with the bag empty THE APP SHALL end the match: each
    other player loses their tiles' points and that player gains them all; WHEN every player
    passed or swapped twice in a row it SHALL end it, each losing their tiles' points. The most
    points wins.

### Changed

- AC1.1: the hub lists eleven games; Word Tiles (Board, 2–4 players, ages 8+) comes last, after
  Crossword. The admin can move it up on **Games**.
- The game interface: Word Tiles' `legalMoves` lists a spread of the plays its CPU found (one per
  score), a swap and a pass, not every play (a position has thousands); its `apply` takes any play
  that follows the rules.

### Removed

- None.

## Alternatives considered

- **A full tournament word list (about 170,000 to 280,000 words):** 1.7 MB or more, and many
  words nobody at a family table knows. SCOWL to size 50 (common words and their forms, American
  and British spellings, about 63,500 words, 220 KB) keeps the game near 90 KB sent compressed.
  The short words a crossword game needs (ENABLE's 2- and 3-letter words, and QI, ZA, KI, OI, FE)
  are added.
- **The word list as a third file in the game's folder, fetched on first play:** it changes the
  folder rule, the service worker and the offline download for one game. It stays in `rules.js`.
- **A smaller list (size 35, 135 KB):** it misses words such as "fjord", "emu" and "replaying".
- **CPU seats only in a two-player match:** the engine runs a CPU in any seat already, and the
  CPU is fast enough for four; limiting it adds a Setup rule for no gain.

## UI

- **Match:** the 15 × 15 board (cream squares, 2L and 3L in light and dark blue, 2W and 3W in
  light and dark red, a star in the centre), wooden letter tiles with their points, and the rack
  below. Tap a tile, then a square; a blank asks for its letter (26 buttons and Cancel); tap a tile
  you put down to take it back. Below: the words and points so far, or the reason they can't be
  played; **Play WORD**, **Take back**, **Mix** (a new rack order), **Swap** (tap tiles to mark,
  then **Swap N tiles** or **Cancel**), **Pass**; the tiles left in the bag. The last play is
  outlined. Each chip says the points. Kid mode glows the squares a word can join; Hint puts the
  hard CPU's play on the board, ready for **Play**.
- **Hub:** the box's picture is WORD across and ONE down on letter tiles.

## Design

- `site/games/word-tiles/rules.js` and `view.js`, a line in `index.json`, the emblem in
  `cards.js`. The view keeps its own styles, like Wild Jacks. The room and the Worker change
  nothing.
- The board is a 225-character string (`.` empty, `A`–`Z` a tile, `a`–`z` a blank played as that
  letter); a rack is a string with `?` for a blank. Moves: `{t: "play", tiles: "112C,113a,114T"}`
  (square and letter, in square order), `{t: "swap", tiles: "AQ"}`, `{t: "pass"}`.
- The word list is front coded on the last line of `rules.js` and built into a trie in typed
  arrays on first use (about 180 ms once, on the test box). `tools/word-list.mjs` makes it from
  SCOWL and ENABLE; the SCOWL notice is in the file's header.
- The CPU finds plays from each anchor square with the rack, checking the letters each square
  allows across the line (Appel and Jacobson), with one blank a play. It keeps the first play for
  each score and the best play by points plus the worth of the kept tiles. Easy picks one of 12
  scores spread from best to worst; normal the most points; hard adds the kept tiles' worth (with
  the bag empty, the points left on the rack count against it). Normal beat easy in 40 of 40
  two-player matches, hard beat normal in 28 of 40. A CPU move takes about 4 ms on average and
  under 75 ms at worst on the test box.

## Rollout and rollback

- Ships with the release; nothing new is stored. The game folder loads on first play and is cached
  for offline. A rollback restores the previous version; a score kept under `word-tiles` stays in
  the browser.

## Docs and clean-up

- `docs/spec.md` (AC1.1, US14, the game interface, the games table, the CPU levels, the limits),
  `README.md`, `DESIGN.md`, `AGENTS.md` (the word list), `CHANGELOG.md`.

## Tasks

- [x] T1 [US14] The rules: the board, the tiles, the word list, a play's words and points, swap,
  pass, the end, the CPU — files: `site/games/word-tiles/rules.js`, `tools/word-list.mjs`,
  `tests/unit/word-tiles.test.ts`, `tests/unit/games.test.ts` — verifies: AC14.1, AC14.2, AC14.3,
  AC14.4, AC1.3, AC1.4, AC1.5
- [x] T2 [US14] The screen: the board, the rack, the blank's letter, swap, the points as you go,
  the picture on the box — files: `site/games/word-tiles/view.js`, `site/games/index.json`,
  `site/lib/cards.js`, `tests/e2e/games.spec.ts` — verifies: AC14.1, AC1.1

## Verification

- `make verify` passes. `docs/spec.md` is updated to match this change.
