---
status: accepted
date: 2026-10-31
---

# 0001: Members sign in with Cloudflare Access; guests never sign in

## Context
Online rooms (change 0002) are Durable Objects, so whoever starts a room uses the free plan's
daily limits. Plan v5 lets only members (emails on the owner's list) start rooms, and lets guests
join by link or code with no login. The admin page needs the same sign-in, for the owner only. The
app has no database of people, no email service and, so far, no secrets.

## Assumptions, checked

| Assumption | How it was checked |
|---|---|
| Access (Zero Trust free plan) is free for up to 50 users, with a one-time email code (One-time PIN) that needs no identity provider | Cloudflare's plans page and blog (plan section 15, 2026-10-30) |
| One self-hosted Access application can hold several destinations (paths) on one hostname, and signs the user in to all of them at once; other paths stay public | Cloudflare's "Access wildcard and multi-hostname" blog (web, 2026-10-31). The owner's setup step 5 checks it live |
| Behind Access, each request carries `Cf-Access-Jwt-Assertion`, an RS256 token with `aud`, `iss`, `exp` and `email`; the keys are at `https://<team>/cdn-cgi/access/certs` | Cloudflare's "Validate JWTs" docs; the build's unit tests sign tokens with a test key in the same shape |
| WebCrypto in Workers verifies RS256 with a JWK (`crypto.subtle.importKey("jwk", …)`) | Workers runtime docs; the build's unit tests run it in Node, which has the same API |
| A `fetch` to an Access path with no session gets a redirect to the login page, so the hub can tell signed out from signed in with `redirect: "manual"` | Cloudflare's Access docs; the build checks it locally with the `localhost` rule and live at setup |

## Options
- **A: Cloudflare Access, one app, the Worker checks the token** (+ free, no code for logins or
  sessions, no secret, members are a list in the dashboard / − a dashboard step for the owner,
  50 people at most, the member list lives outside the app)
- **B: our own magic-link sign-in** (+ the list in `/admin` / − an email service and its key,
  sessions to keep and expire, more code to secure)
- **C: a shared room-start password** (+ simplest / − a secret people pass around, nothing to
  remove one person, no admin identity)

## Decision
Chosen **A**. The Worker checks the token on every `/api/member/*` and `/api/admin/*` call, as
well as Access's own path rule, so a mistake in the dashboard can't open them. Admin is the member
whose email equals `ADMIN_EMAIL`. Because the repo is public, `ADMIN_EMAIL` is a runtime secret
(only to keep the email private); `ACCESS_TEAM` and `ACCESS_AUD` are plain `vars`.

## Edge cases
- Access not set up (`ACCESS_TEAM` empty): member and admin calls get 503, the hub hides online
  buttons. On `localhost` only, the caller is `dev@localhost` (member and admin) for `make dev`
  and the tests; production URLs are never `localhost`.
- The keys rotate: an unknown `kid` fetches the keys again, once, then refuses.
- A member is removed: they can't start rooms once their Access session ends; rooms they started
  run to their end, and the admin can close them.
- `ADMIN_EMAIL` missing: `/api/admin/*` refuses everyone (403).
- `/health` and `/.well-known/shipify.json` stay outside the Access app (only the four paths are
  in it), so each deploy's health check still passes and doesn't roll back.

## Setup
The owner does it once, after the build merges (about 10 minutes):

1. In Cloudflare's dashboard: **Zero Trust → Access → Applications → Add an application →
   Self-hosted**. Name: Games members. Add four destinations on `games.app.a69x.in`, with the
   paths `member`, `admin`, `api/member/*` and `api/admin/*`. Session: 1 month.
2. Add one policy: **Allow**, **Emails**: your email and each member's. Login method: **One-time
   PIN** (on by default).
3. Copy the team domain (`<team>.cloudflareaccess.com`) and the application's **Audience (AUD)
   tag**. Send them on the task (`games: set the Access values …`): a run puts them in
   `wrangler.jsonc`'s `vars`. They aren't secret.
4. In GitHub: **games → Settings → Secrets and variables → Actions → New repository secret**:
   `ADMIN_EMAIL`, your email. The next deploy takes it.
5. Check: open `games.app.a69x.in/member`, type your email and the code: the hub shows **Play
   online**, and `/admin` opens on Overview. In a private window, `/` shows no login.

To add or remove a member later, edit the policy's emails (about a minute).

## Docs and clean-up
`docs/spec.md` (the gate), `README.md` (the setup, adding a member), `AGENTS.md` (never log the
token or the email header).

## Consequences
- Easier: no login code, no secret beyond the admin's email, members managed in one list.
- Harder: the member list is in Cloudflare's dashboard, not in `/admin`; more than 50 members
  needs a paid plan or another gate.

## Confirmation
Unit tests: a missing, badly signed, wrong-audience, wrong-issuer or expired token gets 401; a
member who isn't `ADMIN_EMAIL` gets 403 on `/api/admin/*`.
