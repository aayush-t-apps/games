# Games

Six classic games for any device: Crazy Eights, Go Fish, Memory, Ludo, Four in a Row and Quiz
Race. Play against the CPU (easy, normal or hard), or pass-and-play with family on one phone or
tablet. It works offline, installs like an app, and has a kid mode with hints and undo. Your own
scores stay in your browser. Play with friends on their own devices in an online room: members
start rooms, and anyone joins with the link, the code or the QR code, with no sign-in.

Open **https://games.app.a69x.in**.

## Play online

1. A member taps **Play online** on a game, picks the seats (CPU seats too) and taps **Start the
   room**.
2. Share the room: show its QR code, read out its 6-letter code, or tap **Share** (or **Copy
   link**). Friends open the link, or tap **Join a room** and type the code, then type a nickname.
   A TV or a big screen can tap **Join as Table** to show the board to everyone.
3. The room's owner taps **Start**. The owner's device runs the match. If it drops, the next
   device takes over; any player can tap **Make me host** (a laptop on Wi-Fi is steadier than a
   phone). A device that drops reconnects by itself, and a player away for 60 s on their turn is
   played by the CPU until they're back.
4. At the end, everyone sees the places, the owner can tap **Rematch**, and **Online scores**
   shows each game's top players and last 20 matches.

Rooms end by themselves 6 hours after they start, or 10 minutes after everyone leaves. Up to 8
players and 8 watchers a room.

## Set up online play (once)

Online play stays hidden until this is done (about 10 minutes). The full steps and why are in
`docs/adr/0001-members-sign-in-with-access.md`, Setup:

1. Cloudflare dashboard: **Zero Trust → Access → Applications → Add an application →
   Self-hosted**, name "Games members". Four destinations on `games.app.a69x.in`, paths `member`,
   `admin`, `api/member/*` and `api/admin/*`. Session: 1 month.
2. One policy: **Allow**, **Emails**: your email and each member's. Login method: **One-time PIN**.
3. Copy the team domain (`<team>.cloudflareaccess.com`) and the application's **Audience (AUD)
   tag**. Start a task `games: set the Access values <team domain> <AUD tag>`: a run puts them in
   `wrangler.jsonc` (`ACCESS_TEAM`, `ACCESS_AUD`). They aren't secret.
4. GitHub: **games → Settings → Secrets and variables → Actions → New repository secret**:
   `ADMIN_EMAIL`, your email. The next deploy takes it.
5. Check: open `/member`, type your email and the code: the hub shows **Play online**, and
   `/admin` opens. In a private window, `/` shows no sign-in.

**Add or remove a member:** edit the policy's emails in Cloudflare (about a minute). The **Members**
link on `/admin` opens the dashboard.

## The admin page

`/admin` is for the owner only (the member whose email is `ADMIN_EMAIL`):

- **Overview:** live rooms and who started them, matches today, and per game: matches in 7 and 30
  days, average length and players, last played; hints on games to turn off or feature; the app's
  size. **Refresh** loads it again.
- **Games:** turn a game on or off, feature it, move it up or down, **Save** (the hub follows
  within about a minute; a game turned off keeps its scores). **Add a game** opens a task.
- **Rooms:** live rooms, with **Close** (it ends on every device).
- **Scores:** per game, and **Export**: all online data as one JSON file.

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
| Local | `http://localhost:8787` (`make dev`) | you run it: online play works, you're the member and admin |
| Production | `https://games.app.a69x.in` | a PR is merged into `main` (one check, the deploy, then `/health`) |

No PR previews: Cloudflare makes none for a Worker with Durable Objects (the rooms and the Hub).
Review a PR with `make dev`, or live after the merge. `/health` reports the running `version` and
`commit`, and stays outside Access. History: `docs/changes/`, `CHANGELOG.md` and the `vX.Y.Z`
tags.

## Develop

```sh
make setup
make dev        # http://localhost:8787
make verify     # everything CI runs
```

## How it ships

`make verify` runs in full, browser tests too, before a PR opens (`pnpm ship pr`, on the box or the
PC). The Shipify pipeline then runs this app's `make` targets on GitHub only when needed: nothing
for a PR (no previews, above); on `main`, one check (`setup`, `audit`, `verify` without a
browser), then `deploy`, then `/health`, with a rollback if it fails. The Cloudflare side is
`scripts/shipify/cloudflare.mjs`; the deploy makes the `Room` and `Hub` Durable Objects itself.

| Name | Kind | Where |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | GitHub → Settings → Secrets and variables → Actions |
| `CLOUDFLARE_ACCOUNT_ID` | variable | the same place, under the Variables tab |
| `CF_WORKERS_SUBDOMAIN` | variable | the same place (the subdomain in the workers.dev URLs) |
| `ADMIN_EMAIL` | secret (runtime) | the same place: the owner's email, for `/admin` (secret only to keep it private) |

`pnpm ship publish` sets the first three; you add `ADMIN_EMAIL` (Set up online play, step 4).

## Roll back, pause, resume

From shipify: `pnpm ship rollback|pause|resume games --yes`. Or GitHub → Actions → ship → Run
workflow:

- **rollback:** production goes back one version, or to the release tag you enter (`v1.2.0`). Not
  back past 0.2.0: Cloudflare refuses a rollback across the new Durable Object classes, so a bad
  release from then on is fixed forward with a new PR.
- **pause:** takes the URLs offline. Nothing is deleted.
- **resume:** brings the URLs back.

Deploying also turns a URL back on.
