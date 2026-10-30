---
change: 1
app: games
title: "Games: classic games on any device, offline"
bump: minor
released: v0.1.0
---

# 0001: Games: classic games on any device, offline

Approved as `shipify/plans/games.plan.md` r1 (hash `4295b09ab092`).

# Games: classic games on any device, offline

## Goal

A game room for family, kids and friends at `games.app.a69x.in`. Anyone opens it in a browser on a
phone, tablet, laptop or TV, or installs it as an app, and plays six classic games solo against the
CPU or pass-and-play on one device, offline. Kid mode teaches. Scores stay in that browser. This is
task 1 of the [games plan v5][p] (task #613): no server state, no sign-in. Online rooms come later
in their own task (#616), through the transport seam below, with no change to the games.

[p]: https://github.com/aayush-t-apps/shipify/blob/shipify-files/task-613/2026-10-30T14-57-03-920Z/games-plan.md

## Out of scope

Online rooms, members, the admin page, the Hub and its scoreboard (task #616). Accounts, chat,
real-time games, gamepads, a big-screen table view, sync between devices (Export and Import move
data instead), commercial game names or art, third-party art, a WebAssembly engine.

## Stories

- **US1 (P1): Play a game against the CPU**. As anyone, I want to pick a game and play it against
  CPU players, so that I can play alone on any device.
  - AC1.1 WHEN I open `/` THE APP SHALL list the six games (Crazy Eights, Go Fish, Memory, Ludo,
    Four in a Row, Quiz Race) from `site/games/index.json`, each with its type, players and ages.
  - AC1.2 WHEN I start a game with 1 human and 1–5 CPU seats (within the game's player range) and a
    level (easy, normal, hard) THE APP SHALL play the match to the end, with CPU moves after a short
    pause, and show the places.
  - AC1.3 WHEN any game is played CPU against CPU from 200 seeds THE APP SHALL make only moves from
    `legalMoves`, end every match with a winner or a draw, and give the same match for the same seed.
  - AC1.4 WHEN a CPU seat chooses a move on hard THE APP SHALL answer within 100 ms on the test box.
  - AC1.5 WHEN a move isn't legal THE APP SHALL refuse it, keep the state, and say why in one line.
- **US2 (P1): Pass-and-play on one device**. As a family at one table, I want to take turns on one
  phone or tablet, so that we play together with no network.
  - AC2.1 WHEN a match has 2 or more human seats THE APP SHALL show whose turn it is, by name, and
    take the move only from that seat's controls.
  - AC2.2 WHEN the next human seat holds hidden cards (Crazy Eights, Go Fish) THE APP SHALL cover
    the screen with "Pass to <name>" and show that seat's hand only after a tap.
  - AC2.3 WHEN I play with the keyboard only THE APP SHALL let me move a focus ring over cards or
    cells with the arrow keys, play with Enter, and hear each turn and move through an ARIA live
    region.
- **US3 (P1): Offline on any device, installable**. As a player on the move, I want the app to open
  and play with no signal, so that a trip or a flight is no problem.
  - AC3.1 WHEN the hub was opened once online and the network is off THE APP SHALL open the hub and
    every game opened before, and play them.
  - AC3.2 WHEN I tap "Download all for offline" THE APP SHALL cache every game and say "All games
    ready offline" only after each one is cached.
  - AC3.3 WHEN a new version is deployed and I open the app online THE APP SHALL show "Update
    ready", and one tap reloads it with the new files, never a mix of old and new.
  - AC3.4 WHEN the browser offers an install (`beforeinstallprompt`) THE APP SHALL show an Install
    button; on iPhone and iPad it SHALL show a short "Share → Add to Home Screen" card instead.
  - AC3.5 WHEN the screen is a narrow phone, a landscape tablet or a desktop THE APP SHALL use the
    compact, wide or desk layout, and a rotation or resize keeps the match going.
- **US4 (P2): Kid mode and my scores**. As a parent, I want a gentle mode for kids and a record of
  wins, so that kids learn and everyone sees their progress.
  - AC4.1 WHEN kid mode is on THE APP SHALL highlight legal moves, show a Hint button (the CPU's move
    for that seat), allow Undo back to the human's last turn, use large targets, and offer only the
    easy level.
  - AC4.2 WHEN a match ends THE APP SHALL add it to that browser's scores (played, won, per game and
    level, and the last 20 results) and show them on the hub, with no network request.
  - AC4.3 WHEN I tap Export THE APP SHALL save one JSON file with my nickname, settings and scores;
    WHEN I import that file on another device THE APP SHALL load it, and refuse a file that isn't
    one, with the reason, changing nothing.
  - AC4.4 WHEN the app starts THE APP SHALL ask for persistent storage (`navigator.storage.persist`).

## Open questions

None.

## UI

Design brief (`DESIGN.md`), in short:
- **Tone:** warm, bold, tactile. A wooden games box and a felt card table, not a casino.
- **Palette:** felt green `#1f5f46`, wood `#8a5a2b`, paper `#f7f4ec`, ink `#1b1b1b`, red `#c0392b`
  and blue `#2457a6` for suits and pieces (Ludo adds yellow `#e0a800` and green `#2e8b57`). Dark
  mode follows the device; a high-contrast theme. Text at least 4.5:1.
- **Type:** the system UI font; large numbers and card ranks in its bold weight.
- **The one memorable element:** big, crisp cards and pieces that move with a short slide.
- **Screens (one primary action each):** Hub (the game list; **Play**), Setup (seats, CPU level,
  kid mode; **Start**), Match (the board; play a move), Result (places; **Play again**), Settings
  (nickname, kid mode, theme, sound, Export and Import, Install).
- **States:** first visit (nickname, optional; "Player" by default), loading a game ("Getting
  Ludo…"), offline (a small "Offline" mark; games not yet cached say "Needs signal once"), "Update
  ready", an old browser ("Please update your browser to play").
- **Layouts:** compact (narrow portrait: board on top, own hand as a fan at the bottom, menus as
  bottom sheets), wide (landscape and tablets: players around the board), desk (adds a side panel
  with the moves log and scores). CSS grid, `clamp()`, container queries and safe-area insets.
- **Mobile:** 360 px, 44 px targets (larger in kid mode). **Offline:** yes. **Installable:** yes.

## Design

### Architecture

```mermaid
flowchart LR
  Device["Any browser: tab or installed app"] -- "first visit, updates" --> W["games Worker: site/ files, /health"]
  Device --> SW["Service worker: versioned cache"]
  SW --> Hub["Hub shell: site/index.html, site/lib/"]
  Hub -- "import() on first play" --> Game["site/games/<id>/rules.js, view.js"]
  Hub --> Engine["engine.js + local transport"]
  Engine --> Game
  Hub --> LS[("localStorage: nickname, settings, scores")]
```

Static files only: the stack's Worker serves `/health`, and every other path is a file from
`site/`, or `index.html` (the stack's single-page fallback).

**The game interface** (every `site/games/<id>/rules.js`), pure and deterministic, with no DOM or
network: metadata `{id, name, version, players: {min, max}, hidden}`, and `init(seats, seed)`,
`view(state, seat)`, `legalMoves(state, seat)`, `apply(state, seat, move)` (throws on an illegal
move), `winner(state)` (`null` or `{places}`), `ai(state, seat, level)`. Randomness is a seeded
generator kept in the state. Each game's screen is `site/games/<id>/view.js`: it draws a view in
SVG into the box and layout it gets, and maps the input layer's actions to moves.

**Shared modules (`site/lib/`):**
- `engine.js`: the host-authoritative runner. It holds the state, takes moves from seats, checks
  them, applies them, sends each seat its view, runs CPU seats, keeps `turn` and `seq`, and keeps
  the history for Undo. It talks to seats only through a transport.
- `net/local.js`: the `local` transport, `send(msg)`, `onMessage(cb)`, `peers()`, in one page. Task
  #616 adds `net/room.js` with the same interface; the engine and the games don't change.
- `rng.js` (seeded), `deck.js` (shuffle, deal, hands, draw and discard piles), `board.js` (grids
  and tracks), `cards.js` (SVG cards and pieces, drawn by code).
- `ui.js` (hint, undo, kid mode, pass screen, live region, sound as short Web Audio tones,
  vibration where the browser has it), `input.js` (pointer and keyboard to actions), `layout.js`
  and `app.css`, `store.js` (`localStorage`, Export, Import), `install.js` (install button, iOS
  card, update prompt).

The import rule, checked by a unit test: `rules.js` imports only `site/lib/{rng,deck,board}.js`;
only `store.js` touches `localStorage`.

**The six games** (all `realtime: false`):

| Game | Type | Players | Notes |
|---|---|---|---|
| Crazy Eights | cards | 2–6 | 52 cards; match suit or rank, an 8 names a suit; first out wins |
| Go Fish | cards | 2–6 | Ask a seat for a rank; books of four; most books wins |
| Memory | kids | 1–4 | Pairs face down; a match scores and plays again. CPU recall by level |
| Ludo | board | 2–4 | A 6 leaves base, captures, safe squares, a 6 plays again |
| Four in a Row | board | 2 | 7×6 grid. The owner's "Connect 4", named generically (no trade names) |
| Quiz Race | kids | 1–4 | Answer a question (maths made from the seed, or a short JSON pack of kids' facts); right moves you a step on a 10-step track; first home wins. CPU right by level (60, 80, 95 %) |

**Offline.** `site/sw.js` holds the app's version (a unit test keeps it equal to `shipify.json`'s),
so each release installs a new service worker. It precaches the hub shell into a cache named for
that version, caches a game folder on its first open, re-fetches the games the old cache had, and
deletes the old cache when it takes over (AC3.3). Every request is cache first, so a match never
mixes versions and an opened app makes no requests. `sw.js` itself is `no-cache` in `_headers`.

### Data

Only in the browser, in `localStorage` key `games.v1`: `{player: {id, nick}, settings: {kid, theme,
sound}, scores: {<game>: {<level>: {played, won}}}, recent: [last 20]}`, about 5 KB. Export and
Import use the same shape with a `format: "games.v1"` field. Nothing on the server; a rollback is
code only. A saved match in progress isn't kept: closing the tab ends it.

`site/games/index.json` lists each game: `id, name, type, players, cpu, ages, teaching, version,
kb`. A unit test checks that every folder has an entry and that `kb` matches the folder's size.

### Failure modes

- A game's files fail to load (offline, never cached): "Needs signal once", and the hub stays.
- A rules error mid-match: the match stops with "Something went wrong. Start again?", logged to the
  console; scores aren't changed.
- `localStorage` is full or blocked (private mode): play works, and Settings says scores can't be
  kept. iPhone Safari may clear a non-installed site's data after 7 days unused: the iOS card says
  to install, or to Export.

### Limits

- The first load is the hub shell and `site/lib/`, inside the 80 KB JS budget; each game loads with
  `import()`, a few tens of KB. Static file requests are free; the Worker sees only `/health`.
- Browsers from about the last 3 years (ES modules, service worker, container queries, Pointer
  Events). Older ones get the "please update" page.

## Tasks

- [ ] T1 [US1] `rng.js`, `deck.js`, `board.js`, the engine with the `local` transport, Undo history
  — files: `site/lib/`, `tests/unit/engine.test.ts`, `tests/unit/deck.test.ts` — verifies: AC1.5,
  AC4.1
- [ ] T2 [US1] The six `rules.js` with `ai()`, the shared CPU-vs-CPU test over 200 seeds, the 100 ms
  check, `index.json` and its size test, the import-rule test — files: `site/games/`,
  `tests/unit/games.test.ts` — verifies: AC1.1, AC1.3, AC1.4
- [ ] T3 [US1] [US2] Hub, Setup, Match and Result screens; the six `view.js`; `cards.js`, `input.js`,
  `ui.js`, the pass screen and live region — files: `site/index.html`, `site/lib/`,
  `site/games/*/view.js` — verifies: AC1.2, AC2.1, AC2.2, AC2.3
- [ ] T4 [US3] Layouts and themes; manifest and icons; `sw.js` with its version test; install
  button, iOS card and update prompt; `_headers` — files: `site/`, `tests/unit/sw.test.ts` —
  verifies: AC3.1, AC3.2, AC3.3, AC3.4, AC3.5
- [ ] T5 [US4] Kid mode, `store.js`, scores on the hub, Export and Import, persistent storage —
  files: `site/lib/store.js`, `site/lib/ui.js`, `tests/unit/store.test.ts` — verifies: AC4.1,
  AC4.2, AC4.3, AC4.4
- [ ] T6 e2e on desktop and phone: Four in a Row to the end vs CPU, Go Fish pass-and-play with the
  pass screen, a keyboard-only match (desktop), offline reload after Download all, kid mode Hint
  and Undo, Export then Import — files: `tests/e2e/` — verifies: AC1.2, AC2.2, AC2.3, AC3.1, AC3.2,
  AC4.1, AC4.3
- [ ] T7 `DESIGN.md`, docs — files: `DESIGN.md`, `README.md`, `docs/spec.md`, `AGENTS.md` —
  verifies: AC1.1

## Docs and clean-up

- `docs/spec.md`: the game interface, the engine and transport seam, the import rule, offline and
  the data shape. `AGENTS.md`: how to add a game (`games: add <name>`: a folder, an `index.json`
  line, the shared tests pass) and to keep `sw.js`'s version in step.
- `README.md`: what it is, how to install on each platform, Export and Import.
- The preset's starter page and its e2e test are replaced.

## Verification

- `make verify` passes, including the quality bar (360 px, tap targets, JS budget, offline reload).
- Production `/health` reports the released commit.
- On a phone: open `games.app.a69x.in`, install, Download all, airplane mode, play Ludo against 3
  CPUs to the end, and see the win in the scores.

## Complexity exceptions

| Deviation | Why | Simpler option rejected |
|---|---|---|
| Every file cache first, by version, not pages network first (quality bar) | A match must never mix old and new game files, and an opened app makes no requests | Network first: a request per file per open, and slow on a weak signal |
| A transport seam with one transport now | Task #616 adds online rooms with no change to the engine or the games | Calling the engine directly: #616 would rewrite every screen |
