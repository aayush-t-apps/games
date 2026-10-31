---
change: 7
app: games
title: "Card Lines, a Sequence-style game for 2 to 4"
bump: minor
released: v0.6.0
task: aayush-t-apps/shipify#627
---

# 0007: Card Lines, a Sequence-style game for 2 to 4

## Why

The owner (2026-10-31) asked for the "sequence game": a simple game for more players, set up
cleanly and well guided. Most games here are for 2, or for 1. Card Lines is the classic
card-and-board game, named generically as Four in a Row is (no trade names), for 2 to 4 players.

## Spec changes

### Added

- **US12 (P2): Card Lines, a card-and-board game for more players**. As a family or friends, I
  want a Sequence-style game for 2 to 4, so that more of us play one match together.
  - AC12.1 WHEN I tap a card in my hand THE APP SHALL make its open squares glow, and a tap on one
    puts my chip there and draws me a new card; a tap on a square that shows a card I hold plays it.
  - AC12.2 WHEN five chips of one colour are in a row (across, down or on a slant; a corner counts
    for every colour) THE APP SHALL make them a line that no jack takes off; two colours need two
    lines (sharing at most one square), three colours need one.
  - AC12.3 WHEN four play THE APP SHALL seat them in two pairs (seats 1 and 3 against 2 and 4), a
    colour for each pair, and a pair's win is a win for both partners.
  - AC12.4 WHEN I play a two-eyed jack (♦ ♣) THE APP SHALL let me put a chip on any open square;
    a one-eyed jack (♠ ♥) takes another colour's chip off, unless it is in a line; a card whose two
    squares are taken is dead, and a tap trades it in, once a turn, and the turn goes on.
  - AC12.5 WHEN the board is full THE APP SHALL end the match: the most lines first, then the
    longest row of chips.

### Changed

- AC1.1: the hub lists nine games; Card Lines (Board, 2–4 players, ages 7+) comes after Four in a
  Row.
- The game interface: a game of pairs says `teams: true` in its rules; partners share a group in
  `places`, and a shared first place is a win (this device's scores, the result banner).

### Removed

- None.

## Alternatives considered

- **Four players each on their own:** tried first. With four colours on a 10×10 board, two in
  three CPU matches filled the board with no line. Pairs are the game's own rule for four, and end
  with a line.
- **Five or six players (three pairs):** the Setup lets any count in a range, and five can't pair
  up. Two to four keeps Setup as it is; six can follow.
- **The game's own board layout:** a fixed layout of our own (each card at square i and 99 − i, in
  suit order) is easy to scan and reads the same from both sides of the table.

## UI

- **Match:** the board of 100 small cards (corners show a star), chips in blue, red and green with
  a white circle, square or triangle; the hand below as a fan. A picked card rises and its squares
  glow; the last move has a ring; a new line shines. Kid mode glows every square a card fits.
  **Pass: no card fits** only when nothing can be played. Each chip says its colour and lines
  ("Blue · 1 of 2 lines").

## Design

- `site/games/card-lines/rules.js` and `view.js`, and a line in `index.json`, as every game; the
  view imports `BOARD` from its rules. The room and the Worker change nothing: the room never
  reads a game's moves, and `checks.ts` reads `index.json`.
- `app.js`: `finish()` counts a shared first place as a win when the rules say `teams`. The Hub's
  top players still count only a sole human winner, so an online pair's win isn't listed there.
- The CPU scores each square by the stretches of five through it (own and others'); hard blocks
  only a stretch where another colour has three, and wins about 6 in 10 two-player matches against
  normal. A hard move takes under 10 ms.

## Rollout and rollback

- Ships with the release; nothing new is stored. The game folder loads on first play and is cached
  for offline. A rollback restores the previous version; a score kept under `card-lines` stays in
  the browser and shows again after a roll forward.

## Docs and clean-up

- `docs/spec.md` (AC1.1, US12, the game interface, the games table, the CPU levels), `README.md`,
  `DESIGN.md`, `AGENTS.md`, `CHANGELOG.md`.

## Tasks

- [x] T1 [US12] The rules: board, lines, pairs, jacks, dead cards, the full-board end, the CPU —
  files: `site/games/card-lines/rules.js`, `tests/unit/card-lines.test.ts`,
  `tests/unit/games.test.ts` — verifies: AC12.2, AC12.3, AC12.4, AC12.5, AC1.3, AC1.4, AC1.5
- [x] T2 [US12] The screen: pick a card, its squares glow, tap to play — files:
  `site/games/card-lines/view.js`, `site/games/index.json`, `tests/e2e/games.spec.ts` — verifies:
  AC12.1, AC1.1
- [x] T3 [US12] A pair's win counts for both partners — files: `site/lib/app.js` — verifies: AC12.3

## Verification

- `make verify` passes. `docs/spec.md` is updated to match this change.
