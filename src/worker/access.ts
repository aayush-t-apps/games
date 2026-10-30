// Members and the admin sign in with Cloudflare Access (docs/adr/0001-members-sign-in-with-access.md).
// Access puts a signed token on each request it lets through; the Worker checks it again here, so a
// mistake in the dashboard can't open /api/member/* or /api/admin/*. Never log the token or email.

export const TOKEN_HEADER = "cf-access-jwt-assertion";
/** The caller on `make dev` and the tests, when Access isn't set up and the host is local. */
export const DEV_EMAIL = "dev@localhost";

export interface AccessEnv {
  ACCESS_TEAM?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
}

export type Caller = { email: string; dev: boolean };
export type Checked = { ok: true; caller: Caller } | { ok: false; status: 401 | 503 };

type Jwk = JsonWebKey & { kid?: string };
type Fetch = (url: string) => Promise<Response>;

/** The team's public keys, by `kid`, for an hour; an unknown `kid` fetches them again, once. */
const KEYS_TTL_MS = 60 * 60 * 1000;
let cache: { team: string; at: number; keys: Map<string, CryptoKey> } | null = null;

/** Forget the cached keys (tests). */
export function resetKeys(): void {
  cache = null;
}

const isLocal = (url: string) => {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

function decode(part: string): unknown {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

function bytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
}

async function loadKeys(team: string, fetcher: Fetch): Promise<Map<string, CryptoKey>> {
  const res = await fetcher(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access certs: ${res.status}`);
  const { keys = [] } = (await res.json()) as { keys?: Jwk[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    map.set(jwk.kid, key);
  }
  cache = { team, at: Date.now(), keys: map };
  return map;
}

async function keyFor(team: string, kid: string, fetcher: Fetch): Promise<CryptoKey | undefined> {
  const age = cache && cache.team === team ? Date.now() - cache.at : Number.POSITIVE_INFINITY;
  if (age < KEYS_TTL_MS && cache?.keys.has(kid)) return cache.keys.get(kid);
  // A key that isn't there a minute after a fetch isn't a rotation: don't fetch again for it.
  if (age < 60_000) return undefined;
  return (await loadKeys(team, fetcher)).get(kid);
}

/** The email in a valid Access token, or null: signature, `aud`, `iss`, `exp` and `nbf` checked. */
export async function verifyToken(
  token: string,
  team: string,
  aud: string,
  fetcher: Fetch = fetch,
  now = Date.now(),
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = decode(head) as typeof header;
    claims = decode(body) as typeof claims;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const key = await keyFor(team, header.kid, fetcher);
  if (!key) return null;
  const signed = new TextEncoder().encode(`${head}.${body}`);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(sig), signed);
  if (!ok) return null;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const secs = now / 1000;
  if (!auds.includes(aud)) return null;
  if (claims.iss !== `https://${team}`) return null;
  if (typeof claims.exp !== "number" || claims.exp <= secs) return null;
  if (typeof claims.nbf === "number" && claims.nbf > secs + 60) return null;
  if (typeof claims.email !== "string" || !claims.email) return null;
  return claims.email;
}

/** Who calls: a member with a valid Access token, or the local developer when Access is off. */
export async function checkAccess(
  req: Request,
  env: AccessEnv,
  fetcher: Fetch = fetch,
): Promise<Checked> {
  const team = env.ACCESS_TEAM?.trim();
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) {
    return isLocal(req.url)
      ? { ok: true, caller: { email: DEV_EMAIL, dev: true } }
      : { ok: false, status: 503 };
  }
  const token = req.headers.get(TOKEN_HEADER);
  if (!token) return { ok: false, status: 401 };
  try {
    const email = await verifyToken(token, team, aud, fetcher);
    return email ? { ok: true, caller: { email, dev: false } } : { ok: false, status: 401 };
  } catch {
    return { ok: false, status: 401 };
  }
}

/** Whether members can sign in here: Access is set up, or this is the local developer's Worker. */
export function accessReady(req: Request, env: AccessEnv): boolean {
  return Boolean(env.ACCESS_TEAM?.trim() && env.ACCESS_AUD?.trim()) || isLocal(req.url);
}

/** The admin is the member whose email is ADMIN_EMAIL (any case); none set means nobody. */
export function isAdmin(caller: Caller, env: AccessEnv): boolean {
  if (caller.dev) return true;
  const admin = env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(admin) && caller.email.toLowerCase() === admin;
}
