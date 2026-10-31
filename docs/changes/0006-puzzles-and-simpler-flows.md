---
change: 6
app: games
title: "Sudoku and Crossword, and simpler flows"
bump: minor
released: v0.5.0
task: aayush-t-apps/shipify#625
---

# 0006: Sudoku and Crossword, and simpler flows

## Why

The owner (2026-10-31): Back leaves the app instead of going one screen back; nobody can see
whether they are signed in; "Make it a person" adds a "player" who never joined; online parts show
where they don't help, and joining doesn't feel natural. They also asked for Sudoku with levels to
master, and a crossword of today or of a picked topic. Later the same day: a room's "owner" and
"host" are one idea too many ("we don't need that complexity"): a member starts, guests join, all
play.

## Spec changes

### Added

- **US10 (P1): Find my way**. As a player, I want the app to move like an app and say who I am, so
  that I never get lost or wonder whether I'm signed in.
  - AC10.1 WHEN I press Back (browser or phone) THE APP SHALL go one screen back (match → Setup →
    hub) and leave the app only from the hub; WHEN a match is in play it SHALL ask "Leave this
    match?" first, and No keeps the match. **Back to games** goes back through the same history.
  - AC10.2 WHEN online play is set up THE APP SHALL show my name and **Member** or **Guest** on the
    top bar's Settings button; Settings says how I'm signed in, with **Sign in to invite friends**
    or **Sign out** (and **Admin** for the owner).
  - AC10.3 WHEN I set up a local match THE APP SHALL show each other seat as **CPU** or **Person
    here** (pass-and-play on this device), and the CPU level only when a CPU plays.
  - AC10.4 WHEN I open Setup for a game of 2 or more players THE APP SHALL show **Play with
    friends**: **Invite friends** for a member; for a guest, join by code on the hub or sign in;
    offline, "Offline: play against the CPU, or pass this device".
- **US11 (P2): Puzzles to master**. As a player, I want Sudoku and a crossword to play alone at my
  level, so that I get better at them.
  - AC11.1 WHEN I start Sudoku at Easy, Medium, Hard or Expert THE APP SHALL give a grid with one
    solution, graded by what it takes to solve (Easy: naked singles; Medium: hidden singles too;
    Hard and Expert: more, with fewer givens), with notes, Erase, repeats in red and a mistakes count.
  - AC11.2 WHEN I start Crossword with **Today's puzzle** THE APP SHALL give every device the same
    grid that day; WHEN I pick a topic (Animals, Food, World, Science, Sports, Music, films and
    books, Words, or A mix) it SHALL build a new grid from that topic's words and clues.
  - AC11.3 WHEN I play a puzzle THE APP SHALL show **Hint** (one right step) and **Undo**, keep the
    score under its pick (a level or a topic), and say "Solved!" at the end.

### Changed

- AC1.1: the hub lists eight games: the six, then Sudoku and Crossword (type Puzzle).
- AC5.1: the hub's felt panel is **Join friends** (a room-code field and **Join**) for anyone;
  **Invite friends** moves from each game box to that game's Setup (AC10.4), and sign-in, sign-out
  and Admin move to Settings (AC10.2).
- The online lobby says each seat's state in words: **Joined**, **Away**, **CPU**, **Waiting for a
  player**, with a chime when someone sits down.
- The game interface: `init(seats, seed, pick)`; a puzzle's rules say `puzzle: true`, and its
  `index.json` entry has `pick` (`label`, `options`, and `daily` for the option seeded by the date).
- AC5.3, AC5.5, AC6.2, AC6.5: one **Host** role in a room. The member who starts it is the host:
  their device runs the rules and has the controls. **Leave the room** passes the role at once; a
  dropped host device holds the moves ("Waiting for the host…") for 30 s, then the next online
  player is the host. **Make me host** only while the host is away.

### Removed

- The hub's **Invite friends** button on each game, and **Make it a person**.
- The room owner: the owner tag, **Make me the owner**, the 2-minute owner wait, and the
  `take-owner` message (`owner` becomes `control`).

## Alternatives considered

