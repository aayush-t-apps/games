# Games: design

## Subject, audience, primary job

A games room for a family, kids and friends: on a phone on the sofa, a tablet on the kitchen table,
a laptop, or a TV browser. The one job: pick a game and be playing in two taps, online or not.

## Screens and their one primary action

| Screen | Primary action |
|---|---|
| Hub: "Pick a game", Join friends (a code), the shelf of eight games, scores, install | **Play** (one per game) |
| Setup: How to play, a puzzle's pick, seats (you, then CPU or Person here), CPU level, kid mode, Play with friends | **Start** |
| Match: the felt table, the players, the moves | play a move |
| Result: the places | **Play again** |
| Settings (a bottom sheet on phones): name, kid mode, theme, sound, Download all for offline, Install | **Done** |
| Invite friends (members): your name, seats, CPU seats, level | **Start the room** |
| Join (a room's link): a nickname | **Join** (or **Join as Table**) |
| Lobby (`/r/<code>`): an Invite panel (the code large, its QR code, the link) and a Seats panel (a row per seat, with host and you tags; the host tag is yellow) | **Start** (the host), **Share** (everyone), **Make me host** (only while the host is away) |
| Online scores (after an online match): per game, top players and the last matches | pick a game |
| Admin (`/admin`): Overview (fact cards), Games (a list), Rooms, Scores (Export, Restore) | **Refresh**, **Save**, **Close**, **Export** |

Nothing is asked before the first game: the hub opens on the games. Its **Join friends** panel is
a strip of felt with a room-code field and **Join**. A game's Setup ends with a felt **Play with
friends** part: **Invite friends** for a member, the sign-in link for a guest, or the offline note.
The Settings button on the bar shows who plays here (the name, a **Member** or **Guest** tag), and
Settings holds sign-in, sign-out and Admin. Back goes one screen back. The brand is the logo, a card and a
red die on felt with no text, beside "Games" in the wooden bar. Forms put each label above its
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

Big, crisp cards and pieces, drawn by code in SVG, that move with a short slide: a match's first
cards, tiles or answers are dealt in one after another, a played card slides onto the pile, a card
you draw or get slides into your hand, a disc drops down its column, a Memory tile flips and a
found pair glows as it leaves, a Ludo token slides to its square and a captured one flies back to
its base, the die rolls, a winning Four in a Row line shines. Everything else stays quiet: flat
colour, no shadows, no gradients.

Three small cues keep a match alive: a paper pill at the top of the board says whose turn it is
when the turn passes to a person (about 1.4 s, never in the way of a tap); a CPU on its turn has
three moving dots in its chip; at the end, the result sits in a pill in the middle of the board
for 1.5 s, with a short burst of flat confetti (red, blue, yellow, green) for a win, before the
Result screen. Setup has a felt **How to play** card, open until a game's first finished match.

## States

- **First visit:** no question: the games. The name is "Player" until one is typed for "You" on
  Setup, or on Invite friends.
- **A bad room code:** "A room code is 6 letters and digits, like K7M2QX." under the field.
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

Motion follows `prefers-reduced-motion`: with it, nothing animates (the banners still show and go).
