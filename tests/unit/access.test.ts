// The Access check (ADR 0001, AC5.4, AC8.5): tokens signed with a test key, in the shape Access
// signs them, and the team's keys served by a fake fetch.
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessReady,
  checkAccess,
  DEV_EMAIL,
  isAdmin,
  resetKeys,
  TOKEN_HEADER,
  verifyToken,
} from "../../src/worker/access";

const TEAM = "games.cloudflareaccess.com";
const AUD = "aud-tag";
const pair = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const other = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };

const b64 = (data: string | Uint8Array) =>
  Buffer.from(data).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(
  claims: Record<string, unknown>,
  opts: { kid?: string; alg?: string; key?: CryptoKey } = {},
) {
  const head = b64(JSON.stringify({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" }));
  const body = b64(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    opts.key ?? pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64(new Uint8Array(sig))}`;
}

const now = Math.floor(Date.now() / 1000);
const good = {
  aud: [AUD],
  iss: `https://${TEAM}`,
  exp: now + 600,
  nbf: now - 10,
  email: "ana@example.com",
};

let fetches = 0;
const certs = async (url: string) => {
  fetches += 1;
  expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
  return Response.json({ keys: [jwk, { kty: "EC", kid: "ec" }, { kty: "RSA" }] });
};
const env = { ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ADMIN_EMAIL: "Ana@Example.com" };
const req = (token?: string, url = "https://games.example/api/member/me") =>
  new Request(url, { headers: token ? { [TOKEN_HEADER]: token } : {} });

beforeEach(() => {
  resetKeys();
  fetches = 0;
});

describe("Access tokens", () => {
  it("lets a valid token through, with its email", async () => {
    const checked = await checkAccess(req(await sign(good)), env, certs);
    expect(checked).toEqual({ ok: true, caller: { email: "ana@example.com", dev: false } });
  });

  it("refuses a missing token with 401", async () => {
    expect(await checkAccess(req(), env, certs)).toEqual({ ok: false, status: 401 });
  });

  it.each([
    ["a wrong audience", { ...good, aud: ["other"] }],
    ["a wrong issuer", { ...good, iss: "https://evil.cloudflareaccess.com" }],
    ["an expired token", { ...good, exp: now - 1 }],
    ["no expiry", { ...good, exp: undefined }],
    ["a token not valid yet", { ...good, nbf: now + 3600 }],
    ["no email", { ...good, email: "" }],
  ])("refuses %s", async (_, claims) => {
    expect(await checkAccess(req(await sign(claims)), env, certs)).toEqual({
      ok: false,
      status: 401,
    });
  });

  it("refuses a bad signature, another algorithm and a token that isn't one", async () => {
    expect(
      await verifyToken(await sign(good, { key: other.privateKey }), TEAM, AUD, certs),
    ).toBeNull();
    expect(await verifyToken(await sign(good, { alg: "HS256" }), TEAM, AUD, certs)).toBeNull();
    expect(await verifyToken("a.b", TEAM, AUD, certs)).toBeNull();
    expect(await verifyToken("!!.??.**", TEAM, AUD, certs)).toBeNull();
  });

  it("accepts a single audience string too", async () => {
    expect(await verifyToken(await sign({ ...good, aud: AUD }), TEAM, AUD, certs)).toBe(
      "ana@example.com",
    );
  });

  it("keeps the keys, and fetches them again for a new key only after a minute", async () => {
    await verifyToken(await sign(good), TEAM, AUD, certs);
    await verifyToken(await sign(good), TEAM, AUD, certs);
    expect(fetches).toBe(1);
    expect(await verifyToken(await sign(good, { kid: "k2" }), TEAM, AUD, certs)).toBeNull();
    expect(fetches).toBe(1);
    resetKeys();
    expect(await verifyToken(await sign(good, { kid: "k2" }), TEAM, AUD, certs)).toBeNull();
    expect(fetches).toBe(2);
  });

  it("refuses when the keys can't be fetched", async () => {
    const down = async () => new Response("no", { status: 500 });
    expect(await checkAccess(req(await sign(good)), env, down)).toEqual({ ok: false, status: 401 });
  });

  it("is off (503) when Access isn't set up, except for the local developer", async () => {
    expect(await checkAccess(req(), { ACCESS_TEAM: "", ACCESS_AUD: "" })).toEqual({
      ok: false,
      status: 503,
    });
    const local = await checkAccess(req(undefined, "http://localhost:8787/api/member/me"), {});
    expect(local).toEqual({ ok: true, caller: { email: DEV_EMAIL, dev: true } });
    expect(accessReady(req(), {})).toBe(false);
    expect(accessReady(req(undefined, "http://127.0.0.1/x"), {})).toBe(true);
    expect(accessReady(req(), env)).toBe(true);
  });
});

describe("the admin", () => {
  const ana = { email: "ana@example.com", dev: false };
  it("is the member whose email is ADMIN_EMAIL, in any case", () => {
    expect(isAdmin(ana, env)).toBe(true);
    expect(isAdmin({ email: "sam@example.com", dev: false }, env)).toBe(false);
  });

  it("is nobody when ADMIN_EMAIL isn't set, except the local developer", () => {
    expect(isAdmin(ana, { ...env, ADMIN_EMAIL: undefined })).toBe(false);
    expect(isAdmin({ email: DEV_EMAIL, dev: true }, {})).toBe(true);
  });
});