- **A platformer (a jump-and-run like the owner's example):** it needs a real-time loop, which the
  turn-based engine and spec rule out. A later change can add one solo `realtime` game.
- **Crossword clues from the web each day:** a request, a source to trust and nothing offline. A
  built-in word bank and a date seed give the same "today" with no server.
- **A deep link per screen (`/play/<game>`):** more routes for the Worker's fallback and the
  service worker. History entries on `/` give Back with no new paths.

## UI

- **Top bar:** logo; Offline mark; the Settings button shows the name, a Member or Guest tag, ⚙.
- **Hub:** "Pick a game"; **Join friends** (code, **Join**); the shelf of eight; scores; install.
- **Setup:** How to play; a puzzle's pick (Difficulty, or Puzzle); Players with **CPU | Person
  here** per seat; CPU level when a CPU plays; kid mode (not for puzzles); **Start**, **Back to
  games**; **Play with friends** (felt).
- **Sudoku:** the grid, a 1–9 pad with how many are left of each, **Notes**, **Erase**; digits and
  Backspace on a keyboard. **Crossword:** the clue bar with ◀ ▶, the grid, an A–Z keyboard; on a
  wide screen the Across and Down lists.

## Design

- `engine.js` passes `pick` to `init`. `store.js` takes any short level id (`[a-z-]`), so a
  puzzle's pick is its level. `app.js` adds history entries (`{s, game, d}`) and `route()` reads
  them; `home()` goes back `d` entries. Puzzles have one player, so they have no rooms.
- The room keeps one `host` seat and `hostAway` (was `host`, `ownerSeat`, `ownerAway`).
  `hostDropped`, `hostDue` and `takeHost` in `room-logic.ts` hold the rules; the room's one alarm
  rings at `hostAway + HOST_WAIT_MS` (30 s). `PROTOCOL` is 2 in `engine.js` and `room-logic.ts`.
  The Hub changes nothing.
- Each puzzle is a folder of `rules.js` and `view.js`, loaded only when played. Sudoku makes its
  grid from the seed (a solver checks one solution and grades it). Crossword's word bank is in its
  `rules.js`; the grid is built from the seed, and Today's seed is the device's date (20261031).

## Rollout and rollback

- Ships with the release; nothing new is stored on the server. Scores of a puzzle stay in the
  browser under its pick. A rollback restores the previous version; old code reads those scores
  as broken and starts the scores blank, so roll forward instead.
- A room live during the deploy keeps its current host (`upgrade()` drops the owner fields). A tab
  open on the old release gets "This app is out of date. Reload to update." once.

## Docs and clean-up

- `docs/spec.md`, `DESIGN.md`, `README.md`, `AGENTS.md` (eight games, a puzzle's `pick`),
  `CHANGELOG.md`. Removed: the per-game **Invite friends** on the hub, **Make it a person**.

## Tasks

- [x] T1 [US10] Back through history, the name chip, CPU or Person here, Play with friends on Setup
  — files: `site/lib/app.js`, `site/lib/online.js`, `site/lib/app.css`, `site/index.html` —
  verifies: AC10.1, AC10.2, AC10.3, AC10.4
- [x] T2 [US11] Puzzle picks in Setup and the engine; scores under the pick — files:
  `site/lib/engine.js`, `site/lib/store.js`, `site/lib/app.js`, `site/games/index.json` —
  verifies: AC11.3
- [x] T3 [US11] Sudoku — files: `site/games/sudoku/` — verifies: AC11.1
- [x] T4 [US11] Crossword — files: `site/games/crossword/` — verifies: AC11.2
- [x] T5 [US5] One Host role in rooms — files: `src/worker/room-logic.ts`,
  `src/worker/objects/room.ts`, `site/lib/online.js`, `site/lib/net/room.js`,
  `site/lib/engine.js`, `site/lib/app.css` — verifies: AC5.3, AC5.5, AC6.2, AC6.5

## Verification

- `make verify` passes (`games.test.ts` with both puzzles and every pick, `engine.test.ts`,
  `store.test.ts`, `room-logic.test.ts`, `objects.test.ts`, `games.spec.ts`, `online.spec.ts`). `docs/spec.md` is updated to match this
  change.
