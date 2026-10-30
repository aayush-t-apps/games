# Games: design

## Subject, audience, primary job

A games room for a family, kids and friends: on a phone on the sofa, a tablet on the kitchen table,
a laptop, or a TV browser. The one job: pick a game and be playing in two taps, online or not.

## Screens and their one primary action

| Screen | Primary action |
|---|---|
| Hub: the shelf of six games, offline, scores, install | **Play** (one per game) |
| Setup: seats (you, people, CPUs), CPU level, kid mode | **Start** |
| Match: the felt table, the players, the moves | play a move |
| Result: the places | **Play again** |
| Settings (a bottom sheet on phones): name, kid mode, theme, sound, Export, Import, Install | **Done** |
| Start a room (members): seats, CPU seats, level | **Start the room** |
| Join: the room code, or a nickname for a room's link | **Join** (or **Join as Table**) |
| Lobby (`/r/<code>`): an Invite panel (the code large, its QR code, the link) and a Seats panel (a row per seat, with owner, host and you tags) | **Start** (the owner), **Share** (everyone) |
| Online scores: per game, top players and the last matches, in two panels | pick a game |
| Admin (`/admin`): Overview (fact cards), Games (a list), Rooms, Scores (Export, Restore) | **Refresh**, **Save**, **Close**, **Export** |

The hub's online panel is a strip of felt led by **Join a room**. Forms put each label above its
full-width field. Panels are cards: surface colour, a 2 px line border and the 10 px radius. Red
outlines mark what ends something for others (**Close the room**, **Kick**). The admin tables
scroll inside their own box on a phone and sort by a column head (↕, ↑, ↓).

Online, the match keeps its screen, with a thin bar for the room, its host and **Make me host**. A
device that joins as the **Table** shows the board large, with no hand and no side panel.

## Tone

Warm, bold, tactile. A wooden games box and a felt card table, not a casino: no neon, no gold, no
chips. References: a boxed set of family card games, a green baize table, a wooden Ludo board.

## Palette

The tokens are the CSS variables at the top of `site/lib/app.css`.

| Name | Hex | Use |
|---|---|---|
| Felt | `#1f5f46` | the table every match is played on; the hub's card-game boxes |
| Wood | `#8a5a2b` | the top bar, the shelf under each game |
| Paper | `#f7f4ec` | the page; text on felt and wood |
| Ink | `#1b1b1b` | text; black suits |
| Red | `#c0392b` | hearts and diamonds; primary buttons; seat 1 |
| Blue | `#2457a6` | the Four in a Row frame; focus ring; a Ludo colour |
| Yellow `#e0a800`, green `#2e8b57` | | Ludo colours; yellow is also the kid-mode glow |

Dark mode follows the device (deep felt `#0f231a` page, paper text, yellow focus ring). High
contrast is black and white with a yellow focus ring. Text is at least 4.5:1 everywhere: paper on
felt is 6.9:1, white on red 5.4:1, white on wood 5.9:1, red on paper 5.0:1.

## Type

The system UI font only, so nothing downloads. Card ranks, counts and headings in its heaviest
weight (800–900). Sizes: body 1rem; game names 1.35rem; page titles `clamp(1.6rem, 5vw, 2.4rem)`;
Quiz Race's question up to 2.8rem.

## Layout and density

Chosen by the window, not the device (`site/lib/layout.js`):
- **Compact** (narrow portrait, from 360 px): bar, player chips in a row, the table, the message
  line. On the table, the pile at the top and your hand as a fan at the bottom. Settings is a
  bottom sheet.
- **Wide** (landscape, tablets): the players in a column beside the table.
- **Desk** (from 1100 × 600): adds a side panel with the moves log.

Targets are 44 px, 56 px in kid mode. Cards size to the table with container queries
(`--card-w: clamp(52px, 16cqi, 104px)`). Safe-area insets keep the bar clear of a notch.

## The one memorable element

Big, crisp cards and pieces, drawn by code in SVG, that move with a short slide: a played card
slides onto the pile, a disc drops down its column, a Memory tile flips, a Ludo token slides to its
square. Everything else stays quiet: flat colour, no shadows, no gradients.

## States

- **First visit:** "Welcome! What should we call you?" with **Save name** and **Skip** (the name
  stays "Player").
- **Loading a game:** "Getting Ludo…".
- **Offline:** an "Offline" mark in the bar; a game not yet saved says "Needs signal once" and its
  Play button is off.
- **Download all:** "Saving the games on this device…", then "All games ready offline", or "Not
  every game could be saved. Connect to the internet and try again."
- **Update ready:** a yellow bar, "Update ready." with **Reload with the update**.
- **A refused move:** one line under the table, for example "Play a card of the same suit or rank,
  or an 8. No card? Draw."
- **Pass-and-play:** a felt screen, "Pass to Sam", with **I'm Sam: show my cards**.
- **A rules error:** "Something went wrong. Start again?" with **Start again**.
- **No scores yet:** "No matches yet. Your wins show up here."
- **Scores not kept** (private mode): Settings says "This browser isn't keeping data (private
  mode?), so your scores won't be kept."
- **An old browser:** "Please update your browser to play."

Motion follows `prefers-reduced-motion`: with it, nothing animates.
