# Games: agent guide

A public hub of six classic card, board and kids' games that anyone plays in a browser or as an installed app, solo against the CPU or pass-and-play, offline, with scores kept on the device.

A Shipify **app** (stack `ts-static` 1.2.0, on Cloudflare Workers). It installs, runs,
tests and deploys on its own through `make`.

## Commands

`make setup` · `make dev` (http://localhost:8787, same as production) · `make verify`
(everything CI checks; it must pass before every push). `make verify` serves its end-to-end
tests on a port of this checkout's own (`E2E_PORT` to choose one), so checkouts can verify in
parallel; two `make dev` at once need different ports. They open the home page; one behind a
sign-in names a public page instead (`export E2E_HOME := /a-public-page` in `project.mk`).

## Layout

- `site/`: the website, served byte for byte (no build step). `site/_headers` sets response
  headers. Formatting tools ignore `site/` and `tools/`.
- `src/shared/`: platform-owned Worker core (`/health`, `/.well-known/shipify.json`, logs,
  request ids). Don't edit it; `ship upgrade` replaces it.
- `tests/unit/` (Vitest, at least 80% coverage) and `tests/e2e/` (Playwright plus axe, and the
  quality bar).
- `Makefile` and `scripts/shipify/`: the Shipify contract for this stack. CI runs only `make`
  targets; `cloudflare.mjs` deploys, previews, rolls back and pauses. Stack-owned: `ship upgrade`
  replaces them. Add project-specific targets in `project.mk`.
- `shipify.json`: project settings (version, kind, stack, staging, URLs, secret names). `ship`
  writes it; don't hand-edit ids. The version lives here, and `make version` copies it into
  `package.json`.

## The games

The design is in `docs/spec.md` (the game interface, the engine and its messages, offline, the
data) and the look in `DESIGN.md`.

- `site/lib/`: the hub shell. `app.js` (the screens), `engine.js` and `net/local.js` (the runner
  and its transport), `rng.js`, `deck.js`, `board.js` (for the rules), `cards.js` (SVG drawn by
  code), `ui.js`, `input.js`, `layout.js`, `store.js`, `install.js`, `app.css`.
- `site/games/<id>/rules.js` and `view.js`, and `site/games/index.json`.
- `site/sw.js`: the service worker.

**The import rule** (a unit test checks it): `rules.js` imports only `site/lib/{rng,deck,board}.js`
and touches no page, network, clock or `Math.random`; only `store.js` touches `localStorage`.

**Add a game** (a task `games: add <name>`): a folder `site/games/<id>/` with only `rules.js`
(the interface in `docs/spec.md`) and `view.js`; a line in `site/games/index.json`, its `kb` the
folder's size in KB rounded up; and the shared tests in `tests/unit/games.test.ts` (add it to
`GAMES`): 200 CPU matches with legal moves to an end, the same match for the same seed, a hard CPU
move under 100 ms, a refused move with a reason, and only what each seat may see.

**Every release:** set `VERSION` in `site/sw.js` to `shipify.json`'s version (a unit test checks
it), so players get the new release. A new file in `site/lib/` or `site/icons/` goes in its `SHELL`
list (a test checks that too). After a change to a game, update its `kb` in `index.json`.

## Storage

None. To keep data, add a stack option (KV for key-value, D1 for SQL, R2 for files, DO for live state and WebSockets) as a change: Shipify's
`stacks/_cloudflare/storage.md` says how.

## Rules

1. Every behaviour change comes with a test. Put logic where it can be unit tested.
2. Never commit secrets or `.dev.vars`. Never log headers, cookies, tokens or request bodies (use
   `src/shared/logger.ts`).
3. Never force-push, push to `production`, or edit `.github/workflows/`: the pipeline is this
   app's own, its stack's (it runs this app's `make` targets), and changes only by `ship upgrade`.
4. Pin new dependencies to exact versions at least 2 days old.
5. Keep `/health` backward compatible. CI checks its `commit` after each deploy.

## History and how to change this app

Read, in this order: `docs/spec.md` (what it is now), `docs/changes/` (why; never edited after
approval), `CHANGELOG.md` and the `vX.Y.Z` tags (what shipped when). Tooling is in shipify; run it
from there.

- **A new or changed story:** a change doc, `pnpm ship change new games <slug>` → fill it in →
  `pnpm ship change check games <n>`. It goes in the same PR as the code. For something hard to
  undo (data, sign-in, a new service), submit the doc alone first
  (`pnpm ship change submit games <n> --yes`) and **wait for the owner to merge it**.
- **A fix or a small tweak:** no change doc. Make it with a test, and add a line under
  `## [Unreleased]`.
- **Ship it:** every change is a PR the owner merges (a preview link when asked); work in a
  worktree for parallel changes.
  `pnpm ship version <checkout> <patch|minor|major>`, then `pnpm ship pr <checkout> --yes`. The
  owner merges it, and it goes live and is tagged. If main moved meanwhile,
  `pnpm ship refresh <checkout>` first.
