# Games

Six classic games for any device: Crazy Eights, Go Fish, Memory, Ludo, Four in a Row and Quiz
Race. Play against the CPU (easy, normal or hard), or pass-and-play with family on one phone or
tablet. It works offline, installs like an app, and has a kid mode with hints and undo. Scores stay
in your browser: nothing is kept on a server, and there is no sign-in.

Open **https://games.app.a69x.in**.

## Install it

| Device | How |
|---|---|
| Android (Chrome, Edge, Samsung Internet) | Tap **Install** on the games page, or Install app in the browser menu |
| iPhone and iPad | In Safari, tap **Share**, then **Add to Home Screen** |
| Windows, macOS, Linux, ChromeOS (Chrome, Edge) | Click **Install** on the games page, or the install icon in the address bar |
| Mac (Safari 17 or later) | **File → Add to Dock** |
| Firefox, TV browsers | Play in the browser: everything works, with no install |

To play with no signal, open the app once online and tap **Download all for offline** (or open
each game once). On iPhone and iPad, install it to the Home Screen: Safari can clear the scores of
a site that isn't installed after 7 days unused.

## Move your scores: Export and Import

Each browser keeps its own name, settings and scores. To move them, open **Settings** and tap
**Export my data**: this saves `games-save.json`. On the other device, open **Settings**, **Import
a save file**, and pick that file. A file that isn't a Games save is refused, and nothing changes.

## How it's built

`docs/spec.md` (what it does and how), `DESIGN.md` (how it looks), `AGENTS.md` (how to change it
and add a game).

| Environment | URL | Deployed when |
|---|---|---|
| Preview | `https://pr-<n>-games.aayush69work.workers.dev` | a PR gets the label `preview` (a task's `preview` comment adds it) |
| Production | `https://games.app.a69x.in` | a PR is merged into `main` (one check, the deploy, then `/health`) |

`/health` reports the running `version` and `commit`. History: `docs/changes/`, `CHANGELOG.md`
and the `vX.Y.Z` tags.

## Develop

```sh
make setup
make dev        # http://localhost:8787
make verify     # everything CI runs
```

## How it ships

`make verify` runs in full, browser tests too, before a PR opens (`pnpm ship pr`, on the box or the
PC). The Shipify pipeline then runs this app's `make` targets on GitHub only when needed: nothing
for a PR unless it has the label `preview` (then `preview` and `e2e`, and `unpreview` when it
closes); on `main`, one check (`setup`, `audit`, `verify` without a browser), then `deploy`, then
`/health`, with a rollback if it fails. The Cloudflare side is `scripts/shipify/cloudflare.mjs`.

| Name | Kind | Where |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | GitHub → Settings → Secrets and variables → Actions |
| `CLOUDFLARE_ACCOUNT_ID` | variable | the same place, under the Variables tab |
| `CF_WORKERS_SUBDOMAIN` | variable | the same place (the subdomain in the workers.dev URLs) |

`pnpm ship publish` sets all three.

## Roll back, pause, resume

From shipify: `pnpm ship rollback|pause|resume games --yes`. Or GitHub → Actions → ship → Run
workflow:

- **rollback:** production goes back one version, or to the release tag you enter (`v1.2.0`).
- **pause:** takes the URLs offline. Nothing is deleted.
- **resume:** brings the URLs back.

Deploying also turns a URL back on.
