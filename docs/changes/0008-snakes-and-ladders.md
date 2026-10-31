---
change: 8
app: games
title: "Snakes and Ladders, roll two dice and pick"
bump: minor
released: v0.7.0
task: aayush-t-apps/shipify#628
---

# 0008: Snakes and Ladders, roll two dice and pick

## Why

The owner (2026-10-31) asked for Snakes and Ladders: "very fun with some complexity", as simple as
Ludo, pass-and-play or online. The classic game has no choices (the die decides it all), so the
CPU levels and the player's own skill would mean nothing. Here a roll of two dice gives a pick.

## Spec changes

### Added

- **US13 (P2): Snakes and Ladders, a race with a choice** (change 0008). As a family or kids, I
  want a simple dice race where my pick matters, so that we all play and still think.
  - AC13.1 WHEN I roll THE APP SHALL roll two dice and offer each die and both added (each number
    once) as a button, with where it ends, and make the squares they reach glow.
  - AC13.2 WHEN a token ends on a ladder's foot THE APP SHALL take it up to the ladder's top; on a
    snake's head, down to its tail; and say so ("climbed a ladder from 4 to 25").
  - AC13.3 WHEN a pick goes past 100 THE APP SHALL not offer it; WHEN no pick fits THE APP SHALL
    say so and pass the turn. The first token on 100 wins; the others are placed by their square.

### Changed

- AC1.1: the hub lists ten games; Snakes and Ladders (Board, 2–4 players, ages 4+) comes after
  Ludo.

### Removed

- None.

## Alternatives considered

- **The classic rules (one die, no choice):** pure luck; easy, normal and hard would play the
  same. Two dice and a pick keep the board and the fun, and add a real choice.
- **Two tokens each (pick which one moves):** more to track on a 100-square board; one token and
  a pick of the dice is simpler to read and as fast to teach.
- **A double rolls again, landing on a token bumps it:** more rules to learn for little gain.

## UI

- **Match:** the 10 × 10 board (1 at the bottom left, the rows snake up), wooden ladders and
  coloured snakes, a Start strip below it, a token per seat (red, blue, green, yellow) that slides
  to its square. Below: two dice in a roll button ("Tap to roll", "You rolled 3 and 5"), then a
  button per pick ("Move 8, ladder to 46"). Kid mode glows the roll and the picks, and Hint names a
  pick. Each chip says "At the start" or "On 27".
- **Hub:** the box's picture is a small board with a ladder and a snake.

## Design

- `site/games/snakes-ladders/rules.js` and `view.js`, a line in `index.json`, the emblem in
  `cards.js` and the board's styles in `app.css`. The room and the Worker change nothing. The view
  imports `JUMPS` and `land` from its rules.
- The layout is our own: 7 ladders and 9 snakes, no jump ends on another's start or on 100.
- The CPU: easy picks at random; normal takes the pick that ends highest; hard adds a look at the
  36 next rolls from there (the average best end, a reachable 100 counted high). Normal beats
  easy in about 94 of 100 two-player matches, hard beats normal in about 54. A match is about 10
  turns each. A hard move takes under 1 ms.

## Rollout and rollback

- Ships with the release; nothing new is stored. The game folder loads on first play and is cached
  for offline. A rollback restores the previous version; a score kept under `snakes-ladders` stays
  in the browser.

## Docs and clean-up

- `docs/spec.md` (AC1.1, US13, the games table, the CPU levels), `README.md`, `DESIGN.md`,
  `AGENTS.md`, `CHANGELOG.md`.

## Tasks

- [x] T1 [US13] The rules: two dice and a pick, ladders, snakes, the exact 100, the CPU — files:
  `site/games/snakes-ladders/rules.js`, `tests/unit/snakes-ladders.test.ts`,
  `tests/unit/games.test.ts` — verifies: AC13.1, AC13.2, AC13.3, AC1.3, AC1.4, AC1.5
- [x] T2 [US13] The screen: the board, the dice, a button per pick, the glowing squares, the
  picture on the box — files: `site/games/snakes-ladders/view.js`, `site/games/index.json`,
  `site/lib/cards.js`, `site/lib/app.css`, `tests/e2e/games.spec.ts` — verifies: AC13.1, AC1.1

## Verification

- `make verify` passes. `docs/spec.md` is updated to match this change.
