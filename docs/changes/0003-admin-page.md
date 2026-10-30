---
change: 3
app: games
title: "Admin page: overview, games, rooms and scores"
bump: minor
released: null
task: aayush-t-apps/shipify#616
---

# 0003: Admin page: overview, games, rooms and scores

## Why

With online rooms (change 0002) the owner needs one page to see what is played, turn games on or
off, close a room, and back up the scores. This is the [games plan v5][p], sections 8.8 and 8.10:
read-only stats from the matches the rooms already record, with nothing to set up, no new table
and no polling. Sign-in is the same Access app (docs/adr/0001-members-sign-in-with-access.md).

[p]: https://github.com/aayush-t-apps/shipify/blob/shipify-files/task-613/2026-10-30T14-57-03-920Z/games-plan.md

## Spec changes

### Added

- **US8 (P2): Run the hub (admin)**. As the owner, I want one page to see use and manage the
  games, so that I keep what is played and turn off the rest.
  - AC8.1 WHEN I open `/admin` THE APP SHALL show four tabs, from one `GET /api/admin/stats` per
    open or **Refresh**: **Overview** (live rooms and by which member, matches today; per game:
    type, players, CPU, size, on or off, matches in 7 and 30 days, average length and players,
    last played; matches per type in 30 days; hints "not played in 60 days" and "most played";
    the app's size), **Games**, **Rooms** and **Scores**.
  - AC8.2 WHEN I turn a game off THE APP SHALL take it off the hub within about a minute, refuse
    new rooms for it, keep its scores, and delete its cached files on each device next time it is
    online. I can also mark a game **featured** and move it up or down.
  - AC8.3 WHEN I close a room on **Rooms** THE APP SHALL end it on every device.
  - AC8.4 WHEN I tap **Export** THE APP SHALL download all Hub data as one JSON file.
  - AC8.5 WHEN a signed-in member who isn't `ADMIN_EMAIL` calls `/api/admin/*` THE APP SHALL
    refuse it with 403.

### Changed

- **Hub:** the catalogue's order and **featured** flag sort the game list (featured first).

### Removed

- None.

## Alternatives considered

- An analytics tool or tracking script: another service, and data about people we don't need.
- Counting solo play: a call from every device; left out to keep the setup small (plan 14.7).
- Managing members in `/admin`: needs a Cloudflare API token (a secret). The **Members** link
  opens the Access policy instead.

## UI

- `/admin` (behind Access; the owner only): tabs **Overview** (opens first), **Games** (on/off and
  featured switches, up and down buttons, **Add a game**, which opens a new task
  `games: add <name>` on GitHub), **Rooms** (live rooms with **Close**), **Scores** (per game,
  **Export**). A **Members** link to the Access policy. States: loading, not the admin ("This page
  is for the owner"), sign-in not set up.

## Design

- **Routes:** `GET /api/admin/stats`, `GET` and `PUT /api/admin/catalog`, `GET /api/admin/rooms`,
  `DELETE /api/admin/rooms/:code`, `GET /api/admin/export`. Each needs a valid Access token whose
  `email` equals `ADMIN_EMAIL` (case-insensitive); `ADMIN_EMAIL` missing: 403 for everyone.
- **Hub RPC:** `setCatalog`, `liveRooms`, `closeRoom` (the Worker then calls that `Room`'s
  `close`), `stats` (one or two SQL queries over `matches` and `rooms`, one JSON object) and
  `export`. Game details (type, players, size) come from `site/games/index.json` on the page.
- **Files:** `site/admin/index.html` and `site/admin/admin.js`, outside the hub's first load.
- **The catalogue on devices:** the hub reads `/api/catalog` once per open; the service worker
  keeps the last one for offline and deletes a turned-off game's cached files.

## Rollout and rollback

- Ships with 0002 in 0.2.0. Works once the owner's Access setup is done (ADR 0001). Nothing new is
  stored; a rollback is refused across 0002's classes, so roll forward.

## Docs and clean-up

- `docs/spec.md` (the admin page and its routes), `README.md` (what `/admin` does, adding a
  member). None removed.

## Tasks

- [ ] T1 [US8] Admin routes and Hub methods, with the admin check — files: `src/worker/app.ts`,
  `src/worker/objects/hub.ts`, `src/worker/hub-sql.ts` — verifies: AC8.1, AC8.3, AC8.4, AC8.5
- [ ] T2 [US8] The admin page — files: `site/admin/` — verifies: AC8.1, AC8.2, AC8.3, AC8.4
- [ ] T3 [US8] The hub follows the catalogue; the service worker drops a game turned off; e2e: a
  game turned off through the admin API leaves the hub — files: `site/lib/app.js`, `site/sw.js`,
  `tests/` — verifies: AC8.2

## Verification

- `make verify` passes. `docs/spec.md` is updated to match this change.
