---
change: 5
app: games
title: "Games that feel alive, a simpler hub, a logo and members' sign-in that works"
bump: minor
released: v0.4.0
task: aayush-t-apps/shipify#624
---

# 0005: Games that feel alive, a simpler hub, a logo and members' sign-in that works

## Why

A match works, but it feels flat: the turn is a small line of text, a CPU's pause looks like a
freeze, a new player gets no help with the rules, and a win goes straight to a list. The hub asks
for a name before anyone plays, and its online panel (**Join a room**, **Online scores**,
**Members: sign in**) confuses a visitor. Members can't sign in at all: the service worker answered
Access's return page from its cache (owner, 2026-10-30). The app also has no real logo.

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
- AC4.6 WHEN I type a name for "You" on Setup and start THE APP SHALL keep it as this device's
  name; the hub asks no name first.
- AC5.7 WHEN Cloudflare Access sends a member back (`/cdn-cgi/access/authorized`) THE APP SHALL
  leave that request to the network (never its service worker's cache), so the sign-in completes.

### Changed

- AC5.1: the hub's panel is **Play with friends**: a room-code field with **Join** for anyone, and
  a **Sign in to invite friends** link (signed out) or **Invite friends** on each game (a member,
  who types their name there). **Online scores** leaves the hub (it stays after an online match).
  The separate Join screen is gone.
- AC3.2: **Download all for offline** moves into Settings.
- The moves have motion: the deal, a card into your hand, a Ludo token sliding from its last square
  (a captured one flies back to base), the die rolling, a Memory pair leaving, a Go Fish book, the
  winning Four in a Row line. Screens fade in. Ludo's die says whose roll it is, ringed in that
  player's colour.
- Sounds per game, made in the browser: a die rattle, a capture, a token home, a card, a disc. A
  view may name one with `sound(move, note)`.
- A new logo (a card and a die on felt, no text), in the top bar and as the app's icons.
- `index.json` gains `how`; a view's `ctx` gains `first` (true on a match's first draw).

### Removed

- The first-visit "Welcome! What should we call you?" form.

## Alternatives considered

- **A how-to-play dialog over the first match:** it fights the pass screen. A card on Setup is
  read before Start and stays one tap away.
- **A list of open rooms on the hub:** a request per visitor and strangers in family rooms. A
  code or a link stays private and costs nothing.
- **Sound files:** downloads. Short tones from Web Audio cost nothing.

## UI

- **Hub:** logo and "Games" in the bar; "Pick a game"; the felt **Play with friends** panel (code
  field, **Join**, the sign-in or Admin link); the games; scores and install.
- **Setup:** a felt **How to play** card. **Invite friends:** "Your name", seats, CPU seats, level.
- **Match:** the turn banner (about 1.4 s, taps go through it), the CPU's dots, the motion, and the
  result banner (1.5 s). With `prefers-reduced-motion`, nothing moves. Banners are hidden from
  screen readers: the turn line and the live region say the same.

## Design

- `site/sw.js`: `/cdn-cgi/` joins `/member` and `/admin` as network only.
- All else is `site/lib/app.js`, `online.js`, `ui.js` (tones), `app.css` (keyframes), the views'
  small memory of their last draw, `index.json` and `site/icons/`. No rules, engine, message,
  store or server change; fewer screens, no new request.

## Rollout and rollback

- Ships with the release; nothing is stored. A rollback restores the previous version, and with it
  the sign-in bug.

## Docs and clean-up

- `docs/spec.md`, `DESIGN.md`, `README.md`, `CHANGELOG.md`. Removed: the welcome form, the Join
  screen, Ludo's unused `left`/`top` transition.

## Tasks

- [x] T1 [US1] Turn banner, CPU dots, result banner, motion and sounds — files: `site/lib/`,
  `site/games/*/view.js` — verifies: AC1.6, AC1.7, AC1.8
- [x] T2 [US4] How to play and the Setup name — files: `site/lib/app.js`, `site/games/index.json` —
  verifies: AC4.5, AC4.6
- [x] T3 [US5] Sign-in through the service worker; the simpler panel — files: `site/sw.js`,
  `site/lib/app.js`, `site/lib/online.js` — verifies: AC5.1, AC5.7
- [x] T4 [US3] Download all in Settings; the logo — files: `site/lib/app.js`, `site/icons/`,
  `site/index.html` — verifies: AC3.2

## Verification

- `make verify` passes (`games.spec.ts`, `online.spec.ts`, `sw.test.ts`, `games.test.ts`).
  `docs/spec.md` is updated to match this change. After the deploy, the owner signs in at
  `/member` once: the hub shows **Invite friends** on each game.
