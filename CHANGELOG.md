# Changelog

All notable changes to this app. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions: [Semantic Versioning](https://semver.org/). Change docs: `docs/changes/`.

## [Unreleased]

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
