---
change: 5
app: games
title: "Games that feel alive: a turn banner, how to play, a CPU cue, deal and capture moves, a win moment"
bump: minor
released: v0.4.0
task: aayush-t-apps/shipify#624
---

# 0005: Games that feel alive: a turn banner, how to play, a CPU cue, deal and capture moves, a win moment

## Why

A match works, but it feels flat: the turn shows only as a small line of text, a CPU's pause looks
like a freeze, a new player gets no help with the rules, and a win goes straight to a list of
places. Small, quiet motion and one short card fix this, with no new files and no downloads.

## Spec changes

### Added

- AC1.6 WHEN the turn passes to a person THE APP SHALL show a short banner over the board with
  whose turn it is ("Your turn", "Sam's turn"); not when the pass screen already says it.
- AC1.7 WHEN a CPU seat is on its turn THE APP SHALL show three moving dots in its chip.
- AC1.8 WHEN a match ends THE APP SHALL show the result in a banner over the board first, with a
  short burst of confetti for a win on this device or any win among friends (not for a draw), then
  the Result screen.
- AC4.5 WHEN I open Setup for a game THE APP SHALL show a **How to play** card of 2 to 4 short
  steps, open until this device has finished a match of that game, and closed (but there) after.

### Changed

- The moves have motion (DESIGN.md's "one memorable element"): a match's first cards, tiles or
  answers are dealt in one after another; a card you draw or get slides into your hand; a Ludo
  token slides from its last square, and a captured one flies back to its base; the die rolls;
  a Memory pair glows as it leaves; a new Go Fish book pops; the winning Four in a Row line shines.
- `index.json` gains `how`: each game's how-to-play steps.
- A view's `ctx` gains `first`: true on a match's first draw, so a view forgets the last match.

### Removed

- None.

## Alternatives considered

- **A how-to-play dialog over the first match:** it fights the pass screen and the CPU's first
  move. A card on Setup is read before Start, and stays one tap away.
- **Remember "seen" in the store:** a new field in `games.v1`. "No finished match of this game"
  says the same with the data already kept.
- **An animation library, or moving elements between draws (FLIP):** more code and weight. Each
  draw makes new elements, so a CSS keyframe from the old place (`--dx`, `--dy`) is enough.

## UI

- **Setup:** a felt **How to play** card under the game's one-line about.
- **Match:** the banner (a paper pill at the top of the board, about 1.4 s, never in the way of a
  tap); the CPU's chip dots; the deal and the move animations above. The result banner sits in
  the middle of the board for 1.5 s, then the Result screen, whose heading pops in on a win.
- **States:** with `prefers-reduced-motion`, nothing moves: the banner shows and goes, the dots
  stand still. The banner is hidden from screen readers: the turn line and the live region already
  say the same.

## Design

- All in `site/lib/app.js` (`banner()`, the chip's `thinking` class, the deal after the first
  render), `site/lib/app.css` (keyframes) and the views' own small memory of the last draw (Ludo's
  token places and die, Memory's faces, the hand in Crazy Eights and Go Fish). No rules, engine,
  message, store or server change. Online play gets the same screens.
- Size: about 2 KB more CSS and JS in the shell; Crazy Eights and Ludo grow by 1 KB each.

## Rollout and rollback

- Ships with the release; nothing is stored. A rollback restores the previous version.

## Docs and clean-up

- `docs/spec.md` (AC1.6–AC1.8, AC4.5, `ctx.first`, `index.json`'s `how`), `DESIGN.md` (motion and
  states), `CHANGELOG.md`. Ludo's unused `left`/`top` transition is removed (a token is drawn
  new each time, so it never ran).

## Tasks

- [x] T1 [US1] The turn banner, the CPU's dots and the win banner — files: `site/lib/app.js`,
  `site/lib/app.css` — verifies: AC1.6, AC1.7, AC1.8
- [x] T2 [US4] How to play on Setup — files: `site/lib/app.js`, `site/games/index.json` —
  verifies: AC4.5
- [x] T3 [US1] Deal and capture motion — files: `site/lib/app.css`, `site/games/*/view.js` —
  verifies: the Changed list

## Verification

- `make verify` passes (`tests/e2e/games.spec.ts` checks the card, the banner and the CPU's dots;
  `tests/unit/games.test.ts` the `how` steps). `docs/spec.md` is updated to match this change.
