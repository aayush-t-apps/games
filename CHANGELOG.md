# Changelog

All notable changes to this app. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions: [Semantic Versioning](https://semver.org/). Change docs: `docs/changes/`.

## [Unreleased]

## [0.5.0] - 2026-10-31

### Added

- Sudoku with four levels, Easy to Expert, each with one solution and graded by what it takes to
  solve; notes, repeats in red, a mistakes count, Hint and Undo
  (docs/changes/0006-puzzles-and-simpler-flows.md).
- Crossword: **Today's puzzle** (the same for everyone that day) or a topic (Animals, Food, World,
  Science, Sports, Music, films and books, Words, A mix), with an on-screen keyboard and Hint.
- Back works like an app: one screen back, a question before it leaves a match, and out of the app
  only from the hub.
- The Settings button shows who plays here: the name and **Member** or **Guest**.

### Changed

- Setup: each seat is **CPU** or **Person here** (pass-and-play on this device), the CPU level
  shows only when a CPU plays, and **Play with friends** (Invite friends, sign in, or the offline
  note) is at the bottom. The hub keeps only **Join friends** with a code; sign-in and sign-out are
  in Settings. The room's seats say **Joined**, **Away**, **CPU** or **Waiting for a player**, with
  a chime when someone sits down. Game boxes tilt a little under a tap.

## [0.4.0] - 2026-10-30

### Added

- Games that feel alive (docs/changes/0005-games-feel-alive.md): a banner says whose turn it is; a
  CPU shows thinking dots; a **How to play** card on Setup, open on a game's first play; the result
  shows over the board, with confetti for a win, before the Result screen.
- A logo: a card and a red die on felt, in the bar and as the app's icons.
- Sounds per game: a die rattle, a capture, a token home, a card, a disc. Ludo's die says whose
  roll it is, in that player's colour.

### Changed

- A simpler hub: no name question first; **Play with friends** has a room-code field and **Join**
  right there, **Sign in to invite friends** for members, and **Invite friends** on each game
  (it asks the member's name). **Online scores** and the separate Join screen are gone from the
  hub; **Download all for offline** is in Settings. The name typed on Setup is kept.
- More motion on the table: the deal, a card into your hand, a Ludo token sliding to its square
  and a captured one back to base, the die rolling, a Memory pair leaving, a Go Fish book, the
  winning Four in a Row line; screens fade in. Off with the device's reduced-motion setting.

### Fixed

- Members couldn't sign in: the service worker answered Cloudflare Access's return page
  (`/cdn-cgi/access/authorized`) from its cache, so the sign-in never finished. Members can now
  **Sign out** too.
- Online flows (an audit): a room that ended while a device was away now says "This room has
  ended" instead of "Reconnecting…" for good; a refused **Rematch** says why on the result screen;
  **Start the room** tapped twice makes one room; **Leave the room** while reconnecting keeps the
  seat and says to try again; Back while a room loads no longer opens it over the hub; a lobby
  update keeps the keyboard focus; a player who quits mid-match is "Seat N" in the scores, never a
  blank winner; the friends panel comes back when the device is online again.
- Admin: no signal shows a message instead of "Loading…" for good; a failed **Close** says so;
  reordering after **Save** says "Not saved yet." and keeps the focus on an arrow.

## [0.3.0] - 2026-10-30

### Added

- Online play is on: the owner's Cloudflare Access values are in the config
  (docs/changes/0004-owner-role-and-restore.md).
- The owner role passes on: **Leave the room** opens the seat and gives the controls to the next
  player; when the owner's device drops, they pass after 2 minutes; **Make me the owner** while
  the owner is away.
- `/admin`: the people in each room, tables that sort by column, and **Restore** of all online
  data to a time in the last 30 days (Cloudflare's point-in-time recovery), with **Undo**.

### Changed

- A cleaner hub, lobby, forms, online scores and admin page on phone and desktop.
- A request to `localhost` is always the developer, so `make dev` and the tests work with the
  Access values set.

### Removed

- **Export my data** and **Import a save file** in Settings: a device's own scores stay on it.

### Fixed

- The online match bar showed the word "null".

## [0.2.0] - 2026-10-31

### Added

- Online rooms (docs/changes/0002-online-rooms.md): members sign in with Cloudflare Access and
  start a room; anyone joins by link, code or QR code with a nickname; the owner's controls; the
  match runs on the host device through a `Room` Durable Object, reconnects by itself, moves the
  host on a drop or **Make me host**, and lets the CPU play for a player away 60 s; a big screen
  joins as the **Table**; shared scores in the `Hub` Durable Object.
- The admin page, `/admin` (docs/changes/0003-admin-page.md): Overview, games on or off,
  featured and their order, live rooms with **Close**, scores and **Export**.

### Changed

- The engine sends a public view each round, keeps a snapshot and goes on from one; Crazy Eights
  and Go Fish have a public view with no hand.
- The service worker never keeps `/api/*`, `/member` or `/admin`, keeps the last `/api/catalog`,
  and drops a turned-off game's files.
- No PR previews from now on: a Worker with Durable Objects gets none (Shipify ADR 0068). Review
  with `make dev`.

## [0.1.1] - 2026-10-31

### Changed

- Docs: the proposed design for online rooms, the admin page and members' sign-in
  (docs/changes/0002-online-rooms.md, docs/changes/0003-admin-page.md,
  docs/adr/0001-members-sign-in-with-access.md). No code changes: the build follows its approval.

## [0.1.0] - 2026-10-30

### Added

- Games: classic games on any device, offline (docs/changes/0001-create.md).
