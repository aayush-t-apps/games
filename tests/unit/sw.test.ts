// The service worker's release and file list (AC3.1, AC3.3): each release installs as a new worker,
// and the hub shell it saves is every file the hub loads.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../shipify.json";

const sw = readFileSync("site/sw.js", "utf8");
const shell = JSON.parse(
  (sw.match(/const SHELL = (\[[\s\S]*?\]);/)?.[1] ?? "[]").replace(/,\s*\]/, "]"),
) as string[];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe("service worker", () => {
  it("has shipify.json's version, so each release installs a new worker", () => {
    expect(sw).toContain(`const VERSION = "${manifest.version}";`);
  });

  it("saves the whole hub shell: every lib file, the icons, the manifest and the game list", () => {
    const wanted = [
      "/",
      "/manifest.webmanifest",
      "/games/index.json",
      ...files("site/lib").map((f) => f.slice("site".length)),
      ...files("site/icons").map((f) => f.slice("site".length)),
    ];
    expect([...shell].sort()).toEqual([...new Set(wanted)].sort());
    for (const path of shell.filter((p) => p !== "/")) expect(existsSync(`site${path}`)).toBe(true);
  });

  it("is never cached by the browser, so updates are found", () => {
    expect(readFileSync("site/_headers", "utf8")).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
  });

  it("leaves sign-in and Cloudflare's own paths to the network, so Access can sign a member in", () => {
    const handlers: Record<string, (event: unknown) => void> = {};
    const self = {
      location: { origin: "https://games.example" },
      addEventListener: (name: string, fn: (event: unknown) => void) => {
        handlers[name] = fn;
      },
    };
    new Function("self", sw)(self);
    const answered = (path: string) => {
      let used = false;
      handlers.fetch?.({
        request: { method: "GET", mode: "navigate", url: `https://games.example${path}` },
        // The cache isn't here in Node: only whether the worker answers counts.
        respondWith: (answer: Promise<unknown>) => {
          used = true;
          answer.catch(() => {});
        },
      });
      return used;
    };
    for (const path of [
      "/cdn-cgi/access/authorized?nonce=1",
      "/member",
      "/admin",
      "/api/member/me",
    ])
      expect(answered(path), path).toBe(false);
    expect(answered("/r/K7M2QX")).toBe(true);
  });
});
